---
name: Add a new forecast metric
description: Step-by-step for introducing a new metric into the 28-metric forecast grid without breaking roll-ups, invariants, or Excel ingestion.
---

# Playbook — add a new forecast metric

Use this when you need to extend the forecast grid with a new metric (e.g. a
new ratio, a new IDC slice, a new HC→FTE overlay). The goal is to ship the
metric end-to-end with no silent zeros, no broken roll-ups, and a test that
guards the invariant that made us want the metric in the first place.

## Before you touch code

1. **Name the metric.** All-caps SNAKE_CASE, past tense for deltas (e.g.
   `LND_PCT`, `ARVI_DELTA`). Add it to the type union in `src/types.ts`.
2. **Decide its algebra.**
   - Additive? Roll-up is a plain sum (default).
   - A percentage / ratio? Add it to `PCT_METRICS` in `src/lib/forecast.ts`
     so virtual PU roll-ups become FTE-weighted.
   - Derived from other metrics? Add the derivation to `forecast.ts` and
     *never* store it in `forecastCells` — derive at read time.
3. **Check the invariant table.** `.claude/knowledge/domain/invariants.md`
   — if the new metric participates in an invariant (I1–I28) write the
   invariant *before* implementing so the test is obvious.

## Implementation

1. `src/types.ts` — add the literal to the `ForecastMetric` union. Typecheck
   will now flag every exhaustive switch that missed it; walk the list.
2. `src/lib/forecast.ts` — if the metric is a percentage, append it to
   `PCT_METRICS`. Delegate `effectiveValue` goes through `weightedRollup`.
3. `src/lib/demoData.ts` — seed deterministic values for every
   `(cycle × PU × period)` so the UI never renders "—" by default.
4. `src/lib/excelParser.ts` — wire the column → metric mapping so workbook
   ingestion picks it up. Update `.claude/knowledge/architecture/excel-parser.md`.
5. `src/components/MetricGrid.tsx` + consumer pages — add the row/column and
   confirm it renders.

## Tests to add

- **Unit** (`src/lib/forecast.test.ts`):
  - Additive roll-up sums leaves (mirror the existing `CCA_SE_TOTAL` test).
  - Percentage roll-up is FTE-weighted (mirror the existing ARVE_PCT test).
  - Invariant test — e.g. if the metric is `LND_PCT`, assert `0 ≤ v ≤ 1`
    across all leaves in the seeded data.
- **Store** (`src/store.test.ts`): `setForecastValue` writes and audits the
  new metric like any other.
- **Parser** (if ingestion changed): one happy-path row covering the new
  column.

## Knowledge updates

1. `.claude/knowledge/domain/metrics.md` — add the metric to its group.
2. `.claude/knowledge/domain/invariants.md` — add the new invariant if any.
3. If the roll-up rule is unusual, note it in
   `.claude/knowledge/architecture/forecast-index.md`.

## Done criteria

- [ ] `npm run check` green (typecheck + lint + tests).
- [ ] Dev server renders the new metric on Cockpit / PU detail with
      non-zero values from seeded data.
- [ ] qa-verifier confirms in the browser that the metric appears in every
      screen where it logically should (cockpit KPI, PU grid, FC/FC, …).
- [ ] Knowledge base updated and ADR filed if the algebra is novel.
