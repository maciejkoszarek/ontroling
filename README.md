# CCA PracticeView

Web-based controlling cockpit for the Capgemini C&CA (Cloud & Custom Applications) practice — headcount, FTE, bFTE, ARVE, forecasts, joiners/leavers, project demand, pipeline, scenarios, and review packs.

Built as a single-page React prototype that parses the monthly `CCA_PracticeView (N).xlsm` workbook directly in the browser. No backend required.

## Stack

- React 18 + TypeScript 5 + Vite 5
- TailwindCSS 3 with CSS-variable theming (light/dark)
- Zustand 5 for state, with localStorage persistence
- React Router 6
- ECharts 5 (via `echarts-for-react`) for charts
- SheetJS (`xlsx`) for .xlsm / .xlsx parse + export
- Lucide icons

## Getting started

```bash
npm install
npm run dev          # http://localhost:5173
```

On first run the app seeds a deterministic demo dataset (~670 employees, 9 production units, 4 forecast cycles, 24 months of snapshots) so every screen is immediately populated.

Other scripts:

```bash
npm run typecheck    # tsc --noEmit
npm run build        # tsc -b && vite build
npm run preview      # serve the production build
```

## Ingesting a real workbook

1. Open **Ingestion** from the sidebar.
2. Drop a `CCA_PracticeView (N).xlsm` (or any workbook matching the same sheet structure) onto the drop zone, or click **Choose file**.
3. The parser reads:
   - `HR_DB` → employees + current-month snapshot
   - `GFS_DB` → ARVE / billable hours / project allocations
   - `Joiners_DB` / `Leavers_DB` → people flow
   - `Contract_of_mandate_DB` → UZ contractors
4. Parsed data replaces the demo dataset in the store. Use **Reset to demo dataset** on the same page to restore the seed.

Column names are matched loosely (`Employee Number` / `Employee No.`, etc.). Production Unit is inferred from the `Engagement` string when a dedicated column is missing. Dates are parsed from Excel serial numbers via `XLSX.SSF.parse_date_code`.

Export back to Excel with **Export current data to .xlsx** on the same page.

## Screen map

| Route | Screen | Purpose |
| --- | --- | --- |
| `/` | Cockpit | KPI strip, trend chart, variance leaderboard, anomalies, commentary |
| `/trends` | Trends | HC / FTE / bFTE / ARVE trend, series toggles, PU filter |
| `/pu/:code` | PU detail | Editable metric grid, joiners/leavers, drivers, comments |
| `/fcfc` | FC vs FC | Heatmap + top movements with variance attribution |
| `/fc-vs-budget` | FC vs Budget | Heatmap + full-year landing table |
| `/people-flow` | People flow | Joiners & leavers, rolling 12m, attrition |
| `/arve` | ARVE | Employee × month matrix, rolling-3m toggle, histogram |
| `/mu` | Market Unit | MU × month heatmap, stacked FTE, top projects |
| `/projects` | Projects | Demand forecast table, MU/billable filters |
| `/pipeline` | Pipeline | Kanban by MU, weighted FTE, probability |
| `/bench` | Bench | Low-ARVE people, matched projects by skill overlap |
| `/scenarios` | Scenarios | What-if forks of the active cycle, promote to canonical |
| `/dq` | Data quality | Reconciliation checks, waive-with-comment |
| `/review-pack` | Review pack | Wizard → PDF/PPTX export |
| `/ingestion` | Ingestion | Excel upload / export / reset to demo |
| `/admin` | Admin | Cycles, role switcher, theme / density, RBAC matrix |

## Domain model (short form)

- `Period` = `"YYYY-MM"` string; `periodAdd` / `periodRange` helpers in `src/lib/utils.ts`.
- `ProductionUnit` — 9 real PUs (ABAP, COM, DIG, INF, MS, ORC, QA, SAP, SFC) plus two virtual roll-ups (`CCA_SE_TOTAL`, `CCA_TOTAL`) resolved in `src/lib/forecast.ts`.
- `ForecastCell` keyed by `(cycleId, puCode, period, metric)`. `ForecastIndex` wraps a `Map` for O(1) reads.
- 10 forecast metrics: `HC_BEGIN`, `JOINERS`, `LEAVERS`, `HC_END`, `FTE`, `BFTE`, `ARVE_PCT`, `F1`, `F2`, `F_TOTAL`.
- Every forecast edit appends to `audit[]` and is attributable via `attributeVariance()` heuristic (joiners / leavers / movers / project_ramp / arve_drift / other).
- Roles: `controller`, `pu_lead`, `finance`, `hr`, `viewer`. RBAC matrix in `src/pages/Admin.tsx`.

## Anchoring

`currentPeriod` is fixed at `"2026-03"` in `src/lib/utils.ts` so the rolling 24-month window (12 actuals + 12 forecast) is stable across reloads. Change that constant to re-anchor the demo.

## Notes

- Everything persists to `localStorage` under key `cca-practiceview-v1`. Clear it to force a re-seed.
- The preview PDF/PPTX button on the Review pack page is a stub — it alerts with the selected config rather than generating a file.
- The AI assistant drawer is rule-based (deterministic pattern matching over the live store), not an LLM call.
