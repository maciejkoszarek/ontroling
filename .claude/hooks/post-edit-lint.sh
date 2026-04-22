#!/usr/bin/env bash
# PostToolUse — lint the single file that was just edited. Scoped so it
# stays fast (< 1s typical) and noisy only for the file under change.
set -euo pipefail

cd "$(dirname "$0")/../.."

file="${CLAUDE_TOOL_FILE_PATH:-}"
case "$file" in
  *.ts|*.tsx|*.js|*.jsx) ;;
  *) exit 0 ;;
esac

if ! out=$(npx --no-install eslint --max-warnings=0 "$file" 2>&1); then
  echo "✗ lint failed: $file" >&2
  echo "$out" | tail -40 >&2
  exit 2
fi

echo "✓ lint clean ($file)"
