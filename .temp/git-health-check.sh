#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

tracked_bad="$(git ls-files | rg '(^|/)(node_modules|\.DS_Store)(/|$)' || true)"

if [[ -n "$tracked_bad" ]]; then
  echo "Tracked repository hygiene violations detected:"
  echo "$tracked_bad"
  exit 1
fi

echo "Git hygiene check passed."
