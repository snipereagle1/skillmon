#!/bin/bash
[[ ! -f .claude/.dirty ]] && exit 0
rm -f .claude/.dirty

run_check() {
    output=$("$@" 2>&1)
    local exit_code=$?
    if [ $exit_code -ne 0 ]; then
        echo "$output" >&2
        exit $exit_code
    fi
}

run_check pnpm lint
run_check pnpm lint:rust
run_check pnpm typecheck
