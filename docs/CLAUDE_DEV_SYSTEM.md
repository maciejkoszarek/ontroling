# Ontroling — Claude Code Autonomous Dev System (v2)

> Target: **Opus 4.7** on every agent. Goal: the user describes a change in
> plain English (vibe-coding); Claude Code plans, implements, tests, verifies
> in the browser, and commits — with no per-step babysitting.
>
> This document is the system spec. Every path below is what the repo now
> looks like after phases 1–6 of build-out.

---

## 1. Baseline (as of 2026-04-22)

| Area | State |
| --- | --- |
| Stack | React 18 · TS 5 · Vite 5 · Zustand 5 · Tailwind 3 · ECharts 5 · SheetJS |
| Size | ~9,050 LOC — 19 pages, 11 components, 5 lib files |
| Domain | High — 28 forecast metrics, 10 PUs (+2 virtual), RBAC, Excel ingest |
| Anchoring | `currentPeriod()` is **dynamic** — `new Date()` in `src/lib/utils.ts:74`. Not frozen. |
| Tests / Lint / CI | Added in phases 3 + 4 + (deferred) 8 |

---

## 2. Design principles

1. Knowledge before code — every agent reads `.claude/knowledge/**`;
   `CLAUDE.md` is the always-loaded index.
2. Specialist subagents, not a single "dev".
3. Verification is hook-enforced, not polite — `settings.json` is the only
   layer that guarantees automation.
4. Reversible by default — every autonomous change commits; never auto-pushes;
   destructive bash is denylisted.
5. Preview is source of truth for UI — `preview_*` tools verify every
   UI-visible change.
6. Opus 4.7 everywhere — uniform reasoning depth outweighs token savings.

---

## 3. Agent hierarchy (9)

```
                    ┌─────────────────────────────┐
                    │  Orchestrator (main chat)   │  opus-4-7
                    │  plans · routes · commits   │
                    └──────────────┬──────────────┘
                                   │
   ┌─────────┬────────────┬────────┼────────┬──────────┬──────────────┐
   ▼         ▼            ▼        ▼        ▼          ▼              ▼
architect  domain-   feature-   test-    code-      qa-           data-
          analyst    developer  engineer reviewer   verifier      integrity

                                                  refactor-agent  ◄── on demand
                                                  release-manager ◄── on demand
```

| Agent | Tools | Owns | Never touches |
| --- | --- | --- | --- |
| `architect` | Read, Grep, Glob | `docs/adr/`, structural trade-offs | `src/` |
| `domain-analyst` | Read, Grep, Glob | `.claude/knowledge/domain/*`; answers domain questions | Anything outside knowledge |
| `feature-developer` | Read, Edit, Write, Grep, Glob, Bash | End-to-end `src/` implementation; knowledge write-back | `.claude/agents/`, ADRs |
| `test-engineer` | Read, Edit, Write, Bash | Vitest + RTL (later Playwright) tests | Production code |
| `code-reviewer` | Read, Grep, Glob, Bash(git diff) | Pre-commit diff review | Any writes |
| `qa-verifier` | Read, Bash, `preview_*` | Browser verification | Code edits |
| `data-integrity` | Read, Grep, Bash | Invariants (I1–I28) on live data | Anything else |
| `refactor-agent` | Read, Edit, Grep | On-demand cleanup | Default loop |
| `release-manager` | Read, Edit, Bash | Version/tag/CHANGELOG | Unless user says "release" |

Full system prompts live under [.claude/agents/](../.claude/agents/). Decision
rationale in [ADR-0002](adr/0002-agent-hierarchy.md).

---

## 4. Knowledge schema

```
CLAUDE.md                               # ≤ 200 lines — loaded every turn
.claude/
├── agents/                             # 9 subagent definitions
├── knowledge/
│   ├── domain/                         # glossary · metrics · invariants · rbac · period-model
│   ├── architecture/                   # store-shape · forecast-index · excel-parser · routing · theming
│   ├── conventions/                    # naming · testing · commit-style
│   └── playbooks/                      # add-new-metric · add-new-page · ingest-new-workbook-version · debug-forecast-mismatch
├── hooks/                              # 7 shell scripts (§6)
├── settings.json                       # permissions + hooks + model
└── settings.local.json                 # gitignored user overrides
docs/
└── adr/
    ├── 0001-testing-stack-vitest-rtl.md
    ├── 0002-agent-hierarchy.md
    └── 0003-preview-as-source-of-truth.md
```

## 5. Delegation rules

```
User request
   │
   ├── new feature ──► feature-developer ─► test-engineer ─► code-reviewer ─► qa-verifier ─► commit
   ├── "what/why is X?" ──► domain-analyst
   ├── structural change ──► architect (ADR) ─► feature-developer
   ├── bug report ──► feature-developer (repro → fix → regression test)
   ├── "clean up X" ──► refactor-agent ─► code-reviewer
   ├── data anomaly ──► data-integrity (blocks release if broken)
   └── "ship it" ──► release-manager
```

---

## 6. Hooks (`.claude/settings.json`)

| Event | Matcher | Script | Blocks? |
| --- | --- | --- | --- |
| `PostToolUse` | `Edit\|Write\|MultiEdit` on `src/**/*.ts(x)` | `post-edit-typecheck.sh` | **Yes** |
| `PostToolUse` | `Edit\|Write` on `src/**/*.ts(x)` | `post-edit-lint.sh` | Errors block; warns pass |
| `PostToolUse` | `Edit\|Write` on `src/types.ts`, `src/store.ts`, `src/lib/forecast.ts` | `post-edit-knowledge-check.sh` | Warn only |
| `PostToolUse` | `Write` on `src/**/*.test.ts(x)` | `post-edit-run-test.sh` | **Yes** |
| `PreToolUse` | `Bash(git commit*)` | `pre-commit.sh` → typecheck + lint + full vitest | **Yes** |
| `PreToolUse` | `Bash(git push*)`, `rm -rf`, `--no-verify`, `git reset --hard` | `block-destructive.sh` | **Yes — requires user** |
| `Stop` | — | `stop-summary.sh` | No |
| `UserPromptSubmit` | — | `inject-current-branch.sh` | No |

Why hooks and not "please run typecheck": the harness runs hooks — Claude
can't forget. Preferences in memory are polite suggestions; `settings.json`
is a guarantee.

---

## 7. The vibe-coding loop

```
  User: "Cockpit should show bench headcount as a KPI card."
         │
         ▼
  Orchestrator (opus-4-7): classify · plan · delegate
         │
         ├─► domain-analyst: defines "bench" from knowledge/domain/{glossary,metrics}.md
         │
         ├─► feature-developer: adds selector + KpiCard; updates knowledge/architecture/store-shape.md
         │      └─ HOOKS: typecheck ✓ · lint ✓ · knowledge-check ✓
         │
         ├─► test-engineer: Cockpit.bench-kpi.test.tsx + store.bench-selector.test.ts
         │      └─ HOOK: single-file vitest ✓
         │
         ├─► code-reviewer: diff review — no dead code, invariants held, tests exist ✓
         │
         ├─► qa-verifier: preview_start · snapshot "/" · console empty · screenshot
         │
         └─► Orchestrator commits: pre-commit hook (typecheck + lint + full test) ✓
                   "feat(cockpit): add bench headcount KPI card"
                   Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
         │
         ▼
  "Added bench KPI. Screenshot attached. Commit <sha>."
```

No human intervention between "user request" and commit. That is the loop.

---

## 8. Tooling additions (diff vs baseline)

| Addition | Where | Purpose |
| --- | --- | --- |
| ESLint flat | `eslint.config.js` | Hooks rules, unused imports, TS lint |
| Prettier | `.prettierrc`, `.prettierignore` | Deterministic formatting |
| Vitest + RTL + JSDOM | `vitest.config.ts`, `src/__tests__/setup.ts` | Unit + integration |
| `scripts/check.sh` | — | `typecheck && lint && test` one-liner |
| Scripts | `package.json` | `lint`, `lint:fix`, `test`, `test:coverage`, `check` |

Deliberately not adding: Husky (redundant with the pre-commit hook),
Storybook (preview covers it), GitHub Actions (only when pushed).

---

## 9. Autonomy ceiling

The system **auto-commits** but **never auto-pushes**. Destructive Bash
(`git push*`, `git reset --hard`, `rm -rf`, `--no-verify`,
`git checkout --`) is denylisted and requires explicit human approval.

If Claude goes off-rails: `git reset --hard HEAD~N` recovers.

---

## 10. Phases executed

| Phase | Scope | Commit |
| --- | --- | --- |
| **1** | Knowledge foundation (CLAUDE.md + 13 knowledge files + 3 ADRs) | `docs(claude): introduce knowledge schema` |
| **2** | 9 subagents | `docs(claude): add subagent roster` |
| **3** | ESLint + Prettier | `chore: add eslint + prettier` |
| **4** | Vitest scaffold + 5 critical test modules | `test: add vitest + domain-critical unit tests` |
| **5** | Hooks + `settings.json` | `chore(claude): add automatic verification hooks` |
| **6** | 4 playbooks | `docs(claude): add development playbooks` |

Deferred:

- **Phase 7** — Playwright E2E (only when a concrete E2E is needed).
- **Phase 8** — GitHub Actions CI (only when the repo gains a remote).
