#!/usr/bin/env bash
# PreToolUse(Bash) — refuse destructive git / shell operations without
# an explicit human ack. Exits 2 so Claude Code treats the tool call as
# denied and shows the reason.
set -euo pipefail

cmd="${CLAUDE_TOOL_COMMAND:-}"
[ -z "$cmd" ] && exit 0

deny() {
  echo "✗ blocked by destructive-action hook: $1" >&2
  echo "  If this is intentional, ask the user to run the command manually." >&2
  exit 2
}

case "$cmd" in
  *"rm -rf /"*|*"rm -rf ~"*|*"rm -rf \$HOME"*) deny "rm -rf on root or home" ;;
  *"git push --force"*|*"git push -f "*|*"git push --force-with-lease"*) deny "force push" ;;
  *"git reset --hard"*) deny "git reset --hard" ;;
  *"git clean -fd"*|*"git clean -f "*) deny "git clean -f" ;;
  *"git checkout -- ."*|*"git restore ."*) deny "bulk discard of working tree" ;;
  *"git branch -D "*) deny "force-delete branch" ;;
  *"--no-verify"*) deny "--no-verify bypass" ;;
  *"npm publish"*|*"yarn publish"*|*"pnpm publish"*) deny "package publish" ;;
  *"drop table"*|*"DROP TABLE"*) deny "SQL DROP TABLE" ;;
esac

exit 0
