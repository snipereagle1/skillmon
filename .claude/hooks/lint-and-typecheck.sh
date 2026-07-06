#!/bin/bash
cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}" || exit 0

# Skip the full turbo run when nothing lint-able changed (pure Q&A stops).
git status --porcelain | grep -qE '\.(rs|ts|tsx|js|mjs|json|toml)$' || exit 0

output=$(pnpm turbo run lint lint:rust typecheck 2>&1)
exit_code=$?

if [ $exit_code -ne 0 ]; then
    echo "$output"
    exit 2
fi
