#!/usr/bin/env bash
# PreToolUse(Bash) — block `git commit` unless the full check.sh passes.
# This is the last line of defense: even if the per-edit hooks were
# bypassed or skipped, no commit ever lands with red typecheck / lint /
# test. Non-commit Bash calls pass through immediately.
set -euo pipefail

cd "$(dirname "$0")/../.."

cmd="${CLAUDE_TOOL_COMMAND:-}"
case "$cmd" in
  *"git commit"*) ;;
  *) exit 0 ;;
esac

if ! out=$(bash scripts/check.sh 2>&1); then
  echo "✗ pre-commit check failed — commit blocked" >&2
  echo "$out" | tail -60 >&2
  exit 2
fi

echo "✓ pre-commit checks passed"
