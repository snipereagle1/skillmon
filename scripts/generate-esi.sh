#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ESI_DIR="$REPO_ROOT/src-tauri/src/esi"

cd "$ESI_DIR"

echo "Downloading ESI OpenAPI schema..."
curl -sS "https://esi.evetech.net/meta/openapi.json" -o openapi.json

echo "Generating types..."
oas3-gen generate types -i openapi.json -o types.rs --exclude get_meta_changelog

echo "Generating client..."
oas3-gen generate client -i openapi.json -o client.rs --exclude get_meta_changelog

echo "Adding types import to client.rs..."
sed -i '/^use validator::Validate;/a use super::types::*;' client.rs

echo "Suppressing unused code warnings..."
sed -i '1a #![allow(dead_code)]' types.rs
sed -i '1a #![allow(dead_code)]' client.rs

echo "Done! Generated types.rs and client.rs in $ESI_DIR"

