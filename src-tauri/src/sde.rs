use std::{
    collections::HashMap,
    path::{Path, PathBuf},
};

use anyhow::{Context, Result};
use futures_util::StreamExt;
use serde::Deserialize;
use serde_json::Value;
use sqlx::{QueryBuilder, Row, Sqlite, SqliteConnection, SqlitePool};
use tauri::{AppHandle, Manager};
use tokio::{
    fs,
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
};
use zip::ZipArchive;

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

type GroupInsertRow = (i64, Option<i64>, String, Option<i64>, bool);
type TypeInsertRow = (
    i64,
    i64,
    Option<i64>,
    String,
    Option<String>,
    bool,
    Option<i64>,
    Option<i64>,
    Option<f64>,
    Option<f64>,
    Option<f64>,
    Option<f64>,
);
type DogmaAttributeInsertRow = (
    i64,
    Option<i64>,
    Option<i64>,
    Option<f64>,
    Option<i64>,
    Option<bool>,
    Option<bool>,
    Option<bool>,
    String,
    Option<String>,
);
type DogmaEffectInsertRow = (
    i64,
    String,
    Option<i64>,
    Option<bool>,
    Option<bool>,
    Option<bool>,
);
type CharacterAttributeInsertRow = (i64, String, Option<String>, Option<String>, Option<i64>);

#[derive(Debug, Deserialize)]
struct LatestBuild {
    #[serde(rename = "buildNumber")]
    build_number: i64,
    #[serde(rename = "releaseDate")]
    release_date: String,
}

#[derive(Debug, Deserialize)]
struct CategoryRow {
    #[serde(rename = "_key")]
    id: i64,
    name: Option<Value>,
    published: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct GroupRow {
    #[serde(rename = "_key")]
    id: i64,
    #[serde(rename = "categoryID")]
    category_id: Option<i64>,
    name: Option<Value>,
    #[serde(rename = "iconID")]
    icon_id: Option<i64>,
    published: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct TypeRow {
    #[serde(rename = "_key")]
    id: i64,
    #[serde(rename = "groupID")]
    group_id: i64,
    #[serde(rename = "categoryID")]
    category_id: Option<i64>,
    name: Option<Value>,
    description: Option<Value>,
    published: Option<bool>,
    #[serde(rename = "marketGroupID")]
    market_group_id: Option<i64>,
    #[serde(rename = "iconID")]
    icon_id: Option<i64>,
    radius: Option<f64>,
    volume: Option<f64>,
    #[serde(rename = "portionSize")]
    portion_size: Option<f64>,
    mass: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct DogmaAttributeRow {
    #[serde(rename = "_key")]
    id: i64,
    #[serde(rename = "attributeCategoryID")]
    attribute_category_id: Option<i64>,
    #[serde(rename = "dataType")]
    data_type: Option<i64>,
    #[serde(rename = "defaultValue")]
    default_value: Option<f64>,
    #[serde(rename = "displayName")]
    display_name: Option<Value>,
    #[serde(rename = "highIsGood")]
    high_is_good: Option<bool>,
    stackable: Option<bool>,
    published: Option<bool>,
    #[serde(rename = "unitID")]
    unit_id: Option<i64>,
    name: String,
}

#[derive(Debug, Deserialize)]
struct DogmaEffectRow {
    #[serde(rename = "_key")]
    id: i64,
    name: String,
    #[serde(rename = "effectCategoryID")]
    effect_category_id: Option<i64>,
    #[serde(rename = "isOffensive")]
    is_offensive: Option<bool>,
    #[serde(rename = "isAssistance")]
    is_assistance: Option<bool>,
    published: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct TypeDogmaRow {
    #[serde(rename = "_key")]
    id: i64,
    #[serde(default, rename = "dogmaAttributes")]
    dogma_attributes: Vec<DogmaAttributeValue>,
    #[serde(default, rename = "dogmaEffects")]
    dogma_effects: Vec<DogmaEffectValue>,
}

#[derive(Debug, Deserialize)]
struct DogmaAttributeValue {
    #[serde(rename = "attributeID")]
    attribute_id: i64,
    value: f64,
}

#[derive(Debug, Deserialize)]
struct DogmaEffectValue {
    #[serde(rename = "effectID")]
    effect_id: i64,
    #[serde(rename = "isDefault")]
    is_default: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct CharacterAttributeRow {
    #[serde(rename = "_key")]
    id: i64,
    name: Option<Value>,
    description: Option<String>,
    #[serde(rename = "shortDescription")]
    short_description: Option<String>,
    #[serde(rename = "iconID")]
    icon_id: Option<i64>,
}

pub async fn ensure_latest(app: &AppHandle, pool: &SqlitePool) -> Result<()> {
    ensure_latest_inner(app, pool, false).await
}

pub async fn force_refresh(app: &AppHandle, pool: &SqlitePool) -> Result<()> {
    ensure_latest_inner(app, pool, true).await
}

async fn ensure_latest_inner(app: &AppHandle, pool: &SqlitePool, force: bool) -> Result<()> {
    let latest = fetch_latest_build().await?;

    if !force {
        if let Some(current) = current_build(pool).await? {
            if current == latest.build_number {
                return Ok(());
            }
        }
    }

    let sde_dir = app
        .path()
        .app_data_dir()
        .context("failed to resolve app data directory")?
        .join("sde");

    fs::create_dir_all(&sde_dir)
        .await
        .context("failed to create sde data directory")?;

    let zip_path = sde_dir.join(format!(
        "eve-online-static-data-{}-jsonl.zip",
        latest.build_number
    ));

    download_zip(&latest, &zip_path).await?;

    let extracted_paths = extract_selected_files(&zip_path, &sde_dir).await?;

    import_from_files(pool, &extracted_paths, &latest).await?;

    // Clean up temporary files after successful import
    fs::remove_file(&zip_path).await.ok();
    for path in extracted_paths.values() {
        fs::remove_file(path).await.ok();
    }

    Ok(())
}

async fn fetch_latest_build() -> Result<LatestBuild> {
    let response = reqwest::get(LATEST_METADATA_URL).await?;
    if !response.status().is_success() {
        anyhow::bail!("failed to fetch SDE metadata: {}", response.status());
    }
    let text = response.text().await?;
    let build: LatestBuild =
        serde_json::from_str(&text).context("failed to parse SDE metadata response")?;
    Ok(build)
}

async fn current_build(pool: &SqlitePool) -> Result<Option<i64>> {
    let row = sqlx::query::<Sqlite>("SELECT build_number FROM sde_metadata LIMIT 1")
        .fetch_optional(pool)
        .await?;
    Ok(row.map(|r| r.get::<i64, _>(0)))
}

async fn download_zip(latest: &LatestBuild, zip_path: &Path) -> Result<()> {
    let url = ZIP_URL_TEMPLATE.replace("{build}", &latest.build_number.to_string());
    let response = reqwest::get(&url).await?;

    if !response.status().is_success() {
        anyhow::bail!("failed to download SDE zip {}: {}", url, response.status());
    }

    let mut stream = response.bytes_stream();
    let mut file = fs::File::create(zip_path)
        .await
        .with_context(|| format!("failed to create {}", zip_path.display()))?;

    while let Some(chunk) = stream.next().await {
        let data = chunk?;
        file.write_all(&data).await?;
    }

    file.flush().await?;
    Ok(())
}

async fn extract_selected_files(
    zip_path: &Path,
    output_dir: &Path,
) -> Result<HashMap<String, PathBuf>> {
    let zip_path = zip_path.to_path_buf();
    let output_dir = output_dir.to_path_buf();

    tokio::task::spawn_blocking(move || -> Result<HashMap<String, PathBuf>> {
        let file = std::fs::File::open(&zip_path)
            .with_context(|| format!("failed to open zip at {}", zip_path.display()))?;
        let mut archive = ZipArchive::new(file)
            .with_context(|| format!("failed to read zip archive {}", zip_path.display()))?;

        let mut paths = HashMap::new();

        for name in TARGET_FILES {
            let mut entry = archive
                .by_name(name)
                .with_context(|| format!("missing {} in archive", name))?;
            let out_path = output_dir.join(name);
            if let Some(parent) = out_path.parent() {
                std::fs::create_dir_all(parent)
                    .with_context(|| format!("failed to create {}", parent.display()))?;
            }
            let mut out_file = std::fs::File::create(&out_path)
                .with_context(|| format!("failed to create {}", out_path.display()))?;
            std::io::copy(&mut entry, &mut out_file)
                .with_context(|| format!("failed to extract {} to {}", name, out_path.display()))?;
            paths.insert((*name).to_string(), out_path);
        }

        Ok(paths)
    })
    .await?
}

async fn import_from_files(
    pool: &SqlitePool,
    files: &HashMap<String, PathBuf>,
    latest: &LatestBuild,
) -> Result<()> {
    let categories = files
        .get("categories.jsonl")
        .context("categories.jsonl path missing")?;
    let groups = files
        .get("groups.jsonl")
        .context("groups.jsonl path missing")?;
    let types = files
        .get("types.jsonl")
        .context("types.jsonl path missing")?;
    let dogma_attributes = files
        .get("dogmaAttributes.jsonl")
        .context("dogmaAttributes.jsonl path missing")?;
    let dogma_effects = files
        .get("dogmaEffects.jsonl")
        .context("dogmaEffects.jsonl path missing")?;
    let type_dogma = files
        .get("typeDogma.jsonl")
        .context("typeDogma.jsonl path missing")?;
    let character_attributes = files
        .get("characterAttributes.jsonl")
        .context("characterAttributes.jsonl path missing")?;

    let mut tx = pool.begin().await?;

    clear_tables(&mut tx).await?;
    import_categories(&mut tx, categories)
        .await
        .context("failed to import categories")?;
    import_groups(&mut tx, groups)
        .await
        .context("failed to import groups")?;
    import_types(&mut tx, types)
        .await
        .context("failed to import types")?;
    import_dogma_attributes(&mut tx, dogma_attributes)
        .await
        .context("failed to import dogma attributes")?;
    import_dogma_effects(&mut tx, dogma_effects)
        .await
        .context("failed to import dogma effects")?;
    import_type_dogma(&mut tx, type_dogma)
        .await
        .context("failed to import type dogma")?;
    import_character_attributes(&mut tx, character_attributes)
        .await
        .context("failed to import character attributes")?;
    upsert_metadata(&mut tx, latest)
        .await
        .context("failed to update metadata")?;

    tx.commit().await?;
    Ok(())
}

async fn clear_tables(conn: &mut SqliteConnection) -> Result<()> {
    sqlx::query::<Sqlite>("DELETE FROM sde_skill_requirements")
        .execute(&mut *conn)
        .await?;
    sqlx::query::<Sqlite>("DELETE FROM sde_type_dogma_effects")
        .execute(&mut *conn)
        .await?;
    sqlx::query::<Sqlite>("DELETE FROM sde_type_dogma_attributes")
        .execute(&mut *conn)
        .await?;
    sqlx::query::<Sqlite>("DELETE FROM sde_types")
        .execute(&mut *conn)
        .await?;
    sqlx::query::<Sqlite>("DELETE FROM sde_groups")
        .execute(&mut *conn)
        .await?;
    sqlx::query::<Sqlite>("DELETE FROM sde_categories")
        .execute(&mut *conn)
        .await?;
    sqlx::query::<Sqlite>("DELETE FROM sde_dogma_effects")
        .execute(&mut *conn)
        .await?;
    sqlx::query::<Sqlite>("DELETE FROM sde_dogma_attributes")
        .execute(&mut *conn)
        .await?;
    sqlx::query::<Sqlite>("DELETE FROM sde_character_attributes")
        .execute(&mut *conn)
        .await?;
    sqlx::query::<Sqlite>("DELETE FROM sde_metadata")
        .execute(&mut *conn)
        .await?;
    Ok(())
}

async fn import_categories(conn: &mut SqliteConnection, path: &Path) -> Result<()> {
    let file = fs::File::open(path)
        .await
        .with_context(|| format!("failed to open categories file: {}", path.display()))?;
    let reader = BufReader::new(file);
    let mut lines = reader.lines();
    let mut batch = Vec::with_capacity(512);
    let mut line_number = 0;

    while let Some(line) = lines.next_line().await? {
        line_number += 1;
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        let row: CategoryRow = serde_json::from_str(line)
            .with_context(|| format!("failed to parse category line {}: {}", line_number, line))?;
        let name = extract_text(row.name).unwrap_or_default();
        batch.push((row.id, name, row.published.unwrap_or(false)));

        if batch.len() >= 512 {
            insert_categories(conn, &batch)
                .await
                .with_context(|| format!("failed to insert batch at line {}", line_number))?;
            batch.clear();
        }
    }

    if !batch.is_empty() {
        insert_categories(conn, &batch)
            .await
            .with_context(|| format!("failed to insert final batch ({} rows)", batch.len()))?;
    }

    Ok(())
}

async fn insert_categories(
    conn: &mut SqliteConnection,
    rows: &[(i64, String, bool)],
) -> Result<()> {
    if rows.is_empty() {
        return Ok(());
    }

    let mut builder =
        QueryBuilder::<Sqlite>::new("INSERT INTO sde_categories (category_id, name, published) ");

    builder.push_values(rows.iter(), |mut b, row| {
        b.push_bind(row.0).push_bind(&row.1).push_bind(row.2);
    });

    builder
        .build()
        .execute(conn)
        .await
        .map_err(|e| anyhow::anyhow!("SQL error inserting {} category rows: {}", rows.len(), e))?;
    Ok(())
}

async fn import_groups(conn: &mut SqliteConnection, path: &Path) -> Result<()> {
    let file = fs::File::open(path).await?;
    let reader = BufReader::new(file);
    let mut lines = reader.lines();
    let mut batch = Vec::with_capacity(512);

    while let Some(line) = lines.next_line().await? {
        let row: GroupRow = serde_json::from_str(&line)?;
        let name = extract_text(row.name).unwrap_or_default();
        batch.push((
            row.id,
            row.category_id,
            name,
            row.icon_id,
            row.published.unwrap_or(false),
        ));

        if batch.len() >= 512 {
            insert_groups(conn, &batch).await?;
            batch.clear();
        }
    }

    if !batch.is_empty() {
        insert_groups(conn, &batch).await?;
    }

    Ok(())
}

async fn insert_groups(conn: &mut SqliteConnection, rows: &[GroupInsertRow]) -> Result<()> {
    if rows.is_empty() {
        return Ok(());
    }
    let mut builder = QueryBuilder::<Sqlite>::new(
        "INSERT INTO sde_groups (group_id, category_id, name, icon_id, published) ",
    );
    builder.push_values(rows.iter(), |mut b, row| {
        b.push_bind(row.0)
            .push_bind(row.1)
            .push_bind(&row.2)
            .push_bind(row.3)
            .push_bind(row.4);
    });
    builder.build().execute(conn).await?;
    Ok(())
}

async fn import_types(conn: &mut SqliteConnection, path: &Path) -> Result<()> {
    let file = fs::File::open(path).await?;
    let reader = BufReader::new(file);
    let mut lines = reader.lines();
    let mut batch = Vec::with_capacity(256);

    while let Some(line) = lines.next_line().await? {
        let row: TypeRow = serde_json::from_str(&line)?;
        // Keep only published types to trim footprint.
        if !row.published.unwrap_or(false) {
            continue;
        }
        let name = extract_text(row.name).unwrap_or_default();
        let description = extract_text(row.description);

        batch.push((
            row.id,
            row.group_id,
            row.category_id,
            name,
            description,
            row.published.unwrap_or(false),
            row.market_group_id,
            row.icon_id,
            row.radius,
            row.volume,
            row.portion_size,
            row.mass,
        ));

        if batch.len() >= 256 {
            insert_types(conn, &batch).await?;
            batch.clear();
        }
    }

    if !batch.is_empty() {
        insert_types(conn, &batch).await?;
    }

    Ok(())
}

#[allow(clippy::too_many_arguments)]
async fn insert_types(conn: &mut SqliteConnection, rows: &[TypeInsertRow]) -> Result<()> {
    if rows.is_empty() {
        return Ok(());
    }
    let mut builder = QueryBuilder::<Sqlite>::new(
        "INSERT INTO sde_types (type_id, group_id, category_id, name, description, published, market_group_id, icon_id, radius, volume, portion_size, mass) ",
    );
    builder.push_values(rows.iter(), |mut b, row| {
        b.push_bind(row.0)
            .push_bind(row.1)
            .push_bind(row.2)
            .push_bind(&row.3)
            .push_bind(&row.4)
            .push_bind(row.5)
            .push_bind(row.6)
            .push_bind(row.7)
            .push_bind(row.8)
            .push_bind(row.9)
            .push_bind(row.10)
            .push_bind(row.11);
    });
    builder.build().execute(conn).await?;
    Ok(())
}

async fn import_dogma_attributes(conn: &mut SqliteConnection, path: &Path) -> Result<()> {
    let file = fs::File::open(path).await?;
    let reader = BufReader::new(file);
    let mut lines = reader.lines();
    let mut batch = Vec::with_capacity(512);

    while let Some(line) = lines.next_line().await? {
        let row: DogmaAttributeRow = serde_json::from_str(&line)?;
        let display_name = extract_text(row.display_name);
        batch.push((
            row.id,
            row.attribute_category_id,
            row.data_type,
            row.default_value,
            row.unit_id,
            row.high_is_good,
            row.stackable,
            row.published,
            row.name,
            display_name,
        ));

        if batch.len() >= 512 {
            insert_dogma_attributes(conn, &batch).await?;
            batch.clear();
        }
    }

    if !batch.is_empty() {
        insert_dogma_attributes(conn, &batch).await?;
    }

    Ok(())
}

async fn insert_dogma_attributes(
    conn: &mut SqliteConnection,
    rows: &[DogmaAttributeInsertRow],
) -> Result<()> {
    if rows.is_empty() {
        return Ok(());
    }
    let mut builder = QueryBuilder::<Sqlite>::new("INSERT INTO sde_dogma_attributes (attribute_id, attribute_category_id, data_type, default_value, unit_id, high_is_good, stackable, published, name, display_name) ");
    builder.push_values(rows.iter(), |mut b, row| {
        b.push_bind(row.0)
            .push_bind(row.1)
            .push_bind(row.2)
            .push_bind(row.3)
            .push_bind(row.4)
            .push_bind(row.5)
            .push_bind(row.6)
            .push_bind(row.7)
            .push_bind(&row.8)
            .push_bind(&row.9);
    });
    builder.build().execute(conn).await?;
    Ok(())
}

async fn import_dogma_effects(conn: &mut SqliteConnection, path: &Path) -> Result<()> {
    let file = fs::File::open(path).await?;
    let reader = BufReader::new(file);
    let mut lines = reader.lines();
    let mut batch = Vec::with_capacity(512);

    while let Some(line) = lines.next_line().await? {
        let row: DogmaEffectRow = serde_json::from_str(&line)?;
        batch.push((
            row.id,
            row.name,
            row.effect_category_id,
            row.is_offensive,
            row.is_assistance,
            row.published,
        ));

        if batch.len() >= 512 {
            insert_dogma_effects(conn, &batch).await?;
            batch.clear();
        }
    }

    if !batch.is_empty() {
        insert_dogma_effects(conn, &batch).await?;
    }

    Ok(())
}

async fn insert_dogma_effects(
    conn: &mut SqliteConnection,
    rows: &[DogmaEffectInsertRow],
) -> Result<()> {
    if rows.is_empty() {
        return Ok(());
    }
    let mut builder = QueryBuilder::<Sqlite>::new(
        "INSERT INTO sde_dogma_effects (effect_id, name, effect_category_id, is_offensive, is_assistance, published) ",
    );
    builder.push_values(rows.iter(), |mut b, row| {
        b.push_bind(row.0)
            .push_bind(&row.1)
            .push_bind(row.2)
            .push_bind(row.3)
            .push_bind(row.4)
            .push_bind(row.5);
    });
    builder.build().execute(conn).await?;
    Ok(())
}

async fn import_type_dogma(conn: &mut SqliteConnection, path: &Path) -> Result<()> {
    let file = fs::File::open(path).await?;
    let reader = BufReader::new(file);
    let mut lines = reader.lines();

    let mut attr_batch = Vec::with_capacity(512);
    let mut effect_batch = Vec::with_capacity(512);
    let mut skill_batch = Vec::with_capacity(256);

    // Skill requirement attribute pairs: (requiredSkillN, requiredSkillNLevel)
    // 182/277 = requiredSkill1/Level, 183/278 = requiredSkill2/Level, etc.
    const REQUIREMENTS: &[(i64, i64)] = &[
        (182, 277),   // requiredSkill1, requiredSkill1Level
        (183, 278),   // requiredSkill2, requiredSkill2Level
        (184, 279),   // requiredSkill3, requiredSkill3Level
        (1285, 1286), // requiredSkill4, requiredSkill4Level
        (1289, 1287), // requiredSkill5, requiredSkill5Level
        (1290, 1288), // requiredSkill6, requiredSkill6Level
    ];

    while let Some(line) = lines.next_line().await? {
        let row: TypeDogmaRow = serde_json::from_str(&line)?;

        // Check if this type exists in sde_types (only published types are imported)
        let type_exists: bool = sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS(SELECT 1 FROM sde_types WHERE type_id = ?)",
        )
        .bind(row.id)
        .fetch_one(&mut *conn)
        .await?;

        // Skip dogma data for types that don't exist (unpublished types)
        if !type_exists {
            continue;
        }

        let mut attr_map = HashMap::new();

        for attr in &row.dogma_attributes {
            attr_batch.push((row.id, attr.attribute_id, attr.value));
            attr_map.insert(attr.attribute_id, attr.value);
        }

        for effect in &row.dogma_effects {
            effect_batch.push((row.id, effect.effect_id, effect.is_default.unwrap_or(false)));
        }

        for (skill_attr, level_attr) in REQUIREMENTS {
            if let Some(skill_id_val) = attr_map.get(skill_attr) {
                if *skill_id_val > 0.0 {
                    let level = attr_map.get(level_attr).copied().unwrap_or(0.0);
                    skill_batch.push((row.id, *skill_id_val as i64, level as i64, *skill_attr));
                }
            }
        }

        if attr_batch.len() >= 1024 {
            insert_type_dogma_attributes(conn, &attr_batch).await?;
            attr_batch.clear();
        }
        if effect_batch.len() >= 1024 {
            insert_type_dogma_effects(conn, &effect_batch).await?;
            effect_batch.clear();
        }
        if skill_batch.len() >= 512 {
            insert_skill_requirements(conn, &skill_batch).await?;
            skill_batch.clear();
        }
    }

    if !attr_batch.is_empty() {
        insert_type_dogma_attributes(conn, &attr_batch).await?;
    }
    if !effect_batch.is_empty() {
        insert_type_dogma_effects(conn, &effect_batch).await?;
    }
    if !skill_batch.is_empty() {
        insert_skill_requirements(conn, &skill_batch).await?;
    }

    Ok(())
}

async fn insert_type_dogma_attributes(
    conn: &mut SqliteConnection,
    rows: &[(i64, i64, f64)],
) -> Result<()> {
    if rows.is_empty() {
        return Ok(());
    }
    let mut builder = QueryBuilder::<Sqlite>::new(
        "INSERT INTO sde_type_dogma_attributes (type_id, attribute_id, value) ",
    );
    builder.push_values(rows.iter(), |mut b, row| {
        b.push_bind(row.0).push_bind(row.1).push_bind(row.2);
    });
    builder.build().execute(conn).await?;
    Ok(())
}

async fn insert_type_dogma_effects(
    conn: &mut SqliteConnection,
    rows: &[(i64, i64, bool)],
) -> Result<()> {
    if rows.is_empty() {
        return Ok(());
    }
    let mut builder = QueryBuilder::<Sqlite>::new(
        "INSERT INTO sde_type_dogma_effects (type_id, effect_id, is_default) ",
    );
    builder.push_values(rows.iter(), |mut b, row| {
        b.push_bind(row.0).push_bind(row.1).push_bind(row.2);
    });
    builder.build().execute(conn).await?;
    Ok(())
}

async fn insert_skill_requirements(
    conn: &mut SqliteConnection,
    rows: &[(i64, i64, i64, i64)],
) -> Result<()> {
    if rows.is_empty() {
        return Ok(());
    }
    let mut builder = QueryBuilder::<Sqlite>::new(
        "INSERT INTO sde_skill_requirements (skill_type_id, required_skill_id, required_level, source_attr_id) ",
    );
    builder.push_values(rows.iter(), |mut b, row| {
        b.push_bind(row.0)
            .push_bind(row.1)
            .push_bind(row.2)
            .push_bind(row.3);
    });
    builder.build().execute(conn).await?;
    Ok(())
}

async fn import_character_attributes(conn: &mut SqliteConnection, path: &Path) -> Result<()> {
    let file = fs::File::open(path).await?;
    let reader = BufReader::new(file);
    let mut lines = reader.lines();
    let mut batch = Vec::with_capacity(128);

    while let Some(line) = lines.next_line().await? {
        let row: CharacterAttributeRow = serde_json::from_str(&line)?;
        let name = extract_text(row.name).unwrap_or_default();
        batch.push((
            row.id,
            name,
            row.description,
            row.short_description,
            row.icon_id,
        ));

        if batch.len() >= 256 {
            insert_character_attributes(conn, &batch).await?;
            batch.clear();
        }
    }

    if !batch.is_empty() {
        insert_character_attributes(conn, &batch).await?;
    }

    Ok(())
}

async fn insert_character_attributes(
    conn: &mut SqliteConnection,
    rows: &[CharacterAttributeInsertRow],
) -> Result<()> {
    if rows.is_empty() {
        return Ok(());
    }
    let mut builder = QueryBuilder::<Sqlite>::new(
        "INSERT INTO sde_character_attributes (attribute_id, name, description, short_description, icon_id) ",
    );
    builder.push_values(rows.iter(), |mut b, row| {
        b.push_bind(row.0)
            .push_bind(&row.1)
            .push_bind(&row.2)
            .push_bind(&row.3)
            .push_bind(row.4);
    });
    builder.build().execute(conn).await?;
    Ok(())
}

async fn upsert_metadata(conn: &mut SqliteConnection, latest: &LatestBuild) -> Result<()> {
    sqlx::query(
        "INSERT INTO sde_metadata (build_number, release_date, imported_at) VALUES (?, ?, strftime('%s','now'))",
    )
    .bind(latest.build_number)
    .bind(&latest.release_date)
    .execute(conn)
    .await?;
    Ok(())
}

fn extract_text(value: Option<Value>) -> Option<String> {
    match value {
        Some(Value::String(s)) => Some(s),
        Some(Value::Object(map)) => map
            .get("en")
            .and_then(|v| v.as_str())
            .map(str::to_string)
            .or_else(|| map.values().find_map(|v| v.as_str().map(str::to_string))),
        _ => None,
    }
}
