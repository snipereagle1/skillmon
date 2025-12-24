#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ -z "$1" ]; then
  echo "Error: Version argument required"
  echo "Usage: $0 <version>"
  exit 1
fi

VERSION="$1"

cd "$REPO_ROOT"

echo "Updating version to $VERSION..."

# Update package.json
node -e "const fs = require('fs'); const pkg = JSON.parse(fs.readFileSync('package.json')); pkg.version = '$VERSION'; fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');"
echo "Updated package.json"

# Update tauri.conf.json
node -e "const fs = require('fs'); const config = JSON.parse(fs.readFileSync('src-tauri/tauri.conf.json')); config.version = '$VERSION'; fs.writeFileSync('src-tauri/tauri.conf.json', JSON.stringify(config, null, 2) + '\n');"
echo "Updated src-tauri/tauri.conf.json"

# Update Cargo.toml
node -e "const fs = require('fs'); const content = fs.readFileSync('src-tauri/Cargo.toml', 'utf8'); const updated = content.replace(/^version = \".*\"/m, 'version = \"$VERSION\"'); fs.writeFileSync('src-tauri/Cargo.toml', updated);"
echo "Updated src-tauri/Cargo.toml"

echo "Version update complete!"

