# CCA_PracticeView — Excel-to-App Specification

**Workbook analysed:** `/Users/maciek/Forecast/CCA_PracticeView (4).xlsm` (21.7 MB, 42 sheets, no VBA)
**Target app:** React 18 + TypeScript + Vite + Zustand + ECharts + SheetJS at `/Users/maciek/ontroling`
**Author:** Senior FP&A Controller / Solution Architect
**Scope:** Capgemini Poland C&CA Practice, ~670 employees, 9 leaf Production Units, ~30 Market Units, rolling 24 months, monthly re-forecast cycle.

---

## Table of Contents

1. [Executive summary](#1-executive-summary)
2. [The monthly controlling cycle (narrative walk-through)](#2-the-monthly-controlling-cycle)
3. [Per-sheet detailed analysis (all 42 sheets)](#3-per-sheet-detailed-analysis)
4. [Cross-sheet data model](#4-cross-sheet-data-model)
5. [Gap analysis vs. the existing React app](#5-gap-analysis-vs-existing-react-app)
6. [Forecast engine specification](#6-forecast-engine-specification)
7. [Prioritised roadmap](#7-prioritised-roadmap)
8. [Appendix A — Named ranges, data validations, macros](#appendix-a--named-ranges-validations-macros)
9. [Appendix B — Glossary](#appendix-b--glossary)

---

## 1. Executive summary

The workbook is, in effect, a bespoke one-practice ERP sitting on top of eight Excel pivots, twelve per-PU forecast tabs, three databases, and several legacy check sheets. It works, but the workbook is a **cliff of manual discipline**: every month Maciej refreshes five pivots in the right order, copy-pastes the previous FC into a snapshot block, edits ~400 numbers across twelve near-identical tabs, runs half a dozen integrity checks by eye, then exports the review pack into Teams. There is **no VBA** (`xl/vbaProject.bin` is absent despite the `.xlsm` extension), there are **zero data validations** on any of the editable grids, and only **one cell on the entire workbook** (`Project_Forecast!K` with a type list) constrains input. The next forecast owner will find the file brittle and near-impossible to hand over.

The target React app already has the right skeleton — 18 routes, Zustand store, ECharts visualisations, SheetJS ingestion, scenario promotion plumbing, an RBAC matrix in `Admin.tsx`, and a cockpit page with KPI cards, trend chart, and variance leaderboard. What is missing is **the controller's actual day job**: a keyboard-driven editable grid, a cycle-scoped ingestion pipeline that replaces manual pivot refresh, a persistent comment/audit trail bound to every cell, a compliant sign-off flow that locks the cycle, and a Project_Forecast-equivalent project book that feeds demand/supply reconciliation.

**The top 5 architectural shifts this spec mandates:**

1. **Replace "pivot hosts + formula fan-out" with a typed ingestion pipeline.** Today `HR_DB`, `GFS_DB`, `Joiners_DB`, `Leavers_DB`, `Contract_of_mandate_DB` are raw dumps; `HR_Summary`, `GFS_Summary_2026`, `CCA_Actuals` (veryHidden), `CCA_HR` (veryHidden) are pivots; everything downstream is formula fan-out. The app must land each database as a versioned table, stamp it with a cycle id and upload timestamp, and compute the equivalent pivot deterministically server/worker-side. The `techniczny` concat key (`Practice & PU & SBU & Project & MU & Country`) used inside `GFS_DB` for XLOOKUPs becomes a SQL natural key.

2. **Per-PU tab is a matrix: PU × grade × metric × period × cycle, not twelve copies of a sheet.** CCA_SE1 and its eleven siblings (Head, Cloud_Native, Complex Transformation, SE_total, SE1–5, EEC, Total) are 171×80 clones of one template. The current `PuDetail.tsx` exposes ~8 metrics × ~24 periods for the leaf PUs; the Excel tabs contain ~40 sub-metrics × 46 period columns × 2 cycles (current FC + previous FC snapshot) including grade breakdown. The app needs a **high-density keyboard-driven grid** (row pinning, copy-paste, delta column, mouseover diff tooltip) and a normalised fact table backing it.

3. **Build a proper ARVE / bFTE computation engine that matches Excel down to two decimal places.** ARVE is not a typed input — it is **computed** from bFTE, FTE_CSS, Vacation and Unpaid_Leave, each of which is itself derived from GFS_DB hours divided by 184, cut by the 16 `Grupowanie_Godzin` buckets, weighted by headcount transitions, and bounded by the ADMIN vacation phasing table. The app's current `forecast.ts::effectiveValue` only does an FTE-weighted PU roll-up; it must grow a full-fidelity calculation engine including the 80% cap, the sickness reduction factor (RC_Time Sickness × 0.69), and the grade-level roll-up. **Until this engine ties to Excel, the app cannot ship as a replacement.**

4. **FC/FC variance attribution must become reproducible, not heuristic.** `forecast.ts::attributeVariance` today splits a `deltaFte` into joiners 55%, leavers −12%, movers 5%, project_ramp 30%, arve_drift 12%, other 10% — a pleasant chart but a fiction. The workbook's `Delta FC_FC (check)` sheet already decomposes the delta per-project-per-PU (current FTE vs prev FTE, current bFTE vs prev bFTE, ARVI). The attribution engine must be swapped to a **reconciliation ledger**: for every (PU, grade, period) delta, credit it to one of {joiner, leaver, transfer_in, transfer_out, project_ramp, bench_change, arve_drift, vacation_shift, absence_shift, correction}, and the sum must tie back to the delta.

5. **Cycle lock + audit trail is mandatory.** Today the "previous FC" column on every per-PU tab is a manual copy-paste snapshot that could be overwritten silently; there is no trail of who changed what when. The app already has `openCycle/closeCycle` and a `source: manual | auto_baseline | scenario_promote | ingestion | seed` enum on `ForecastCell`. This needs to be extended with actor + timestamp + before/after values on every edit, the close action must freeze the `previous FC` snapshot server-side, and the cockpit must show "edits since last DQ run" and "edits by controller role" breakdowns.

Everything else in this document — per-sheet analysis, data model, forecast engine, roadmap — is the detail that supports these five shifts.

---

## 2. The monthly controlling cycle

The cycle runs roughly the 1st–10th of each month, with Maciej as the sole owner. The narrative below is reconstructed from `Intro!` timestamps, formula patterns across the workbook, and the physical layout of the per-PU tabs (two blocks: "current FC" `AF–AR`, "previous FC" `AW–BH`).

### Stage 0 — Cycle open (D-day, around the 1st)

- Previous month closes on the financial side; GFS system posts final hours.
- The controller creates a new monthly FC cycle. In Excel this means (a) manually duplicating the previous-FC cells `AF–AR` into `AW–BH` as values across all twelve per-PU tabs, (b) updating the cycle label cells on `Intro!Z3:Z4` ("current FC" = "FC April 2026", "previous FC" = "FC March 2026"), and (c) moving the shaded "current month" band on each tab. **App equivalent:** `openCycle(id)` in `store.ts` — but today it does not snapshot previous-FC values; it must.

### Stage 1 — Data ingestion (days 1–3)

Four reports land in Maciej's inbox, each from a different owner:

| Report | Source | Updated by | Target sheet | Cadence |
|---|---|---|---|---|
| HR snapshot | SuccessFactors / PeopleHub extract | HR team | `HR_DB` (2010 rows × 44 cols) | Monthly, 2nd |
| GFS report | GFS project-time system | Practice Ops | `GFS_DB` (30688 rows × 49 cols) | Monthly, 20th prior month; re-run end-of-month | 
| Leavers Report | HR | HR | `Leavers_DB` (95 rows × 20 cols) | Monthly, 20th |
| Joiners Report | Recruitment | PDL recruiters | `Joiners_DB` (200 rows × 28 cols) | Monthly, 16th |
| Contract of Mandate | HR | HR | `Contract_of_mandate_DB` (184 rows × 24 cols) | Monthly, 16th |

The `Intro!J9:L13` block records the "Updated on" dates — the only place in the workbook that acknowledges data freshness. Each is a paste-special of a CSV dump. There is no validation, no reconciliation, no dedup. The `GFS_DB_2025` sheet (hidden, 30688 rows) is the **prior-year frozen copy** for year-on-year references.

After the raw dumps are in, five pivots must be refreshed **in this order** (revealed by formula chains):
1. `CCA_HR` (veryHidden) — HR pivot host for HC-by-grade.
2. `CCA_Actuals` (veryHidden) — GFS pivot host with **three** pivots: `tbl_ACT_excl.Z`, `tbl_ACL_FTE_MU`, `tbl_ACL_only.Z`. This feeds `CCA_Total` rows 110–137 via `GETPIVOTDATA`.
3. `GFS_Summary_2026` — current-year project roll-ups.
4. `ARVE` — people-level ARVE pivot (six months visible: 2025-10 to 2026-03 at cursor), feeding the leaderboards.
5. `HR_Summary`, `Joiners_summary`, `Leavers_summary`, `Contract_of_mandate_summary` — flag tables feeding RBAC-style lookups (e.g. `Hired YES/NO`).

**A single skipped refresh silently breaks every downstream number.**

### Stage 2 — Per-PU actualisation (days 3–4)

With pivots refreshed, the per-PU tabs' actuals columns auto-populate (`GETPIVOTDATA` / `SUMIFS` references into `CCA_Actuals` and `GFS_DB`). The current month's actuals are now live in columns `D–O` (2024), `R–AC` (2025), and `AF–AC` for 2026 actuals to date. Maciej scans for `#REF!` or zero anomalies — the `GFS_DB` sheet's columns AV/AW currently carry `#REF!` errors, confirming the workbook is mid-cycle.

### Stage 3 — Forecast edit (days 4–7)

This is the core 3-day block. For each of the twelve per-PU tabs, Maciej touches **~40 numbers × 10 future months = ~400 cells**. The canonical edit areas:

- **Joiners by grade** (rows 22–40, col `AF` onwards): forward view from hiring pipeline.
- **Leavers by grade** (rows 41–59): from `Leavers_DB` projection + LTA-ending list.
- **Transfers** (rows 60–78): internal moves between PUs.
- **FTE lost, Overtime, Unpaid Leave** (rows 98–104): judgment overlays.
- **Vacation** (row 103): driven by ADMIN phasing curve but overridable.
- **bFTE per MU** (rows 110–121): the demand-side pull.
- **BDC sold / IDC breakdowns** (rows 123–138): utilisation adjustments.

Rows 79 (HC EOM) and 105 (ARVE base) recompute automatically — **the controller should never type into these**. Yet there is no protection; any cell can be overwritten.

### Stage 4 — Project book refresh (day 5, parallel)

`Project_Forecast` (576 rows × 293 cols) holds the demand side. The `Project_Details` structured table has one row per project-PU combination, with 12 months × 2 years of demand columns. The per-PU subtotals on rows 2–12 are `SUMIF`s across the table. The only data validation in the whole workbook lives here: `K74, K168, K204, ...` have a list validation `$K$1:$K$10` — likely the "Project type" list (Firm / Named / Unnamed / Pipeline etc.). `CCA_TWP` uses these to reconcile Supply vs Demand per PU (Firm + Named-weighted + Unnamed + Ambition vs Supply-with/without-Resource-Plan).

### Stage 5 — Consolidation (day 7)

Once all PU tabs are edited, `CCA_Total` (181 rows × 80 cols, 3558 formulas) rolls up. Every cell on Total is either `=CCA_Head!X + CCA_Complex Transformation!X + ... + CCA_EEC!X` or an average weighted by FTE. `CCA_SE_total` rolls up SE1–5 only. `Headount&FTE`, `Monthly Overview Act vs.FC`, and `FC_FC per PU` then re-pull from Total and per-PU.

### Stage 6 — Reconciliation / DQ (days 7–8)

A collection of check sheets fire off by eye:

- **`Check FTE vs. HC`**: `GFS_DB` hours ÷ 184 should equal `HR_DB` headcount × part-time factor. `Delta GFS - HR current month` column flags misses.
- **`Delta FC_FC (check)`**: per-project-per-PU reconciliation of current FTE/bFTE/ARVI vs previous FTE/bFTE/ARVI. This is the **ground truth for FC/FC variance**.
- **`bFTEvs FTE`**: integrity that bFTE ≤ FTE.
- **`CCA_Total!139`** (row 139 "Check"): integrity sum that must equal zero.

Any red cell here triggers a targeted re-edit. There is no ledger of how many passes this takes per cycle.

### Stage 7 — Sign-off (day 10)

Maciej produces the review pack: screenshots of `Cockpit`-equivalent tabs (`Headount&FTE`, `FC_FC per PU`, `Monthly Overview Act vs.FC`, `CCA_Summary`, `CCA_TWP`) dropped into a PowerPoint deck shared to the practice lead. There is **no formal sign-off artefact in the workbook** — no "closed" flag, no hash of the frozen numbers, no cycle log. The next month's "open" simply overwrites the current numbers.

### Stage 8 — Pack / distribution

The pack goes to:
- Practice lead: narrative deck.
- Group finance: extract of CCA_Total and CCA_Summary.
- PU owners: each gets their own per-PU tab (shared file).

### Key cadence insight for the app

The cycle is **serialised, not concurrent**. One person edits, one person reconciles, one person signs off. The app should enforce that serialisation via cycle state machine (`open → editing → reconciling → locked → archived`) with role gates rather than try to introduce concurrent editing, which is unnecessary at this volume.

---

## 3. Per-sheet detailed analysis

For each sheet we cover the eight mandatory elements: name/purpose, structure, role in the monthly cycle, how it's filled, key formulas, pitfalls, target app screen, ripple effects.

### 3.1 Dashboards & entry sheets

#### Sheet 1 — `Intro` (51×26, visible)
- **Purpose.** Landing page. Shows current/previous FC labels, source-report freshness dates, PU structure mapping, and point-of-contact list.
- **Structure.** Three regions: title block `C1:J5` (merged), FC label block `Y3:Z4`, freshness block `J9:L13`, PU structure table `A14:K27` (new 2025 PU codes PL01NC01–PL01NC10 + a few deprecated PL01A100/A101/N111).
- **Role in cycle.** Stage 0 (label update), stage 1 (freshness stamping).
- **How filled.** Labels edited manually by controller when opening a cycle. Timestamps copied from email subject lines.
- **Key formulas.** Only `=Z3` echo on `A6`. No complex logic.
- **Pitfalls.** Labels are free-text with no validation; a typo ("FC Apirl 2026") propagates nowhere but undermines audit. The PU mapping has hard-coded deletions ("Delete/empty") that are not reflected in actual per-PU tab names.
- **Target screen.** `Cockpit.tsx` banner + `Admin.tsx → Cycle` section. Freshness badges live on `Ingestion.tsx` already — must be wired to cycle metadata.
- **Ripple effects.** None downstream (it's presentational). But the PU structure table is the authoritative map from `Production Unit Code` → `PU speaking name` and must become the app's canonical `productionUnits` list (add missing PL01A100/N111 as deprecated flags).

#### Sheet 2 — `Headount&FTE` (32×29, visible)
- **Purpose.** One-screen dashboard of HC EOM, FTE, bFTE, ARVE across all 9 leaf PUs + Total.
- **Structure.** Rows = metrics (HC EOM, FTE CSS, bFTE, ARVE, UZ block, Overtime) × 12 months; columns = 9 leaf PUs + CCA_SE_total + CCA_Total.
- **Role in cycle.** Stage 8 (review pack source). Also the "am I done?" sanity screen at stage 6.
- **How filled.** Entirely formula-driven from `CCA_Total` and each leaf PU tab.
- **Key formulas.** Direct cell references `=CCA_Total!R79`, `=CCA_Total!R106+CCA_Total!R167` (FTE = CSS FTE + Z FTE), `=CCA_Total!R154` (ARVE).
- **Pitfalls.** Hard-coded row numbers — if the template row layout shifts (as happened in the transition from FY25 to FY26), the whole dashboard breaks silently.
- **Target screen.** `Cockpit.tsx` + `Trends.tsx`. Already substantially covered.
- **Ripple effects.** None downstream.

#### Sheet 3 — `Monthly Overview Act vs.FC` (171×15, visible)
- **Purpose.** Delta table: current month Actuals vs previous FC, broken by metric and by grade.
- **Structure.** Rows 1–171 mirror the per-PU template row layout; columns = Actual / Prev FC / Δ / Δ%.
- **Role in cycle.** Stage 6 (reconciliation). The "how close did we land" check.
- **How filled.** Formulas read current actuals from `CCA_Total` column for current month and from previous-FC cells (`AW` onwards) on the same sheet.
- **Key formulas.** Subtractions `=CCA_Total!current - CCA_Total!previous`, ratio guards with `IFERROR`.
- **Pitfalls.** If the previous FC snapshot is stale (see stage 0), every delta is wrong.
- **Target screen.** `FcVsBudget.tsx` conceptually; probably deserves a new `ActVsFc.tsx` page because the comparison is not to Budget but to the immediately prior monthly FC cycle.
- **Ripple effects.** Feeds the review pack.

#### Sheet 4 — `FC_FC per PU` (172×46, visible)
- **Purpose.** The flagship FC-vs-FC matrix: per-PU, per-metric, current vs previous FC Δ for the next 12 rolling months.
- **Structure.** 11 PU columns (9 leaf + CCA_SE_total + CCA_Total) × ~172 rows replicating the per-PU template. Conditional formatting is heavy (11 rule sets) coloring deltas.
- **Role in cycle.** Stage 6 + Stage 7.
- **How filled.** Direct references `=CCA_PU_X!currentFC - CCA_PU_X!previousFC`.
- **Key formulas.** 22 merged cells in headers (e.g. `AR1:AT1` for "CCA_SE_total current/prev/delta" triplet). Conditional format thresholds at ±0.5 FTE.
- **Pitfalls.** The conditional-format palette is subjective; no fixed banding. The matrix has no drill-through.
- **Target screen.** `FcFc.tsx` — already exists but is period × leafPu heatmap. Needs upgrade to full PU × metric × period cube with drill-down.
- **Ripple effects.** Anchors review discussion.

#### Sheet 5 — `ADMIN` (54×17, **hidden**)
- **Purpose.** Phasing tables for vacation and sickness by location tier, plus legacy per-year historical averages, plus the PU-code-to-practice-team-name map (repeats of Intro!).
- **Structure.** Two phasing matrices — NSC NCE (rows 3–12) and 3City (rows 14–20) — each with rows = cycle label (FC'25 / B'24 / B'23 / FC'23 / ACT'22–19) and cols = Jan..Dec + Y'23 average. Sickness follows rows 22–31.
- **Role in cycle.** Driver for vacation/sickness forecasting per-PU. Feeds the row 103 (Vacation) baseline overlay.
- **How filled.** Frozen for the fiscal year, updated each Nov/Dec when new budget is built.
- **Key formulas.** `=AVERAGE(D5:O5)` for year averages, `=6%+2%` in raw form — **live formulas in historical cells, violating "frozen budget" discipline**.
- **Pitfalls.** The sheet is **hidden**, so controllers who inherit the workbook may not know the rates exist; they'll overtype the row 103 outputs and cause drift. No clear "this is the NSC NCE vacation rate for Jul 2026" single-cell access.
- **Target screen.** `Admin.tsx → Assumptions` tab. Make it explicit: tables of per-location, per-year vacation phasing; sickness phasing; part-time reduction; contract-of-mandate hour equivalents.
- **Ripple effects.** Row 103 on every per-PU tab → row 105 (ARVE base) → row 154 (ARVE) → everything that cites ARVE downstream.

### 3.2 Per-PU forecast sheets (the twelve siblings)

All twelve per-PU tabs share **one template** (confirmed from `CCA_SE1` dump + `_INDEX.txt` size signatures). I document the template once, then call out the specific role of each sibling.

#### Canonical per-PU template (applies to sheets 6, 8, 9, 10, 11, 12, 13, 14, 17, 18, 19; CCA_Total shares 95% of the row layout)
- **Structure — columns.**
  - `A`: Category tag (e.g., "Project", "Opps.", "Ambition", blank).
  - `B`: Metric group (e.g., "HC EOM", "Joiners", "ARVE Reported").
  - `C`: Sub-metric or grade (A4/A5, B1/B2, C1/C2, D1/D2, E1/E2, F1/F2; or MU name for bFTE rows).
  - `D:O`: 2024 monthly actuals (12 columns Jan..Dec).
  - `P`: 2024 YEL (Year-End Level, averaged or last-period).
  - `Q`: blank separator.
  - `R:AC`: 2025 monthly actuals (12 columns).
  - `AD`: 2025 YEL.
  - `AE`: blank separator.
  - `AF:AQ`: 2026 current FC (12 columns Jan..Dec).
  - `AR`: 2026 YEL.
  - `AT`: **Δ current FC vs previous FC** (single-cell summary: `=AH3-BL3` pattern).
  - `AV`: blank separator.
  - `AW:BH`: 2026 **previous FC** snapshot (12 columns) — copy-pasted values, not formulas.
  - `BI:BW`: additional analytics columns (comments, QA, dev cells).
  - `BX:BY`: metadata / comment columns (all rows have merged cell `BX1:BX2`, `BY1:BY2`).
- **Structure — rows (all 171 of them).**
  - Rows 3–21: HC Beginning of Month, by grade (F/E/D/C/B/A descending).
  - Rows 22–40: Joiners by grade.
  - Rows 41–59: Leavers by grade.
  - Rows 60–78: Transfers by grade.
  - Row 79: **HC EOM** = HC_BEGIN + Joiners − Leavers + Transfers (the rollforward identity).
  - Rows 80–97: HC EOM by grade.
  - Rows 98–107: FTE lost, Overtime, **Total FTE's (row 103)**, Unpaid Leave, **FTE's CSS (row 105)**, Vacation, **base for ARVE (row 107)**, FTE assigned, FTE not assigned.
  - Row 108: **bFTE CSS Total**.
  - Row 109: bFTE project.
  - Rows 110–121: **bFTE per MU** (the demand side — this is where "how much of X MU's need does this PU cover this month" goes).
  - Row 122: NG / UZ bFTE.
  - Rows 123–138: BDC sold, IDC CSS FTE, IDC breakdowns (Bench, L&D, Recruitment, MAN, Reserve…), BDC-PL, SFC.
  - Row 139: **Check** (must equal zero — integrity sum).
  - Rows 140–153: Same categories as 123–138 expressed as percentages.
  - Row 154: **ARVE Reported** = `=IFERROR(D108/D105,0)`.
  - Row 155: ARVE without one-timers.
  - Row 156: ARVI (same numerator, different denominator that excludes vacation).
  - Row 157: ARVI_project `=100%-P162-P143-P145`.
  - Rows 158–162: percent calcs (bench %, L&D %, etc.).
  - Rows 164–171: Z grade (UZ contractor) separate block with its own HC, FTE, bFTE, and ARVE.
- **Role in cycle.** Stage 3 (core edit) + Stage 4 (project alignment).
- **How filled.**
  - Rows 3–21 (HC BOM): `=` previous month's row 79 (automatic).
  - Rows 22–78 (movements): **manual entry** from Joiners_DB / Leavers_DB / Transfers plan.
  - Row 79 (HC EOM): `=row3 + sum(joiners) − sum(leavers) + sum(transfers)` — **computed**.
  - Rows 98–104 (FTE/Overtime/Vacation): **manual overlay** over baselines derived from HC × 184 and ADMIN phasing.
  - Rows 105–107: computed.
  - Row 108 (bFTE): **manual entry** or aggregated from row 110–122 MU splits.
  - Rows 110–121 (bFTE per MU): **manual entry**, the controller's judgment informed by project book.
  - Rows 123–138: **manual entry** for bench/L&D assumptions.
  - Rows 140–153: percentage formulas.
  - Row 154–157: ARVE/ARVI formulas — computed.
  - Rows 164–171 (UZ): **manual entry** for the contractor pool.
- **Key formulas.**
  - HC rollforward `=E22+E41+E60+E79` (approx — depends on grade distribution).
  - ARVE: `=IFERROR(D108/D105,0)`.
  - ARVI_project: `=100%-P162-P143-P145`.
  - Delta current vs prev FC: `=AH3-BL3`.
  - YEL: `=AVERAGE(D:O)` for monthly metrics, `=O79` (last month) for EOM metrics.
- **Pitfalls.**
  - **No cell protection.** Rows 79, 105, 108 (computed) can be overwritten — and on at least two of the twelve tabs they are, subtly, in ways that only show up in the `Check` row 139.
  - **Hidden merged cells** in `AT1:AT2`, `BX1:BX2`, `BY1:BY2` make keyboard navigation awkward and break copy-paste row-based selection.
  - **"Previous FC" snapshot is a values-paste**, not a versioned entity. The moment someone opens a previous cycle to "just check a number" and accidentally triggers a recalculation, the snapshot is lost.
  - **Grade labels are free text** ("C1", "C2" but also "C1/C2" in some rows), so join-back to HR_DB.Grade is fragile.
- **Target screen.** `PuDetail.tsx` — but requires major upgrade. Specifically:
  - Row pinning (HC EOM, ARVE Reported must always be visible).
  - Multi-column band (actuals cols gray, current FC editable, prev FC read-only, delta computed).
  - Inline cell tooltip showing formula and source (manual / auto / ingested).
  - Keyboard copy of a whole row from prev-FC → current-FC with "promote prior forecast" action.
  - Grade collapse/expand.
- **Ripple effects.** Every per-PU cell feeds `CCA_Total`, `CCA_Summary`, `Headount&FTE`, `FC_FC per PU`, `Monthly Overview Act vs.FC`, `Check FTE vs. HC`, `Delta FC_FC (check)`, `CCA_TWP`.

Now the sibling-specific notes:

#### Sheet 6 — `CCA_Total` (181×80, visible)
- **Purpose.** Roll-up of all 9 leaf PUs + the two virtual PUs (SE_total, CCA_Total itself is top).
- **Structure.** Same template; each cell is `=CCA_Head!R3 + CCA_Complex Transformation!R3 + CCA_SE1!R3 + ... + CCA_EEC!R3` (additive) or weighted average (for ARVE-type rows).
- **Role in cycle.** Stage 5 consolidation.
- **How filled.** Pure formulas — 3558 of them, 47 distinct patterns.
- **Key formulas.** Direct sums across 9 leaf PU tabs, GETPIVOTDATA for rows 110–137 into CCA_Actuals pivots.
- **Pitfalls.** Adding or renaming a PU forces a manual rewrite of every formula. The hardcoded list is a maintenance bomb.
- **Target screen.** Generated on-the-fly from the fact table in `Cockpit.tsx` / `PuDetail.tsx` with a `virtual: true` PU type (which the app already has in `ProductionUnit` type).
- **Ripple effects.** Top-level KPI feeds `Headount&FTE`, `CCA_TWP`, `CCA_Summary`, review pack.

#### Sheet 7 — `ARVE` (470×37, visible)
- **Purpose.** People-level ARVE pivot — six-month horizon (2025-10 to 2026-03), by grade and by individual, with FTE's and ARVE columns per month.
- **Structure.** Two pivots stacked: "Po dacie ksiegowej" (by booking date, rows 6–13) and "Po dacie projektowej" (by project date, rows 24+). Then hundreds of employee rows 28–466 with per-month ARVE.
- **Role in cycle.** Stage 6 — the bench/at-risk screen. Legend: <65% bench (red), 65–80% at-risk (amber), ≥80% healthy (green).
- **How filled.** Excel pivot table on `GFS_DB`, refreshed manually.
- **Key formulas.** Pivot-generated; no user formulas.
- **Pitfalls.** Refresh-dependent. If unrefreshed, names in the bench list are stale. Employee names use Unicode diacritics that are fragile on ingestion.
- **Target screen.** `Arve.tsx` heatmap (PU × period) + a dedicated people leaderboard (`Bench.tsx` already covers the <65% tail; extend to 65–80% too).
- **Ripple effects.** Only visual/analytical; no writes back to forecast.

#### Sheet 8 — `CCA_Cloud_Native` (172×88, visible)
- Leaf PU PL01NC08. Same template. "Cloud & Native" area lead: Anna Koszela.
- **Target screen.** Instance of `PuDetail.tsx` with `puCode=PL01NC08`.

#### Sheet 9 — `CCA_Head` (171×80, visible)
- Leaf PU PL01NC01 — the leadership / "Head" staff. Includes admin overheads, management. Lead: Łukasz Fajer / Maciej Koszarek.
- **Target screen.** Instance of `PuDetail.tsx` with `puCode=PL01NC01`. Note: this PU has very different MU distribution (mostly internal / no BDC), so some columns will be mostly empty. UI must degrade gracefully.

#### Sheet 10 — `CCA_Complex Transformation` (171×88, visible)
- Leaf PU PL01NC02. The second-largest PU by headcount. Lead: Tomasz Petrykowski.
- **Target screen.** Instance of `PuDetail.tsx` with `puCode=PL01NC02`.

#### Sheet 11 — `CCA_SE_total` (171×80, visible)
- **Virtual** PU: SE1 + SE2 + SE3 + SE4 + SE5. Rolled-up but treated as a first-class tab in the review pack.
- **Structure.** Like CCA_Total but summing only the five SE leaf PUs.
- **How filled.** Pure formulas.
- **Target screen.** A virtual PU in the store (`isVirtual: true`), hydrated from the leaf PU rows.

#### Sheets 12–14, 17–18 — `CCA_SE1` / `SE2` / `SE3` / `SE4` / `SE5` (all ~171×80, visible)
- Leaf PUs PL01NC03–07. Each has its own area lead (Bredschneider, Jany, Ciołkiewicz, Błach, Lendzion respectively per Intro!).
- **Structure.** Canonical template, individualised only by the MU distribution in rows 110–121 (e.g., SE1 heavy on CPRDT/RED, SE2 on MHT, SE3 mixed, SE4 on VW/AUTO, SE5 on Sogeti/GDC).
- **Target screen.** Instances of `PuDetail.tsx`.

#### Sheet 15 — `CCA_Actuals` (371×78, **veryHidden**)
- **Purpose.** Pivot host for the three GFS-derived pivots (`tbl_ACT_excl.Z`, `tbl_ACL_FTE_MU`, `tbl_ACL_only.Z`).
- **Structure.** One sheet, three side-by-side pivots.
- **Role in cycle.** Stage 1 — feeds actuals into every per-PU tab via `GETPIVOTDATA`.
- **How filled.** Pivot-refreshed from `GFS_DB` + `HR_DB` on controller click.
- **Key formulas.** None (pivots).
- **Pitfalls.** VeryHidden — invisible even in the "unhide sheet" menu. Depending on this pivot is a single point of failure no one else on the team can debug.
- **Target screen.** None (backend). App equivalent: a server-side aggregation job triggered after each `Ingestion.tsx` upload, emitting pre-computed actuals tables. `Ingestion.tsx` already has row-count display — add a "pivots refreshed at" timestamp.
- **Ripple effects.** Everything actuals-related.

#### Sheet 16 — `CCA_HR` (131×122, **veryHidden**)
- **Purpose.** Pivot host for HR movements (Joiners, Leavers, Contract of Mandate) keyed by PU and month.
- **Structure.** Several pivots across 122 columns.
- **Role in cycle.** Stage 1 — feeds rows 22–78 of per-PU tabs with "known joiner/leaver" counts.
- **How filled.** Pivots on `Joiners_DB`, `Leavers_DB`, `Contract_of_mandate_DB`.
- **Target screen.** `PeopleFlow.tsx` (already exists) should be directly computable from the three databases plus `HR_DB`.
- **Ripple effects.** Drives rows 22–78.

#### Sheet 19 — `CCA_EEC` (168×88, visible)
- Leaf PU PL01NC10 — Engineering Excellence Center. Separate cost centre.
- **Structure.** Canonical template, but EEC people don't count toward CSS ARVE — they're booked to `EMP_Type='EEC'` in `GFS_DB`.
- **Pitfalls.** EEC staff sometimes appear in CSS rows on other tabs because of mid-month transfers — reconciliation is manual.
- **Target screen.** Instance of `PuDetail.tsx` with `puCode=PL01NC10` and `empType=EEC` filter.

### 3.3 Consolidation / reporting sheets

#### Sheet 20 — `CCA_Summary` (264×81, visible)
- **Purpose.** MU × month grid with multiple block-of-rows: Pipeline, Current FC, FC/FC delta, ARVI ratio, etc.
- **Structure.** ~264 rows with blocks separated by blank rows:
  - Rows 5–17: Current FC by MU × month (FTE assigned, project+opps, firm/named/unnamed).
  - Rows 23–36: FC/FC delta by MU.
  - Rows 58–64: Pipeline / Ambition (Named-weighted, Unnamed).
  - Rows 132+: ARVI ratio block.
  - Rows 147–185+ (per-PU blocks that `CCA_TWP` references by number).
- **Role in cycle.** Stage 6 + Stage 7 — MU conversation ("which MU is short / long").
- **How filled.** Mostly formulas pulling from `Project_Forecast` (`SUMIFS`) and each per-PU tab (MU rows 110–121).
- **Key formulas.** `SUMIFS(Project_Details[[#All],...], ...)` with structured-table references; `GETPIVOTDATA` for ARVI block.
- **Pitfalls.** Heavy merged cells (128 merged ranges!) — makes programmatic access painful. Hardcoded row numbers cited from `CCA_TWP`.
- **Target screen.** `MarketUnit.tsx` (already exists) needs to show all the blocks (currently just MU × period heatmap). Add tabs or stacked blocks.
- **Ripple effects.** Consumed by CCA_TWP, review pack, Project Forecast reconciliation.

#### Sheet 21 — `UNN` (60×30, visible)
- **Purpose.** United Kingdom / Netherlands / Nordics (UNN) sub-pivot — a commercially strategic bundle of MUs that the practice tracks as one reporting unit.
- **Structure.** A pivot over MUs in the UNN bundle with per-month FTE and demand.
- **Role in cycle.** Stage 7 — a dedicated slide in the review pack.
- **How filled.** Pivot on `Project_Forecast` + `GFS_DB`, filtered to MU IN (UK, Netherlands, Nordics, UNN).
- **Pitfalls.** The current app's `marketUnits` list in `demoData.ts` does not include "UNN" as a top-level entity — this sheet reveals it should.
- **Target screen.** A MarketUnit sub-group filter, or a dedicated "UNN" slice under `MarketUnit.tsx`.
- **Ripple effects.** Review pack only.

#### Sheet 22 — `Budget 2026v2 check` (93×30, **hidden**)
- **Purpose.** Frozen FY2026 annual budget per MU × month, with variance column vs current FC.
- **Structure.** Rows = MUs, columns = months. Small, quickly scanned.
- **Role in cycle.** Quarterly / half-year budget check (Stage 8 for Q-end cycles).
- **How filled.** Frozen at annual budget build (Nov 2025); check formulas `=CurrentFC − Budget` and `=Δ / Budget%`.
- **Pitfalls.** Hidden; "v2" in name suggests there's a v1 lurking too. No freshness stamp.
- **Target screen.** `FcVsBudget.tsx` (already exists).
- **Ripple effects.** Used for annual target tracking; low in ripple otherwise.

#### Sheet 23 — `Project_Forecast` (576×293, visible)
- **Purpose.** The **project book** — one row per (project × PU) with 24 months × multiple metric columns of demand.
- **Structure.**
  - Rows 2–12: per-PU subtotal rows using `SUMIF(Project_Details[[#All]],...)`.
  - Row 14: merged header cells for year blocks (`P14:AB14` = 2024 months, `AP14:BB14` = 2025, `CC14:CO14` = 2026…).
  - Rows 15–16: merged `O15:O16` — column for Project type / status.
  - Rows 17+: the `Project_Details` structured table itself.
  - ~293 columns = (Project metadata 14 cols) + (24 months × multiple metric columns — Firm FTE, Named FTE, Unnamed FTE, Probability-weighted FTE, Revenue, Margin).
- **Role in cycle.** Stage 4 — demand-side edit.
- **How filled.** Manual entry per project, with pipeline imported via paste from CRM.
- **Key formulas.**
  - The ONLY data validation in the workbook: `K74 K168 K204 K228 K191 K47 K102 K140 K154 K220 K261 K276 K462 K479 K502 K213` with list `$K$1:$K$10` — a project-type lookup.
  - 40 conditional formats (margin bands, date-past-end highlighting).
  - Structured table `Project_Details` (rId3) — the only "real" table in the workbook.
- **Pitfalls.**
  - 40 conditional formats make performance on save ~2s per edit.
  - Data validation is applied to **only 16 cells** out of potentially thousands.
  - Column merging in row 14 breaks SUMIF references if you insert a month column.
  - No probability-per-project field displayed in the `Project_Details` table header — it's buried in the `MUdetails&probability` helper sheet.
- **Target screen.** `Projects.tsx` (already exists for 2026 months) — needs to become the full 24-month view with probability, firm/named/unnamed slicing, and per-PU demand. Make it editable with saved commits per cycle.
- **Ripple effects.** Drives `CCA_Summary` (Pipeline blocks), `CCA_TWP`, `Delta FC_FC (check)`.

#### Sheet 24 — `bFTEvs FTE` (1048576×19, visible)
- **Purpose.** Integrity check: bFTE ≤ FTE at row/grade level.
- **Structure.** Header + ~dozens of data rows, but declared as full-height (1,048,576) — a red flag that someone extended a formula range down.
- **Role in cycle.** Stage 6.
- **How filled.** Formula-driven from per-PU tabs.
- **Pitfalls.** The "max_row=1048576" wastes memory and slows save. Likely a `VLOOKUP` copy-down without `IFERROR`.
- **Target screen.** Appears as one of the DQ rules in `DQ.tsx` (rule: `bFTE_project ≤ FTE_CSS` per (PU, grade, period)).
- **Ripple effects.** None (check sheet).

#### Sheet 25 — `CCA_TWP` (136×97, visible)
- **Purpose.** Total Workforce Planning: per-PU Supply vs Demand (Firm + Named-weighted + Unnamed + Ambition) with the delta highlighted.
- **Structure.** A vertical stack: one block per PU (including CCA_Total at top), each block has ~13 rows: HC EOM, Supply with/without Resource Plan, EEC, FTE assigned, FTE project+opps, Firm, Named-weighted, Unnamed, prev FC, delta, Ambition. 97 columns because it supports monthly granularity across two years and two cycles.
- **Role in cycle.** Stage 6 / Stage 7 — the headline slide for resource planning discussions.
- **How filled.** Entirely formulaic: pulls from `CCA_PU_X` (per-PU tabs, row 79 and 103), `CCA_Summary` (rows 17, 53, 58, 61, 64, 147, etc.), and `Project_Details` via `SUMIFS`.
- **Key formulas.**
  - `=CCA_Total!R79` (HC EOM pull).
  - `=CCA_Total!R103-SUM(CCA_Total!$R22:R22)` (Supply with Resource Plan).
  - `=CCA_Summary!Q58+CCA_Total!PO3` (Firm = named subtotal + project details subtotal).
  - `=SUMIFS(Project_Details[[#All],...])` for Firm/Named/Unnamed per-month per-PU demand.
- **Pitfalls.** Deeply nested references make this sheet the most fragile in the workbook if anyone renames a PU tab. Several rows (prev FC row 68, delta row 69 on some blocks) are empty because the previous cycle didn't have this layout — not errors, just gaps.
- **Target screen.** A new page or a new tab on `Cockpit.tsx`: "Workforce Plan" — one row per PU, columns = month, cell shows Supply/Demand bar. Should be the second most important screen after the cockpit.
- **Ripple effects.** Review pack; feeds PU-leader conversations.

#### Sheet 26 — `MUdetails&probability` (120×15, **hidden**)
- **Purpose.** Per-MU project pipeline with probability of conversion.
- **Structure.** Header rows `A1:O1` / `A39:O39` / `A80:O80` (three MU blocks), each with project list, ambition FTE, probability %, weighted FTE.
- **Role in cycle.** Stage 4 — input to the Named-weighted layer in `Project_Forecast`.
- **How filled.** Manual paste from CRM pipeline export + judgment.
- **Pitfalls.** Hidden; rarely reviewed. Probability is a free-text percentage with no validation.
- **Target screen.** A tab on `Projects.tsx` (Pipeline sub-tab) with explicit probability field and auto-weighted demand column.
- **Ripple effects.** Named-weighted layer of `CCA_Summary` row 61 etc.

#### Sheet 27 — `GFS_Summary_2026` (821×50, visible)
- **Purpose.** Current-year pivot over `GFS_DB` with per-project per-month hours/FTE, segmented by Grupowanie_Godzin.
- **Structure.** Conventional pivot; 7 conditional-format rules; merged header cells `B1:D1`, `F1:AA1`.
- **Role in cycle.** Stage 1 / Stage 2 — feeds the Actuals side.
- **How filled.** Manual refresh.
- **Pitfalls.** Hardcoded "2026" in name means the sheet has to be duplicated/re-named each year, missing from some cross-refs if copy-down incomplete.
- **Target screen.** Backend only — computed on ingest.
- **Ripple effects.** `CCA_Summary`, `CCA_Total`, per-PU actuals.

#### Sheet 28 — `GFS_DB_2025` (30688×45, **hidden**)
- **Purpose.** Frozen prior-year GFS data — reference for year-over-year comparisons.
- **Structure.** Same schema as `GFS_DB` but archived.
- **Role in cycle.** Occasional reference only.
- **How filled.** Frozen at year-end.
- **Pitfalls.** 30k rows held in memory permanently adds to workbook bloat.
- **Target screen.** Backend only — historical fact table partition.
- **Ripple effects.** Minor — YoY references.

#### Sheet 29 — `GFS_Summary_2026 (man-reserve)` (197×20, visible)
- **Purpose.** Sub-pivot filtered to `IDC_MAN_Reserve` booking — the "management reserve" pool tracked separately.
- **Structure.** Small pivot with its own 10 conditional formats.
- **Role in cycle.** Stage 6 — called out on a review slide.
- **How filled.** Filter of the main pivot.
- **Target screen.** A filter preset on the Project/Hours explorer.
- **Ripple effects.** Transparency of management-reserve utilisation.

### 3.4 Database (source) sheets

#### Sheet 30 — `GFS_DB` (30688×49, visible)
- **Purpose.** **Source of truth for project-time.** Every hour every employee booked to every project.
- **Structure.** 49 columns:
  - Identity: Full Name, Global Group ID, Employee Number.
  - Job: Job Qualification (e.g., NCCB2), Job Function Code (CSS/EEC/Z), Local Grade, Group Grade.
  - PU: PU Code of Employee, PU Code of Project, People Unit.
  - Project: Project Type, Project Number, Project Name, PM, Customer.
  - Time: Cost Gl Month, Expenditure Item Month, Cost Qty (hours), Expenditure Type (RC_Time Std / RC_Time Sickness × 0.69).
  - Derived: `FTE's = Cost Qty / 184`, `Grupowanie_Godzin` (16-category bucket), `techniczny = Practice & PU & SBU & Project & MU & Country` (concat join key).
  - Commercial: Sbu Name, Bu Name, Practice, SBU, Industry, MU, Account Cluster, Country.
  - Type: EMP_Type.
- **Role in cycle.** Stage 1 — the single most critical upload.
- **How filled.** Paste-special from GFS extract.
- **Key formulas.**
  - `XLOOKUP(AC2, tbl_GFS_DB_2026[techniczny], tbl_GFS_DB_2026[Grupowanie_Godzin])` — classifies each booking into the 16 categories.
  - Columns AV/AW currently carry `#REF!` — indicates a broken mid-cycle reference, likely from an incomplete copy.
- **Pitfalls.**
  - 30,688 rows × 49 cols + 30,688 formulas = very slow save (~30s).
  - `techniczny` join key depends on exact casing of `MU`, `Country`, `SBU`, etc. — silent misses show as missing rows in pivots.
  - `Grupowanie_Godzin` classification rules are buried inside `tbl_GFS_DB_2026` (another hidden table), not visible as a rule set.
- **Target screen.** Backend table. `Ingestion.tsx` shows row counts — extend to show per-category counts (hours booked to each Grupowanie_Godzin), with expected vs observed (from prior month).
- **Ripple effects.** EVERY downstream sheet depends on this.

#### Sheet 31 — `HR_Summary` (702×20, visible)
- **Purpose.** Pivot from `HR_DB` with Hired YES/NO filter, by PU and Location.
- **Structure.** Merged headers `B1:E1`, `F1:H1`, `I1:T1`. Rows 2+ are pivot output.
- **Role in cycle.** Stage 1.
- **How filled.** Pivot refresh.
- **Target screen.** Backend aggregation.
- **Ripple effects.** Feeds `CCA_HR` pivots and per-PU rows 3–21.

#### Sheet 32 — `HR_DB` (2010×44, visible)
- **Purpose.** **Source of truth for people.** Monthly-snapshotted stacked facts.
- **Structure.** 44 columns:
  - Temporal: Month.
  - Identity: Last Name, First Name, Employee Number, Name (computed), Employee_Number composite.
  - Employment: Hired YES/NO, Date of employment, Date of termination, Leaver, Joiner?.
  - Job: Organization Name, Organization Number, Production Unit, Qualification, Job type, Job name zgodnie z modelem, Grade, Contract manager.
  - Location: Location.
- **Role in cycle.** Stage 1.
- **How filled.** Paste-special monthly.
- **Pitfalls.** Stacked by month — same person appears in every month they were active, inflating row count. Employee_Number composite is used as the dedup key but is itself a formula.
- **Target screen.** Backend; `People.tsx` is the UI.
- **Ripple effects.** `HR_Summary`, `CCA_HR` pivots, every HC row in per-PU tabs.

#### Sheet 33 — `Check FTE vs. HC` (964×22, visible)
- **Purpose.** Reconcile `GFS_DB` (hours → FTE) against `HR_DB` (headcount × part-time factor).
- **Structure.** Merged headers `B2:H2`, `O2:U2`, `J8:M8`. Per-employee row with current-month GFS hours, HR part-time factor, computed FTE, delta.
- **Role in cycle.** Stage 6.
- **How filled.** `XLOOKUP("8310_"&B, …)` for HR→GFS join (the "8310_" prefix is the PL legal entity code).
- **Key formulas.** `=GFS_FTE − HR_FTE_equiv` with conditional-format red when |delta| > 0.2.
- **Pitfalls.** Join prefix "8310_" is hard-coded; multi-entity Capgemini Poland splits break it.
- **Target screen.** A DQ rule in `DQ.tsx`: "GFS FTE vs HR headcount reconciliation" with a drill-through to the employees with delta.
- **Ripple effects.** None downstream (check sheet).

#### Sheet 34 — `Arkusz1` (84×4, visible)
- **Purpose.** Scratch / legacy sheet (Polish "Arkusz1" = "Sheet1" default name).
- **Structure.** 84 rows × 4 cols, mostly empty.
- **Role in cycle.** **None** — should be deleted.
- **Target screen.** N/A.
- **Ripple effects.** None.

#### Sheet 35 — `Salog_SE2` (21×6, visible)
- **Purpose.** Salary log for SE2 — appears to be a one-off personal note.
- **Structure.** 21 rows × 6 cols.
- **Role in cycle.** None documented — controller-only note.
- **Target screen.** N/A; migrate to a private Note system.
- **Ripple effects.** None.

#### Sheet 36 — `Joiners_summary` (184×34, visible)
- **Purpose.** Pivot on `Joiners_DB` by month × PU × grade.
- **Role in cycle.** Stage 1 — feeds per-PU Joiners rows.
- **How filled.** Pivot refresh.
- **Target screen.** `PeopleFlow.tsx → Joiners` tab.

#### Sheet 37 — `Joiners_DB` (200×28, visible)
- **Purpose.** Planned & actual joiners list — one row per person per planned start.
- **Structure.** 28 cols:
  - Lp, Nazwisko Imię (Name), PU, Dział (CCA-PL-CAPPS-…), Lokalizacja, Stanowisko (Position), Grade, Data zatrudnienia (Start date), Źródło aplikacji (Recruitment source), Wymiar etatu (Part-time factor: UZ contractor, 0.5, 1.0), Job Requisition, PDL (recruiter), SKILL_2026, DE level, Transfer flag, MASTER SKILL, PU_NAME, PRACTICE, MONTH, Is from the future (flag), No show, komentarz (comments).
- **Role in cycle.** Stage 1 + Stage 3.
- **Pitfalls.** Mixed Polish/English column names. "No show" is a boolean that should retire the row.
- **Target screen.** `PeopleFlow.tsx → Joiners` table + edit modal.
- **Ripple effects.** `Joiners_summary`, `CCA_HR` pivot, per-PU Joiners rows 22–40.

#### Sheet 38 — `Leavers_summary` (22×18, visible)
- **Purpose.** Pivot on `Leavers_DB`.
- **Role in cycle.** Stage 1.
- **Target screen.** `PeopleFlow.tsx → Leavers` tab.

#### Sheet 39 — `Leavers_DB` (95×20, visible)
- **Purpose.** Confirmed and planned leavers list.
- **Structure.** 20 cols:
  - Name, GGID, Local Number, Grade, Date Of Joining, Date Of Leaving, Engagement, Production Unit, Direct Supervisor, City, Position Name PL, FTP (part-time factor), Login, LTA end of previous month, BU, Practice, month of leave, People Unit, clarity id, comments.
- **Role in cycle.** Stage 1 + Stage 3.
- **Pitfalls.** "LTA end of previous month" is a free-text note; should be typed. Position name is in PL only.
- **Target screen.** `PeopleFlow.tsx → Leavers`.
- **Ripple effects.** Leavers_summary, CCA_HR, per-PU Leavers rows 41–59.

#### Sheet 40 — `Contract_of_mandate_summary` (75×26, visible)
- **Purpose.** Pivot on `Contract_of_mandate_DB`.
- **Role in cycle.** Stage 1.
- **Target screen.** `PeopleFlow.tsx → Contract of Mandate` tab (new).

#### Sheet 41 — `Contract_of_mandate_DB` (184×24, visible)
- **Purpose.** Active UZ (contract-of-mandate) contractors by month.
- **Structure.** 24 cols: Month, Local Number, GGID, Last Name, First Name, Location, SBU, BU, BU (Practice), PU (Sub Practice), Production Unit, Engagement, Contract Start date, Login, E-mail, People Manager, N+1 People Manager, Leaver (flag), …
- **Role in cycle.** Stage 1.
- **Pitfalls.** Same person may appear in multiple months; dedup required for active-as-of headcount.
- **Target screen.** `People.tsx` with a Z/UZ filter.
- **Ripple effects.** Feeds row 164–171 (UZ block) on per-PU tabs and Joiners_DB wymiar='UZ' rows.

#### Sheet 42 — `Delta FC_FC (check)` (764×38, visible)
- **Purpose.** **The FC/FC reconciliation engine.** Per-project-per-PU delta of current FC vs previous FC in FTE, bFTE, and ARVI terms, with employee-level side-tables.
- **Structure.**
  - Rows 1–7: headers; row 5 has COUNTA formulas counting populated cells in specific column ranges (`=COUNTA(R8:R35)-1`) — a "how many projects this month" gauge.
  - Rows 8–35: the main per-project delta table for PU = CCA_Complex Transformation (other PUs have similar blocks further down before the empty tail begins).
  - Row 12–onwards per project: Project Name, FTE 03'26, prev FTE 03'26, diff FTE 03'26, bFTE 03'26, prev bFTE 03'26, diff bFTE 03'26, ARVI 03'26.
  - Columns O–V: side-table — per-employee booking history: Local Grade, Full Name, and monthly FTE columns 2025-11, 2025-12, 2026-01, 2026-02, 2026-03.
  - Columns AC–AJ: second side-table — per-project monthly FTE.
- **Role in cycle.** Stage 6 — authoritative FC/FC variance source.
- **How filled.** A PivotTable-like output, but hand-assembled with array formulas.
- **Key formulas.** Mix of `GETPIVOTDATA`, `SUMIFS`, `XLOOKUP`.
- **Pitfalls.**
  - 764 rows with only ~35 populated — the rest is stale/empty.
  - The header row 1 ("project forecast") and row 2 ("CTR ... Operational Project ... Grundsteuer Konsens") are static filter labels from a pivot, i.e. the current filter is "one specific project" — meaning the sheet is actually a controller's ad-hoc drill sheet, NOT a systematic delta table as the name suggests.
- **Target screen.** A dedicated "FC/FC reconciliation" page with proper systematic delta per (PU, project, grade). Should **replace** `attributeVariance` heuristic in `forecast.ts`.
- **Ripple effects.** Informs FC_FC per PU discussion.

---

## 4. Cross-sheet data model

### 4.1 Entities (in prose ER diagram)

**Root entities**

- `Period` — month ISO string `YYYY-MM`. Natural key. Foreign-keyed by everything.
- `ProductionUnit` — 9 leaf PUs (`PL01NC01..10` minus NC09 for Integration which exists in Intro but is sparse in the current data), plus 2 virtual rollups (`CCA_SE_total`, `CCA_Total`). Attributes: `code`, `name`, `isVirtual`, `leafChildren[]` (for virtual), `areaLead`, `practice`.
- `MarketUnit` — ~30 MUs (AUTO, VW Group, MHT, PS, CPRDT/RED, LS&EUC, BAYER, Sogeti/GDC, UNN/Nordics/Netherlands/UK, NSC, Other BU…). Attributes: `code`, `name`, `parentGroup` (for UNN bundle, Nordics, etc.).
- `Grade` — grade code (A4/A5, B1/B2, C1/C2, D1/D2, E1/E2, F1/F2, NG, Z). Attributes: `code`, `band` (intern/dev/senior/mgmt/smgmt/uz), `isContractor`.
- `Location` — where the employee sits (NSC NCE Warsaw/Wroclaw/Lublin/Katowice/Poznan/Opole/Lodz, 3City = Gdansk/Gdynia/Sopot). Drives `ADMIN!` phasing selection.
- `Project` — one per project number. Attributes: `number`, `name`, `customer`, `primaryPu` (PU code of project), `accountCluster`, `mu`, `country`, `bu`, `sbu`, `projectType` (Firm / Named / Unnamed / Ambition / Operational / Internal), `probability` (for named/unnamed), `pm`.
- `Employee` — `ggid`, `localNumber`, `name`, `grade`, `location`, `employeePu`, `empType` (CSS/EEC/Z), `qualification`, `peopleManager`, `status` (active/leaver/future-joiner).
- `ForecastCycle` — `id` (e.g., `fc-2026-04`), `label` ("FC April 2026"), `status` (open/editing/reconciling/locked/archived), `openedAt/by`, `closedAt/by`, `basedOnActualMonth`, `previousCycleId`.

**Fact tables**

- `HRSnapshot` — `(cycleId, period, employeeId)` PK. Attributes: everything from HR_DB (location, PU, grade, hired flag, joiner/leaver flag, contract manager, part-time factor).
- `TimeBooking` — `(cycleId, period, employeeId, projectId)` PK; Attributes: `hours`, `fteDerived = hours/184`, `expenditureType` (RC_Time Std / RC_Time Sickness), `grupowanieGodzin`, `costGlMonth`, `expenditureItemMonth`. Source: GFS_DB.
- `JoinersPlan` — `(cycleId, month, employeeId)` PK. Attributes: from Joiners_DB. `confirmedFlag`.
- `LeaversPlan` — same for Leavers_DB.
- `ContractOfMandate` — UZ contractor monthly active list.
- `ProjectForecast` — `(cycleId, projectId, puCode, period)` PK. Attributes: `firmFte`, `namedFte`, `namedProbabilityPct`, `namedWeightedFte = namedFte * prob`, `unnamedFte`, `ambitionFte`, `revenue`, `margin`.
- `ForecastCell` — the **single canonical fact cell**. `(cycleId, puCode, period, metric, grade, mu?)` PK. Attributes: `value`, `source` (manual/auto_baseline/scenario_promote/ingestion/seed/rollforward), `editedBy`, `editedAt`, `previousValue`. The grade and mu fields are nullable — ARVE rows have grade, bFTE-per-MU rows have mu, HC EOM has neither. The existing app's `ForecastCell` type is close but lacks `grade` and `mu` dimensions.
- `AuditLog` — append-only: `(timestamp, actor, entity, entityId, beforeValue, afterValue, cycleId, reason?)`.
- `Comment` — `(timestamp, author, scope: cell|row|pu|period, scopeRefs, text)`.
- `DqRun` — `(timestamp, cycleId, ruleId, status: pass/fail/waive, delta?, waivedBy?, waivedReason?)`.

**Derived (materialised) views**

- `ActualsByPuGradePeriod` — aggregate from `TimeBooking` + `HRSnapshot` to the `ForecastCell` grain for `source=ingestion`.
- `ArveByPuGradePeriod` — `bFTE / (FTE_CSS − Vacation)` per grade, with the percentage banding.
- `FcVsFcDelta` — join `ForecastCell` at `cycleId=N` to `cycleId=N−1`, grouped by (puCode, period, metric). The sum of per-project deltas equals this by construction.
- `DemandVsSupply` — per (PU, period): Supply (HC × FTE_factor − absences) vs Demand (Firm + NamedWeighted + Unnamed + Ambition from `ProjectForecast`).

### 4.2 Relationships

```
Employee  *---*  Project             (via TimeBooking)
Employee  1---*  HRSnapshot          (one per month while active)
Employee  0..1-0..1 Grade
Employee  0..1-0..1 Location
Employee  0..1-0..1 ProductionUnit   (employee PU, may differ from project PU)
Project   *---1 ProductionUnit       (project's owning PU)
Project   *---1 MarketUnit
ProductionUnit  1---*  ForecastCell
ProductionUnit  *---0..*  ProductionUnit (leaf → virtual rollups)
ForecastCycle  1---*  ForecastCell
ForecastCycle  1---1  ForecastCycle (previousCycle, for FC/FC delta)
ForecastCell  1---*  AuditLog
ForecastCell  1---*  Comment
```

### 4.3 Key derived quantities & formulas

- `FTE = TimeBooking.hours / 184`.
- `FTE_CSS = Σ FTE where EMP_Type='CSS'`.
- `Vacation_FTE = Σ FTE where Grupowanie_Godzin='Vacation'`.
- `ARVE_base = FTE_CSS − Vacation_FTE − UnpaidLeave_FTE`.
- `bFTE_CSS = Σ FTE where EMP_Type='CSS' AND Grupowanie_Godzin IN ('Project_Time','BDC-PL','BDC-Sold','Project sold other')`.
- `ARVE_Reported = bFTE_CSS / ARVE_base` (with IFERROR zero-guard).
- `ARVI = bFTE_CSS / FTE_CSS` (no vacation adjustment).
- `HC_EOM[m] = HC_BOM[m] + Joiners[m] − Leavers[m] + TransfersNet[m]`.
- `HC_BOM[m] = HC_EOM[m−1]` (the BOM column is always a look-back; rollforward identity).
- `Named_weighted_FTE = Named_FTE × Named_probability_pct`.
- `Supply_with_ResourcePlan = FTE_CSS − Σ future-joiners not yet on a resource plan`.
- `Supply_WO_ResourcePlan = Supply_with_ResourcePlan − Σ additional resource-plan-only adds`.

### 4.4 Flow diagram (text)

```
  (HR team CSV) → HR_DB ────┐
  (GFS extract) → GFS_DB ───┤
  (Joiners list) → Joiners_DB┤─→ ingestion & classification (Grupowanie_Godzin)
  (Leavers list) → Leavers_DB┤
  (Contract UZ) → CoM_DB ────┘
                            ↓
              per-person/period aggregation
                            ↓
            CCA_Actuals (pivot) + CCA_HR (pivot) + ARVE pivot
                            ↓
         per-PU tabs (actuals fill) + per-PU tabs (manual forecast edit)
                            ↓
            CCA_Total (roll-up) ← CCA_SE_total
                            ↓
   CCA_Summary (MU grid) + Headount&FTE + FC_FC per PU + Monthly Overview
                            ↓
                       CCA_TWP (supply vs demand)
                            ↓
                       Review pack / sign-off
```

Project_Forecast sits alongside, feeding `SUMIFS` into CCA_Summary and CCA_TWP.

---

## 5. Gap analysis vs. the existing React app

The app at `/Users/maciek/ontroling` has the skeleton in place. Let me enumerate what's there, what's missing, and where each Excel sheet maps.

### 5.1 What the app already has (strengths)

| Component | Location | Excel equivalent | Status |
|---|---|---|---|
| 18-route shell with nav | `src/App.tsx` | Multi-sheet workbook | Done |
| Domain types | `src/types.ts` | Implicit in Excel | 80% — add grade, MU fields |
| Zustand store with persist | `src/store.ts` | Workbook file save | Done |
| Ingestion (.xlsm SheetJS parse) | `src/pages/Ingestion.tsx` | Manual paste-special | Done for parse; missing orchestration + reconciliation |
| Cockpit with KPI cards | `src/pages/Cockpit.tsx` | Headount&FTE + Intro | Done |
| PU detail grid | `src/pages/PuDetail.tsx` | per-PU tab | **Major gap — see below** |
| Projects × 2026 | `src/pages/Projects.tsx` | Project_Forecast | 30% — needs 24-month view, probability, structured-table equivalent |
| People browser | `src/pages/People.tsx` | HR_DB + ARVE trailing | Done for basics |
| ARVE heatmap | `src/pages/Arve.tsx` | ARVE sheet | Done |
| FC/FC heatmap | `src/pages/FcFc.tsx` | FC_FC per PU | 50% — period × PU only, not grade × metric × period |
| FC vs Budget | `src/pages/FcVsBudget.tsx` | Budget 2026v2 check | Done skeleton |
| Trends | `src/pages/Trends.tsx` | Headount&FTE series | Done |
| PeopleFlow | `src/pages/PeopleFlow.tsx` | Joiners/Leavers_summary | Done — missing CoM tab |
| MarketUnit | `src/pages/MarketUnit.tsx` | CCA_Summary MU block | Done skeleton |
| Bench | `src/pages/Bench.tsx` | Arve <65% filter | Done |
| Scenarios | `src/pages/Scenarios.tsx` | — (Excel has none) | Done |
| DQ | `src/pages/DQ.tsx` | Check FTE vs. HC + bFTEvs FTE + CCA_Total row 139 | Skeleton |
| Review Pack | `src/pages/ReviewPack.tsx` | Manual PowerPoint | Skeleton |
| Admin / Cycle | `src/pages/Admin.tsx` | Intro + ADMIN | Partial |
| ForecastIndex / effectiveValue | `src/lib/forecast.ts` | per-PU ARVE/FTE formulas | **~15% — see below** |
| attributeVariance | `src/lib/forecast.ts` | Delta FC_FC (check) | **Placeholder — needs replacement** |
| Demo data (670 employees) | `src/lib/demoData.ts` | — | Good seed |

### 5.2 What's missing (must-build)

**Data model gaps**
1. **`ForecastCell` has no `grade` or `mu` axis.** Excel per-PU tabs break HC by grade (rows 3–21, 80–97) and bFTE by MU (rows 110–121); the app cannot represent these.
2. **No `ForecastCell.source='rollforward'`** — the HC_BOM → HC_EOM chain isn't modelled.
3. **No `AuditLog` type.** `forecastCells` is replaced whole on edit — before/after state is lost.
4. **`ForecastCycle` lacks `previousCycleId` and `lockedAt` hash.**
5. **No `Project.probability`, no `Project.type` enum, no `Project.accountCluster`.** `Projects.tsx` treats each project as a flat demand line.
6. **No `TimeBooking` fact.** Ingested hours are not stored at transactional grain — so re-classification or drill-through per-person-per-project is impossible.
7. **`marketUnits` in `demoData.ts` doesn't include UNN, Nordics, Netherlands, UK as top-level entries despite these being the largest review-pack slice.**

**Screen gaps**
8. **`PuDetail.tsx` is too shallow** — no grade breakdown, no 2024 actuals columns, no previous-FC snapshot, no delta column, no keyboard copy-paste.
9. **No "Workforce Plan" screen equivalent to CCA_TWP** — the single most important operational view.
10. **No "FC/FC Reconciliation" screen equivalent to Delta FC_FC (check)** — where every delta is attributed to a movement.
11. **No `CCA_Summary`-style MU × period × block screen** — `MarketUnit.tsx` shows one block only (Current FC).
12. **No `Check FTE vs. HC` DQ page with person-level drill-down.**
13. **`Ingestion.tsx` lands rows but does not produce the pivot equivalents** — so post-upload, nothing downstream sees the data.
14. **No "Cycle Close" flow** that freezes previous-FC snapshot for the next cycle.
15. **No comment system scoped to cells.** Excel uses `AT1:AT2` merged cells for cycle-level comments; the app should go cell-level.
16. **No DQ rule registry** — `DQ.tsx` hardcodes three checks; the workbook implies a taxonomy of at least 15 (GFS vs HR, bFTE ≤ FTE, HC rollforward identity, CCA_Total row 139 check, `Delta FC_FC (check)` counter, Project_Forecast SUMIFS integrity, missing probability, out-of-range ARVE, orphaned grade, orphaned PU assignment, missing location, unclassified GFS booking, #REF! in pivot cache, negative FTE, null Grupowanie_Godzin).

**Engine gaps**
17. **`effectiveValue` does simple FTE-weighted roll-up** — it doesn't compute ARVE from primitives. For a fix we'd feed it `bFTE`, `FTE_CSS`, `Vacation`, `UnpaidLeave` per (PU, grade, period) and derive ARVE.
18. **`attributeVariance` is heuristic.** Replace with a per-movement reconciliation ledger.

**UX / workflow gaps**
19. No bulk scenario-to-forecast promotion with preview diff.
20. No export to the legacy Excel workbook shape (round-trip).
21. No end-of-cycle automated PowerPoint generation.

### 5.3 Priority mapping

Category   | Count | Effort bucket
---|---|---
Data model | 7 | S/M each
Screens | 9 | M/L each
Engine | 2 | L each
UX | 3 | S/M each

Total: ~21 items; roughly 3–4 weeks of focused React/TypeScript development for one senior engineer, assuming the backend / persistence side is handled by the existing Zustand-persist-to-localStorage + SheetJS round-trip.

---

## 6. Forecast engine specification

### 6.1 Rollforward math (must tie to Excel to 2 d.p.)

For any (PU, grade, period m):

```
HC_BOM[m] = HC_EOM[m−1]
HC_EOM[m] = HC_BOM[m] + Joiners[m] − Leavers[m] + TransfersIn[m] − TransfersOut[m]

HC_EOM_all = Σ_grade HC_EOM[g, m]
HC_avg[m]  = (HC_BOM[m] + HC_EOM[m]) / 2     // for FTE computation
```

Use `HC_avg` only for monthly FTE conversion; the reported HC figure on dashboards is always **HC_EOM**.

### 6.2 Hours → FTE

```
FTE_booked[emp, m] = Σ hours[emp, m] / 184
```

184 is the Capgemini Poland standard working hours per month constant. Do **not** vary by month length — match Excel exactly.

For `Expenditure Type = 'RC_Time Sickness'`, multiply by **0.69** (the standard sickness pay reduction). For all other expenditure types, factor = 1.00.

### 6.3 Grupowanie_Godzin classification (16 buckets)

```
Project_Time           → billable, revenue-generating client work
BDC-Sold               → sold bench billed to internal dev centre
BDC-PL                 → Poland internal dev centre (overhead)
Project sold other     → misc. sold work
Vacation               → annual leave
IDC_Sickness           → sickness absence (apply 0.69 factor)
Unpaid_Leave           → unpaid absence
IDC_L&D_Standard       → Learning & Development
IDC_L&D_Onboarding     → onboarding training
IDC_MAN_STORM          → management storm reserve
IDC_MAN_OTHER          → other management
IDC_MAN_Resource       → resource management time
IDC_MAN_Reserve        → management reserve pool
IDC_Recruitment        → recruitment support
IDC-Bench              → non-billable bench
Internal Projects      → internal initiatives
```

Classification is done via `XLOOKUP` on a frozen classification table `tbl_GFS_DB_2026[techniczny]`. Port that table to the app as `hours_classification_rules.json` with rules: `(Practice, PU, SBU, Project, MU, Country) → Grupowanie_Godzin`. Default to `IDC-Bench` if no rule matches, with a DQ warning.

### 6.4 FTE/ARVE derivation

Per (PU, grade, period):

```
FTE_CSS[g, m]      = Σ FTE_booked[emp, m] where emp.empType='CSS' and emp.grade=g and emp.pu=pu
Vacation_FTE       = Σ FTE where Grupowanie_Godzin='Vacation'
UnpaidLeave_FTE    = Σ FTE where Grupowanie_Godzin='Unpaid_Leave'
Sickness_FTE       = Σ FTE where Grupowanie_Godzin='IDC_Sickness' × 0.69

ARVE_base[g, m]    = FTE_CSS − Vacation_FTE − UnpaidLeave_FTE

bFTE_CSS[g, m]     = Σ FTE where Grupowanie_Godzin IN ('Project_Time','BDC-PL','BDC-Sold','Project sold other')

ARVE_Reported[g,m] = IFERROR(bFTE_CSS / ARVE_base, 0)
ARVI[g, m]         = bFTE_CSS / FTE_CSS
ARVI_project[g,m]  = 1 - (IDC-Bench%)(PU,m) - (IDC_L&D_Standard%)(PU,m) - (IDC_L&D_Onboarding%)(PU,m)
```

All percentages are computed on the same `FTE_CSS` base.

### 6.5 bFTE by MU

Per (PU, MU, period):

```
bFTE_MU[mu, m] = Σ FTE_booked where emp.pu=pu and project.mu=mu and Grupowanie_Godzin IN ('Project_Time','BDC-Sold','Project sold other')
bFTE_PL[m]     = Σ FTE where Grupowanie_Godzin='BDC-PL'
bFTE_CSS[m]    = Σ bFTE_MU + bFTE_PL          // must tie to Σ_grade bFTE_CSS[g, m]
```

If the sum doesn't tie (within 0.01 FTE tolerance), raise a DQ `bFTE_MU_reconciliation_failed` with actor "ingestion-pipeline".

### 6.6 Vacation forecasting

For future periods (where actuals don't exist), the baseline is:

```
Vacation_FTE[g, m]_forecast = HC_EOM[g, m] × AdminPhasing[location, cycleYear].VacationRate[m]
```

`AdminPhasing` is the port of the `ADMIN` sheet (NSC NCE tier + 3City tier tables). The controller can overlay a manual delta per (PU, period); stored as `source='manual'` on the `ForecastCell`.

### 6.7 Named-weighted demand

```
Named_weighted_FTE[p, pu, m] = Named_FTE[p, pu, m] × Project.named_probability_pct
```

Default probabilities (from practice convention):
- Committed / verbal: 90%
- Advanced pipeline: 60%
- Early pipeline: 30%
- Ambition (unnamed long shot): 10%

### 6.8 FC/FC variance attribution (replaces heuristic)

For any (PU, grade, period) delta `Δ = FC_now − FC_prev` on any metric, decompose:

```
Δ = Σ_movement_type Δ_m
where movement_type ∈ {
  new_joiner,              // person in joiners list, added since prev FC
  leaver,                  // person in leavers list, added since prev FC
  transfer_in, transfer_out,
  project_ramp,            // same employees, changed project mix (Grupowanie or MU)
  bench_change,            // same employees, % bench changed
  arve_drift,              // same employees, same projects, minor ARVE change
  vacation_shift,          // phasing adjustment
  absence_shift,           // sickness/unpaid adjustment
  correction               // controller manual override
}
```

Implementation: join current-cycle `ForecastCell` to previous-cycle `ForecastCell` at the finest granularity (per employee per project per period when possible; else per grade per period). Classify each row by diff dimension (employee changed, project changed, category changed, value changed). Sum must equal Δ by identity. Store in `FcFcAttribution` table keyed by (cycleId, puCode, period, metric, movementType).

The UI shows these as a waterfall per cell or per (PU, period), and the `attributeVariance` function in `forecast.ts` is replaced by a lookup into this table.

### 6.9 Key tests (must ship with the engine)

- `test_rollforward_identity`: for every (PU, grade, period), `HC_EOM − HC_BOM − Joiners + Leavers − TransfersIn + TransfersOut = 0`.
- `test_arve_base_nonneg`: `ARVE_base ≥ 0` (if negative, absence > capacity — data issue).
- `test_bFTE_le_FTE`: `bFTE_CSS ≤ FTE_CSS` per (PU, grade, period).
- `test_bFTE_MU_reconciliation`: `Σ bFTE_MU + bFTE_PL = Σ_grade bFTE_CSS` within 0.01.
- `test_arve_in_range`: `0 ≤ ARVE_Reported ≤ 1` (practically; > 1 means overbooking which is flagged).
- `test_vacation_not_exceed_cap`: `Vacation_FTE ≤ 0.25 × FTE_CSS` (tier-2 DQ warning).
- `test_ingestion_row_counts_stable`: ingested row count within ±5% of previous cycle.
- `test_fcfc_attribution_sums`: `Σ Δ_movement = Δ` per (PU, grade, period, metric).

Each test becomes a `DqRule` in the `DQ.tsx` registry.

---

## 7. Prioritised roadmap

10–15 changes, prioritised by ripple/value, t-shirt sized (S = ≤1 day, M = 2–3 days, L = 4–7 days, XL = 8–12 days).

### Tier 1 — Structural (ship to unblock everything else)

| # | Change | Size | Value | Owner touch points |
|---|---|---|---|---|
| R01 | **Extend `ForecastCell` to include `grade` and `mu` dimensions, migrate the store, seed demo data accordingly.** | M | Unblocks per-PU grade detail, bFTE-by-MU rows. | `types.ts`, `store.ts`, `demoData.ts`, `forecast.ts` |
| R02 | **Add `AuditLog` entity + write-path on every `setForecastValue` call.** | S | Audit trail; required for lock/sign-off. | `store.ts`, `Admin.tsx` |
| R03 | **Cycle state machine: `open → editing → reconciling → locked → archived` with role gates from `Admin.tsx` RBAC.** | M | Enforces sign-off discipline. | `store.ts`, `Admin.tsx`, `Cockpit.tsx` |
| R04 | **Cycle close action that snapshots all `ForecastCell` values into a `previousCycle` shadow table.** Previous-FC column in every per-PU/FC-FC view reads from this. | M | Kills the manual copy-paste risk. | `store.ts`, `PuDetail.tsx`, `FcFc.tsx` |

### Tier 2 — The day-job surface

| # | Change | Size | Value | Touch points |
|---|---|---|---|---|
| R05 | **Rebuild `PuDetail.tsx` as a dense editable matrix: grade rows × (2024 actuals / 2025 actuals / 2026 current FC / 2026 prev FC / Δ), with row pinning for HC_EOM, FTE_CSS, bFTE, ARVE.** Keyboard nav, copy-paste, "promote prev FC" row action. | XL | The ONE screen where the controller spends 3 days a month. | `PuDetail.tsx`, a new `<ForecastGrid>` component |
| R06 | **Workforce Plan screen (CCA_TWP equivalent)**: per-PU Supply vs (Firm + NamedWeighted + Unnamed + Ambition), with delta colour. | L | Second-most-important screen for monthly review. | new `Twp.tsx` |
| R07 | **Enrich `Projects.tsx` into a Project_Forecast replacement**: 24-month view, probability field, type enum (Firm/Named/Unnamed/Ambition/Operational/Internal), per-PU demand editable, subtotals. | L | Demand-side is currently stubbed. | `Projects.tsx`, `types.ts` |

### Tier 3 — Pipeline & integrity

| # | Change | Size | Value | Touch points |
|---|---|---|---|---|
| R08 | **Ingestion orchestration**: on upload, classify into Grupowanie_Godzin, materialise `TimeBooking`, `HRSnapshot`, then compute `ActualsByPuGradePeriod` and write `source='ingestion'` cells. Show per-category counts + drift vs previous. | L | Replaces manual pivot refresh. | `Ingestion.tsx`, a new `src/lib/ingestion-pipeline.ts` |
| R09 | **Full ARVE / bFTE / ARVI calculation engine per §6**, with unit tests matching Excel to 2 d.p. on a frozen sample from the workbook. | L | Makes `effectiveValue` correct, unblocks all reporting. | `src/lib/forecast.ts`, `src/lib/forecast.test.ts` |
| R10 | **Replace `attributeVariance` heuristic with reconciliation ledger** per §6.8. | M | Makes FC/FC discussion trustworthy. | `src/lib/forecast.ts`, `FcFc.tsx` |
| R11 | **DQ rule registry (15+ rules from §6.9) with runs, history, waivers.** | M | Codifies `Check FTE vs. HC` + all integrity checks. | `DQ.tsx`, `src/lib/dq.ts` |

### Tier 4 — Review & distribution

| # | Change | Size | Value | Touch points |
|---|---|---|---|---|
| R12 | **FC/FC Reconciliation screen** (replaces `Delta FC_FC (check)`) with per-project drill-down. | M | Ties review discussion to data. | new `FcFcRecon.tsx` |
| R13 | **CCA_Summary-style MU blocks**: Current FC / FC/FC / ARVI / Pipeline / Ambition sub-views on `MarketUnit.tsx`. | M | Enables MU lead conversations. | `MarketUnit.tsx` |
| R14 | **Cell-scoped comments** with @mentions and cycle-scoped feed. | M | Replaces Excel "comment on merged cells". | new `<CellComment>` component, `store.ts` |
| R15 | **Review pack exporter**: PPTX generation from saved screen snapshots + extract to Excel round-trip for group finance. | L | Replaces manual PowerPoint assembly. | `ReviewPack.tsx`, SheetJS export |

### Tier 5 — Nice-to-have (post-MVP)

- R16 Scenario diff UI with before/after side-by-side on `Scenarios.tsx`.
- R17 Keyboard shortcut palette (`⌘K` → "go to PU", "open cycle", etc.).
- R18 Year-over-year comparison view using `GFS_DB_2025` equivalent partition.

### Effort summary

- Tier 1: ~2 M + 1 S = ~1 week.
- Tier 2: 1 XL + 2 L = ~2 weeks.
- Tier 3: 2 L + 2 M = ~2 weeks.
- Tier 4: 2 M + 1 M + 1 L = ~1.5 weeks.

Total for Tiers 1–4: **~6.5 weeks for one senior engineer** — more than the "2–4 weeks" brief. To fit 4 weeks pick **Tier 1 + R05 + R06 + R09 + R10 + R11** and push Tier 4 to the next iteration. To fit 2 weeks pick **R01 + R02 + R05 + R09** and ship an MVP that matches Excel numerically while pushing workflow and review to V2.

---

## Appendix A — Named ranges, validations, macros

### A.1 Named ranges

The workbook's `xl/workbook.xml` defined-names list is effectively empty — the only "names" in use are **structured table references** (Excel 2010+ feature):

| Table name | Sheet | Scope |
|---|---|---|
| `Project_Details` | `Project_Forecast` (rId3) | Project × PU × month demand grid |
| `tbl_GFS_DB_2026` | Referenced only from XLOOKUP inside `GFS_DB!AC` | Classification rules for Grupowanie_Godzin |
| `tbl_ACT_excl.Z` | Pivot on `CCA_Actuals` (veryHidden) | GFS actuals excl. Z contractors |
| `tbl_ACL_FTE_MU` | Pivot on `CCA_Actuals` | GFS actuals by MU |
| `tbl_ACL_only.Z` | Pivot on `CCA_Actuals` | GFS actuals for Z contractors only |

**Consequence:** most inter-sheet references are hard-coded cell addresses (e.g., `=CCA_Total!R79`). Renaming a column or inserting a row silently breaks the network. **In the app, never use positional references; always use entity IDs.**

### A.2 Data validations

There is exactly **one** data-validation range in the entire workbook:

| Sheet | Ranges | Type | Source |
|---|---|---|---|
| `Project_Forecast` | `K74 K168 K204 K228 K191 K47 K102 K140 K154 K220 K261 K276 K462 K479 K502 K213` (16 cells) | list | `$K$1:$K$10` (likely project type list: Firm / Named / Unnamed / Ambition / Operational / Internal / …) |

Every other editable cell is free-text. **In the app, all inputs must be constrained by `types.ts` enums.**

### A.3 Conditional formats

Total conditional-format rule count across the workbook: ~200. Major concentrations:
- `Project_Forecast`: 40 rules (margin banding, overdue dates).
- `UNN`: 27 rules.
- `Cca_Total`, `CCA_Cloud_Native`, `CCA_Head`, `CCA_Complex Transformation`, `CCA_SE_total`, `CCA_SE1-5`, `CCA_EEC`: 11–14 rules each (ARVE colouring, delta magnitude).

Port these as computed CSS class rules on the `<ForecastGrid>` cells.

### A.4 Merged cells

Total merged ranges: ~300. Big offenders:
- `CCA_Summary`: **128 merged ranges** (row banding).
- `ARVE`: 0 (clean).
- Per-PU tabs: 3 each (`AT1:AT2`, `BX1:BX2`, `BY1:BY2`).
- `Project_Forecast`: 22 (year-block headers in row 14).

Merged cells are the single biggest source of friction when programmatically reading the workbook. **In the app, use CSS `colspan`/`rowspan` only for display, never for data model.**

### A.5 Macros

`xl/vbaProject.bin` **is not present** in the `.xlsm` archive. Despite the macro-enabled extension, the workbook relies entirely on worksheet formulas, pivot tables, and the controller's manual procedure. There is nothing to port.

### A.6 Pivot tables

13 pivots across 4 host sheets: `CCA_Actuals` (3), `CCA_HR` (~5, schema indicates), `ARVE` (2), `GFS_Summary_2026` (1), `GFS_Summary_2026 (man-reserve)` (1), `HR_Summary` (1). Every pivot requires manual refresh.

### A.7 External links

No `xl/externalLinks/` part in the workbook — all data lives inside this file. Good for portability, bad for freshness (every refresh is a paste-special).

---

## Appendix B — Glossary

| Term | Definition |
|---|---|
| **ABL** | Application Business Lines — top-level Capgemini org unit containing Practice. |
| **ACT** | Actuals (historical, closed-month numbers). |
| **ARVE** | Adjusted Revenue Earning — `bFTE / (FTE_CSS − Vacation − Unpaid Leave)`. The practice's core utilisation KPI. Bands: <65% bench (red), 65–80% at-risk (amber), ≥80% healthy (green). |
| **ARVI** | ARVE ignoring vacation: `bFTE / FTE_CSS`. Used for project-driven utilisation views. |
| **Ambition** | Un-named, long-shot pipeline used to close supply/demand gaps in the TWP. Probability ~10%. |
| **B'YY** | Budget for fiscal year YY — frozen at annual budget build in Nov/Dec prior. |
| **bFTE** | Billable FTE. Hours booked to billable categories (`Project_Time`, `BDC-Sold`, `BDC-PL`, `Project sold other`) ÷ 184. |
| **BDC** | Business Development Center. `BDC-PL` = Polish internal dev centre, `BDC-Sold` = sold bench. |
| **BOM / EOM** | Beginning / End of Month. HC_BOM_m = HC_EOM_{m-1}. |
| **BU** | Business Unit. One level above Practice. |
| **C&CA** | Custom Code & Cloud Applications — the practice controlled. |
| **CCA_*** | Sheets scoped to the C&CA practice. |
| **CSS** | Core employee type (as opposed to EEC / Z). |
| **CoM / UZ** | Contract of Mandate / "Umowa Zlecenie" — Polish civil contract for contractors. Tracked separately in row 164–171. |
| **Cycle** | A single monthly forecast period. E.g., `fc-2026-04`. |
| **Δ (Delta)** | Variance. `Δ(current FC, previous FC)` is the flagship forecast-to-forecast metric. |
| **DQ** | Data Quality. The rule taxonomy that must pass before cycle lock. |
| **EEC** | Engineering Excellence Center. A leaf PU (PL01NC10) and an EMP_Type. |
| **EMP_Type** | Employment type: CSS / EEC / Z. |
| **FC** | Forecast. Cycle-labelled ("FC April 2026"). |
| **FC/FC** | Current FC compared to the immediately-prior monthly FC. |
| **FTE** | Full-Time Equivalent. Hours ÷ 184. |
| **GFS** | Group Financial System — the project-time system of record. |
| **Grade** | A4/A5 (intern), B1/B2 (dev), C1/C2 (senior), D1/D2 (mgmt), E1/E2/F1/F2 (snr mgmt), NG (UZ intern), Z (UZ contractor). |
| **Grupowanie_Godzin** | Polish: "Grouping of Hours". The 16-category classification of GFS bookings. |
| **HC EOM** | Headcount at End of Month. Primary people metric. |
| **IDC** | Indirect Cost — non-billable categories (Sickness, L&D, MAN, Bench, Recruitment, etc.). |
| **LTA** | Long-Term Absence (used on Leavers_DB for mid-contract off-ramps). |
| **MU** | Market Unit. The client-facing sales dimension. |
| **NSC** | Nearshore Center — Polish Capgemini tier (Warsaw, Wroclaw, Lublin, etc.). |
| **PDL** | Project Delivery Lead (recruitment context, on Joiners_DB). |
| **PU** | Production Unit — delivery-side dimension. PL01NC01..10 are leaf codes. |
| **Practice** | Sub-BU (e.g., CCA). |
| **Rollforward** | The HC_BOM → HC_EOM identity using Joiners / Leavers / Transfers. |
| **SBU** | Strategic Business Unit. Above BU. |
| **SE** | Software Engineering — naming convention for leaf PUs PL01NC03..07. |
| **TWP** | Total Workforce Planning — the supply-vs-demand sheet. |
| **YEL** | Year-End Level. Either the December value or the 12-month average, depending on metric — used as a headline annual figure in dashboards. |
| **`techniczny`** | Polish "technical" — the concat-key field on GFS_DB: `Practice & PU & SBU & Project & MU & Country`. |
| **Z (grade)** | Contractor (umowa zlecenie) grade. Tracked separately in all reports. |

---

*End of analysis. Sheets analysed: 42. Word count target: ~9,500.*
