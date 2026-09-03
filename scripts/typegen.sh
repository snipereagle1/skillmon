#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Prefer a repo-local typeshare so the tool need not be installed globally.
PATH="$REPO_ROOT/.tools/bin:$PATH"

if ! command -v typeshare >/dev/null; then
    echo "typeshare not found. Install it into the repo with:" >&2
    echo "  cargo install --root \"$REPO_ROOT/.tools\" typeshare-cli --version 1.13.4" >&2
    exit 1
fi

typeshare "$REPO_ROOT/src-tauri/src" --lang typescript --output-file "$REPO_ROOT/src/generated/types.ts"
