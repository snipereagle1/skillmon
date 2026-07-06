#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ESI_DIR="$REPO_ROOT/src-tauri/src/esi"
GEN_DIR="$ESI_DIR/generated"

cd "$ESI_DIR"

# Pin the schema to a specific ESI compatibility date. This MUST match the
# `x-compatibility-date` header sent at runtime in src/esi/cached.rs — otherwise ESI
# serves responses shaped differently than the generated types expect. Available dates:
# https://esi.evetech.net/meta/compatibility-dates
COMPATIBILITY_DATE="2026-06-09"

echo "Downloading ESI OpenAPI schema ($COMPATIBILITY_DATE)..."
curl -sS -H "x-compatibility-date: $COMPATIBILITY_DATE" "https://esi.evetech.net/meta/openapi.json" -o openapi.json

# client-mod emits a self-contained module (generated/{mod,client,types}.rs) with the
# `use super::types::*` import and the `mod`/`pub use` wiring generated for us — no
# manual file combining. --no-ordered-collections: emit Vec/HashMap instead of
# indexmap::IndexSet/IndexMap (ESI deserialization does not depend on key/element order,
# and IndexSet pulls in an extra dep plus an oas3-gen bug where set-element structs miss
# Eq/Hash derives).
echo "Generating ESI client module..."
rm -rf "$GEN_DIR"
oas3-gen generate client-mod -i openapi.json -o "$GEN_DIR" --exclude get_meta_changelog --no-ordered-collections

# Clippy suppression for the generated code lives on the `mod generated;` declaration
# in src/esi/mod.rs (`#[allow(clippy::all)]`) — no post-generation patching needed.

echo "Done! Generated ESI module in $GEN_DIR"
