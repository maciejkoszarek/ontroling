# CLAUDE.md — ontroling (CCA PracticeView)

This file is loaded on every turn. It is an **index**, not a dump. Read the
pointers below before writing code.

## Project

Web-based controlling cockpit for the Capgemini C&CA practice — headcount,
FTE, bFTE, ARVE, forecasts, joiners/leavers, project demand, pipeline,
scenarios, review packs. Single-page React prototype that parses the monthly
`CCA_PracticeView (N).xlsm` workbook directly in the browser. **No backend.**

## Stack

React 18 · TypeScript 5 · Vite 5 · Zustand 5 (+ `persist`) · TailwindCSS 3 ·
React Router 6 · ECharts 5 · SheetJS (`xlsx`) · Lucide icons.

## Key invariants (memorize these)

1. **`currentPeriod()` is dynamic** — derived from `new Date()` in
   [src/lib/utils.ts:74](src/lib/utils.ts). Not frozen. Do not hard-code periods.
2. **`Period = "YYYY-MM"`** — string, not Date. Use `periodAdd` / `periodRange`
   from `utils.ts`; never hand-roll month math.
3. **Forecast identity**: `(cycleId, puCode, period, metric)` uniquely keys a
   `ForecastCell`. Optional axes `grade` and `mu` split that identity further.
4. **Domain math**:
   - `HC_END = HC_BEGIN + JOINERS − LEAVERS` (per PU, per period)
   - `F_TOTAL = F1 + F2`
   - `ARVE_PCT ∈ [0, 1.2]` (1.2 = overtime cap)
5. **Virtual PUs**: `CCA_TOTAL` = roll-up of all `leafPuCodes`. `CCA_SE_TOTAL`
   = roll-up of `sePuCodes` (PL01NC03..07). Percentage metrics roll up
   **FTE-weighted** — see `PCT_METRICS` in [src/lib/forecast.ts:84](src/lib/forecast.ts).
6. **Locked cycles are immutable**: once `status === "locked" | "archived"`,
   live writes for that cycleId are ignored; `lockedSnapshots[cycleId]` wins
   via `effectiveCells()`.
7. **localStorage key is `cca-practiceview-v2`** — schema changes must bump
   the suffix or they corrupt user state.

## Where knowledge lives

| Question | File |
| --- | --- |
| What does FTE/bFTE/ARVE/F1/F2 mean? | [.claude/knowledge/domain/glossary.md](.claude/knowledge/domain/glossary.md) |
| What are the 28 forecast metrics and their formulas? | [.claude/knowledge/domain/metrics.md](.claude/knowledge/domain/metrics.md) |
| What equations must always hold? | [.claude/knowledge/domain/invariants.md](.claude/knowledge/domain/invariants.md) |
| Who can do what? | [.claude/knowledge/domain/rbac.md](.claude/knowledge/domain/rbac.md) |
| How is `Period` modelled? | [.claude/knowledge/domain/period-model.md](.claude/knowledge/domain/period-model.md) |
| Store shape, slices, persistence | [.claude/knowledge/architecture/store-shape.md](.claude/knowledge/architecture/store-shape.md) |
| ForecastIndex internals | [.claude/knowledge/architecture/forecast-index.md](.claude/knowledge/architecture/forecast-index.md) |
| Excel → store mapping | [.claude/knowledge/architecture/excel-parser.md](.claude/knowledge/architecture/excel-parser.md) |
| Route map | [.claude/knowledge/architecture/routing.md](.claude/knowledge/architecture/routing.md) |
| Theming (CSS variables, dark/light) | [.claude/knowledge/architecture/theming.md](.claude/knowledge/architecture/theming.md) |
| File/code naming | [.claude/knowledge/conventions/naming.md](.claude/knowledge/conventions/naming.md) |
| Where/how tests run | [.claude/knowledge/conventions/testing.md](.claude/knowledge/conventions/testing.md) |
| Commit style | [.claude/knowledge/conventions/commit-style.md](.claude/knowledge/conventions/commit-style.md) |
| Add a new metric | [.claude/knowledge/playbooks/add-new-metric.md](.claude/knowledge/playbooks/add-new-metric.md) |
| Add a new page | [.claude/knowledge/playbooks/add-new-page.md](.claude/knowledge/playbooks/add-new-page.md) |
| Ingest new workbook version | [.claude/knowledge/playbooks/ingest-new-workbook-version.md](.claude/knowledge/playbooks/ingest-new-workbook-version.md) |
| Debug forecast mismatch | [.claude/knowledge/playbooks/debug-forecast-mismatch.md](.claude/knowledge/playbooks/debug-forecast-mismatch.md) |
| ADRs (architecture decisions) | [docs/adr/](docs/adr/) |

## Running things

```bash
npm run dev          # http://localhost:5173
npm run typecheck    # tsc --noEmit — must pass before any commit
npm run lint         # eslint .
npm run test         # vitest run
npm run test:watch   # vitest (watch)
npm run check        # typecheck + lint + test (one-liner)
npm run build        # tsc -b && vite build
```

## Glossary teaser (full list in [domain/glossary.md](.claude/knowledge/domain/glossary.md))

- **FTE** — Full-time equivalent capacity (headcount weighted by `fteCapacity`).
- **bFTE** — Billable FTE; hours recovered through client projects.
- **ARVE** — Adjusted Revenue per FTE; utilization-like ratio, range 0..1.2.
- **F1 / F2** — First-tier / second-tier forecast commit bands.
- **Cycle** — A monthly forecast instance (FC April 2026, FC May 2026, …).

## Commit & PR conventions

Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`),
subject ≤ 72 chars, imperative. Autonomous commits end with:

```
Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

Never `git push` or force-push without explicit human approval. Never bypass
hooks with `--no-verify`.

## Agent hierarchy

The orchestrator (main chat) delegates to 9 subagents under
[.claude/agents/](.claude/agents/). Flow:

- New feature → `feature-developer` → `test-engineer` → `code-reviewer` → `qa-verifier` → commit
- Domain question → `domain-analyst` (fast, cached answer)
- Structural change → `architect` (produces ADR) → `feature-developer`
- Data-correctness risk → `data-integrity` before merge

**When the request touches domain concepts, ask `domain-analyst` before
writing code.** Do not guess metric semantics from variable names.

## Knowledge write-back rule

If you edit `src/types.ts`, `src/store.ts`, or `src/lib/forecast.ts`, update
the matching file under `.claude/knowledge/` in the same turn. A hook warns
if you forget.
