#!/bin/bash
FILE=$(jq -r '.tool_input.file_path // empty' 2>/dev/null)
[[ -z "$FILE" ]] && exit 0
if [[ "$FILE" == *.ts || "$FILE" == *.tsx || "$FILE" == *.js ]]; then
  pnpm prettier --write "$FILE" 2>/dev/null || true
  pnpm eslint --fix "$FILE" 2>/dev/null || true
elif [[ "$FILE" == *.rs ]]; then
  (cd src-tauri && cargo fmt) 2>/dev/null || true
elif [[ "$FILE" == *.md ]]; then
  pnpm prettier --write "$FILE" 2>/dev/null || true
fi
exit 0
