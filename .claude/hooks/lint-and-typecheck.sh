#!/bin/bash
run_check() {
    output=$("$@" 2>&1)
    local exit_code=$?
    if [ $exit_code -ne 0 ]; then
        echo "$output" >&2
        exit $exit_code
    fi
}

run_check pnpm turbo run lint lint:rust typecheck
