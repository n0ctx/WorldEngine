#!/bin/sh
set -e

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$repo_root"

if command -v codegraph >/dev/null 2>&1; then
  codegraph status >/dev/null 2>&1 || codegraph init -i
  codegraph sync >/dev/null 2>&1 || true
fi

case "${1:-}" in
  claude)
    shift
    exec claude "$@"
    ;;
  codex)
    shift
    exec codex "$@"
    ;;
  *)
    echo "Usage: $0 {claude|codex} [args...]"
    exit 2
    ;;
esac
