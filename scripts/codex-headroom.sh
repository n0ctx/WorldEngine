#!/bin/sh
set -e

cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

if command -v codegraph >/dev/null 2>&1; then
  codegraph status >/dev/null 2>&1 || codegraph init -i
  codegraph sync >/dev/null 2>&1 || true
fi

exec headroom wrap codex -- "$@"
