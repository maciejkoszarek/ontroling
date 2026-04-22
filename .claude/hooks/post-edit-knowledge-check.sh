#!/usr/bin/env bash
# PostToolUse — remind Claude to keep the knowledge base in sync when it
# edits code in domain-sensitive locations. Non-blocking: prints a notice
# to stderr so the agent sees it but the workflow continues.
set -euo pipefail

cd "$(dirname "$0")/../.."

file="${CLAUDE_TOOL_FILE_PATH:-}"
[ -z "$file" ] && exit 0

notice() {
  echo "ℹ knowledge check: $1" >&2
}

case "$file" in
  src/types.ts)
    notice "types.ts changed — confirm .claude/knowledge/domain/metrics.md and invariants.md still match."
    ;;
  src/lib/forecast.ts)
    notice "forecast.ts changed — confirm .claude/knowledge/architecture/forecast-index.md describes the new behavior."
    ;;
  src/store.ts)
    notice "store.ts changed — confirm .claude/knowledge/architecture/store-shape.md reflects the new slice/action."
    ;;
  src/lib/excelParser.ts)
    notice "excelParser.ts changed — confirm .claude/knowledge/architecture/excel-parser.md and the ADR if the contract shifted."
    ;;
  src/App.tsx|src/router.tsx|src/pages/*.tsx)
    notice "routing or a page changed — confirm .claude/knowledge/architecture/routing.md lists the new route."
    ;;
esac

exit 0
