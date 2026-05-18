#!/bin/bash
output=$(pnpm turbo run lint lint:rust typecheck 2>&1)
exit_code=$?

if [ $exit_code -ne 0 ]; then
    echo "$output"
    exit 2
fi
