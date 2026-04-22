#!/usr/bin/env bash
# PostToolUse — when a *.ts / *.tsx source file is edited, re-run the
# nearest sibling *.test.ts(x) if one exists. Cheap, targeted feedback
# that catches domain regressions fast without blowing up the feedback
# loop on unrelated tests.
set -euo pipefail

cd "$(dirname "$0")/../.."

file="${CLAUDE_TOOL_FILE_PATH:-}"
[ -z "$file" ] && exit 0

case "$file" in
  *.test.ts|*.test.tsx) target="$file" ;;
  *.ts)   target="${file%.ts}.test.ts" ;;
  *.tsx)  target="${file%.tsx}.test.tsx" ;;
  *) exit 0 ;;
esac

[ -f "$target" ] || { exit 0; }

if ! out=$(npx --no-install vitest run "$target" --reporter=default 2>&1); then
  echo "✗ sibling test failed: $target" >&2
  echo "$out" | tail -60 >&2
  exit 2
fi

echo "✓ tests pass ($target)"
