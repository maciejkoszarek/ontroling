#!/usr/bin/env bash
# Stop — when Claude finishes a turn that produced commits or left the
# tree dirty, print a one-line status so the user can glance and move on.
set -euo pipefail

cd "$(dirname "$0")/../.."

# Quiet if nothing at all changed.
if git diff --quiet && git diff --cached --quiet && [ -z "$(git ls-files --others --exclude-standard)" ]; then
  exit 0
fi

branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "?")
changed=$(git status --short | wc -l | tr -d ' ')
last=$(git log -1 --pretty=format:'%h %s' 2>/dev/null || echo "(no commits)")

echo "— session summary —"
echo "  branch:         $branch"
echo "  files changed:  $changed"
echo "  last commit:    $last"
