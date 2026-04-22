#!/usr/bin/env bash
# PostToolUse — run after Edit / Write on a .ts or .tsx file.
# Runs an incremental typecheck so feature-developer sees type errors
# within seconds of the edit, not at commit time.
#
# The hook receives the tool invocation payload on stdin; we only need
# the file path, which Claude Code passes as $CLAUDE_TOOL_FILE_PATH.
set -euo pipefail

cd "$(dirname "$0")/../.."

file="${CLAUDE_TOOL_FILE_PATH:-}"
case "$file" in
  *.ts|*.tsx) ;;
  *) exit 0 ;;
esac

if ! out=$(npx --no-install tsc --noEmit --pretty false 2>&1); then
  echo "✗ typecheck failed after editing $file" >&2
  echo "$out" | tail -40 >&2
  exit 2   # blocking — Claude sees stderr and must fix
fi

echo "✓ typecheck clean ($file)"
