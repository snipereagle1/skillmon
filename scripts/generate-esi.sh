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

# The generated mod.rs allows several clippy lints but not every style lint the code
# trips (needless_return, needless_question_mark, ...). A module-level allow propagates
# to the child modules, so one blanket allow on this never-hand-edited module makes
# `clippy -D warnings` pass.
echo "Suppressing clippy warnings on generated code..."
perl -pi -e '$_ = "#![allow(clippy::all)]\n" . $_ if $. == 1' "$GEN_DIR/mod.rs"

echo "Done! Generated ESI module in $GEN_DIR"
