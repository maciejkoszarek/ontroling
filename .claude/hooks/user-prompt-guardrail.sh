#!/usr/bin/env bash
# UserPromptSubmit — remind agents of the house rules on every turn. The
# message is injected as a system note, so Claude sees it alongside the
# user's prompt without the user having to retype invariants.
set -euo pipefail

cat <<'NOTE'
house rules (autoloaded every turn):
 1. Obey the knowledge base under .claude/knowledge/ — flag drift, never paper over it.
 2. Domain edits require a matching update to the relevant knowledge or ADR file.
 3. Every edit must leave typecheck, lint, and the affected tests green.
 4. Prefer delegating to the specialist subagent (architect / feature-developer / qa-verifier / …) instead of doing cross-layer work in the main thread.
 5. Preview is the source of truth for UI claims — verify in the browser before reporting "done".
NOTE
