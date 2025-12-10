use std::env;
use tauri_typegen::{GenerateConfig, generate_from_config};

fn main() {
    // Generate TypeScript bindings before build
    // build.rs runs from src-tauri directory, so project_path is "."
    // output_path needs to be relative to workspace root, so we go up one level
    let manifest_dir = env::var("CARGO_MANIFEST_DIR").unwrap();
    let workspace_root = std::path::Path::new(&manifest_dir).parent().unwrap();

    let config = GenerateConfig {
        project_path: manifest_dir.clone(),
        output_path: workspace_root.join("src").join("generated").to_string_lossy().to_string(),
        validation_library: "none".to_string(),
        verbose: Some(true),
        exclude_patterns: Some(Vec::new()),
        include_patterns: Some(Vec::new()),
        include_private: Some(false),
        type_mappings: None,
        visualize_deps: Some(false),
    };

    match generate_from_config(&config) {
        Ok(_) => {
            println!("Successfully generated TypeScript bindings");
        }
        Err(e) => {
            eprintln!("Error: Failed to generate TypeScript bindings: {}", e);
            eprintln!("This is a build error - types must be generated for the frontend to compile.");
            panic!("TypeScript type generation failed");
        }
    }

    tauri_build::build()
}
