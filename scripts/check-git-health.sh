#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

conflicts="$(git grep -n -E '^(<<<<<<<|=======|>>>>>>>)' -- . ':(exclude)package-lock.json' ':(exclude)pnpm-lock.yaml' ':(exclude)yarn.lock' || true)"

if [[ -n "$conflicts" ]]; then
  echo "Unresolved merge conflict markers found:"
  echo "$conflicts"
  exit 1
fi

echo "git hygiene check passed"
