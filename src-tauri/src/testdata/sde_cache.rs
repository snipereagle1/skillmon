use anyhow::Result;
use futures_util::StreamExt;
use serde::Deserialize;
use std::collections::HashMap;
use std::io::Write;
use std::path::{Path, PathBuf};
use tokio::fs;

#[derive(Debug, Deserialize)]
struct LatestBuild {
    #[serde(rename = "buildNumber")]
    build_number: i64,
}

const LATEST_METADATA_URL: &str =
    "https://developers.eveonline.com/static-data/tranquility/latest.jsonl";
const ZIP_URL_TEMPLATE: &str = "https://developers.eveonline.com/static-data/tranquility/eve-online-static-data-{build}-jsonl.zip";
const TARGET_FILES: &[&str] = &[
    "categories.jsonl",
    "groups.jsonl",
    "types.jsonl",
    "dogmaAttributes.jsonl",
    "dogmaEffects.jsonl",
    "typeDogma.jsonl",
    "characterAttributes.jsonl",
];

use lazy_static::lazy_static;
use std::sync::Arc;
use tokio::sync::Mutex;

lazy_static! {
    static ref SDE_LOCK: Arc<Mutex<()>> = Arc::new(Mutex::new(()));
}

pub async fn ensure_sde_cached(cache_dir: &Path) -> Result<HashMap<String, PathBuf>> {
    let _lock = SDE_LOCK.lock().await;
    fs::create_dir_all(cache_dir).await?;

    let mut paths = HashMap::new();
    let mut missing = false;

    for name in TARGET_FILES {
        let path = cache_dir.join(name);
        if !path.exists() {
            missing = true;
        }
        paths.insert(name.to_string(), path);
    }

    if missing {
        println!("SDE files missing from cache, downloading...");
        download_and_extract_sde(cache_dir).await?;
    }

    Ok(paths)
}

async fn download_and_extract_sde(cache_dir: &Path) -> Result<()> {
    let latest = fetch_latest_build().await?;
    let zip_path = cache_dir.join(format!("sde-{}.zip", latest.build_number));

    let url = ZIP_URL_TEMPLATE.replace("{build}", &latest.build_number.to_string());
    let response = reqwest::get(&url).await?;
    if !response.status().is_success() {
        anyhow::bail!("failed to download SDE zip: {}", response.status());
    }

    let mut file = std::fs::File::create(&zip_path)?;
    let mut stream = response.bytes_stream();
    while let Some(item) = stream.next().await {
        let chunk = item?;
        file.write_all(&chunk)?;
    }

    // Extract
    let zip_path_clone = zip_path.clone();
    let cache_dir_clone = cache_dir.to_path_buf();

    tokio::task::spawn_blocking(move || -> Result<()> {
        let file = std::fs::File::open(&zip_path_clone)?;
        let mut archive = zip::ZipArchive::new(file)?;
        for name in TARGET_FILES {
            let mut entry = archive.by_name(name)?;
            let out_path = cache_dir_clone.join(name);
            let mut out_file = std::fs::File::create(&out_path)?;
            std::io::copy(&mut entry, &mut out_file)?;
        }
        Ok(())
    })
    .await??;

    fs::remove_file(&zip_path).await?;

    Ok(())
}

async fn fetch_latest_build() -> Result<LatestBuild> {
    let response = reqwest::get(LATEST_METADATA_URL).await?;
    let text = response.text().await?;
    let build: LatestBuild = serde_json::from_str(&text)?;
    Ok(build)
}
