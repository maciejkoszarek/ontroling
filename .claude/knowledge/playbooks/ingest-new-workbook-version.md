---
name: Ingest a new workbook version
description: How to safely extend the Excel parser when Finance ships a revised CCA_PracticeView workbook (renamed sheets, new columns, changed totals).
---

# Playbook — ingest a new workbook version

The Excel parser in `src/lib/excelParser.ts` is a *contract* between the
Finance team's workbook and our domain model. Version bumps from Finance
are how most regressions enter the system. Treat every schema change as
an ADR-worthy event.

## Before you touch code

1. **Get a sample file.** Ask the user to drop it in a test fixture path
   (e.g. `src/__tests__/fixtures/workbook-v{N}.xlsx`). Never commit the
   real data — scrub or ask.
2. **Read the diff.** Open the new workbook next to the previous one and
   list: renamed sheets, new columns, removed columns, changed formulas,
   changed roll-up totals.
3. **Check the ADR.** `docs/adr/` — the current parser contract is spelled
   out in the parser ADR. The v{N} bump deserves its own ADR if anything
   material changed (sheet name, column meaning, roll-up scope).

## Implementation

1. **Parser** (`src/lib/excelParser.ts`):
   - Add tolerant lookup for the new sheet/column names — never hard-code
     `sheet[0]`. Use header-row matching.
   - Preserve backwards compatibility with the previous version for at
     least one release (the parser is the one place where being lax with
     input is correct).
   - Surface parse warnings via `lastIngest.warnings` — don't swallow.
2. **Types** — if the workbook introduces a new dimension (new MU,
   new grade, new metric), extend `src/types.ts` *before* touching the
   parser so the compiler steers you through every consumer.
3. **Store** — `setLastIngest` / `ingestWorkbook` actions in
   `src/store.ts`; update to populate the new slices.
4. **UI** — at minimum the `ImportDialog` / ingestion feedback screen
   must show the new warning categories.

## Tests to add

- **Parser fixture test** (`src/lib/excelParser.test.ts`, create if
  missing): load `fixtures/workbook-v{N}.xlsx`, assert the expected row
  counts, the expected mapped metric codes, and that `warnings` is empty
  on a clean file.
- **Regression test**: keep the v{N-1} fixture and assert the parser
  still handles it. The moment support is dropped, move it to an
  archived folder and note the drop in the ADR.
- **Invariant test**: the parser must preserve `F_TOTAL = F1 + F2` and
  `HC_END = HC_BEGIN + JOINERS − LEAVERS` end-to-end. Assert on a
  sampled `(cycle, PU, period)` after ingestion.

## Knowledge updates

1. `docs/adr/XXXX-workbook-v{N}-contract.md` — new ADR with the diff and
   the decision.
2. `.claude/knowledge/architecture/excel-parser.md` — update the column
   mapping table.
3. If a metric/PU was added, chain into `add-new-metric.md` /
   `add-new-page.md` playbooks.

## Done criteria

- [ ] `npm run check` green.
- [ ] Both old and new fixtures parse clean (no warnings).
- [ ] Manually imported the real workbook through the dev UI; the
      ingestion dialog shows the expected row counts and no errors.
- [ ] ADR filed and linked from CLAUDE.md if load-bearing.
