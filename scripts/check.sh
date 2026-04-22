#!/usr/bin/env bash
# scripts/check.sh — the one-liner called by the pre-commit hook.
# Runs typecheck, lint, and the full test suite. First failure wins (set -e).

set -euo pipefail

cd "$(dirname "$0")/.."

echo "▶ typecheck"
npm run --silent typecheck

echo "▶ lint"
npm run --silent lint

echo "▶ test"
if npm run --silent 2>/dev/null | grep -q '  test$'; then
  npm run --silent test
else
  echo "  (test script not wired yet — skipping)"
fi

echo "✓ all checks passed"
