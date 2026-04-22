---
title: Commit & PR style
owner: release-manager
---

# Commit conventions

## Format — Conventional Commits

```
<type>(<scope>): <imperative subject>

<optional body — wrap at 72>

<optional footer(s)>
Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

**Types** (use these, not others):

| Type | Meaning |
| --- | --- |
| `feat` | User-facing feature or behavior change |
| `fix` | Bug fix |
| `refactor` | No behavior change, readability / structure |
| `perf` | Performance-only change |
| `test` | Adding or changing tests |
| `docs` | Docs / comments / knowledge files |
| `chore` | Tooling, deps, non-code housekeeping |
| `ci` | CI / workflow changes |
| `build` | Build-system / bundler changes |

**Scopes** (open set — use the slice the change is in):

`cockpit`, `pu-detail`, `forecast`, `store`, `parser`, `admin`, `claude`,
`hooks`, `rbac`, `theme`, `routing`, `ingestion`, `scenarios`, …

## Rules

- Subject ≤ 72 chars, imperative ("add X", not "added X").
- Body explains **why**, not **what** — the diff shows the what.
- No `WIP`, no `checkpoint`, no emoji.
- Autonomous commits include the `Co-Authored-By` footer. Human-only commits
  may omit it.
- One logical change per commit. If you accidentally stage two, split with
  `git reset HEAD <file>` and two separate commits.

## Examples

```
feat(cockpit): add bench headcount KPI card

Pulls bench count from the shared selector rather than re-deriving.
Keeps the Cockpit aligned with /bench.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

```
fix(forecast): correct CCA_SE_TOTAL roll-up for percentage metrics

ARVE_PCT was summing across SE1..SE5 instead of FTE-weighted averaging.
Regression test added in src/lib/forecast.test.ts.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

## What NEVER to do

- `--amend` someone else's commit.
- `--no-verify` to skip hooks.
- `git push --force` without explicit human approval.
- Include secrets in a commit (`.env`, credential files).
- `git add -A` / `git add .` — stage specific files to avoid sensitive or
  unrelated files slipping in.

## PRs

When (eventually) the repo is pushed to a remote, use the body template:

```
## Summary
- <bullet>
- <bullet>

## Test plan
- [ ] typecheck
- [ ] lint
- [ ] unit + integration
- [ ] preview verified
```
