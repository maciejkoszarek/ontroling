---
title: ForecastIndex & aggregation
owner: architect
---

# Forecast lookup & aggregation — `src/lib/forecast.ts`

## Key

`(cycleId, puCode, period, metric)` keys a `ForecastCell`. Optional axes
`grade` and `mu` split it further:

- Aggregate cells: `grade === undefined && mu === undefined` — what the grid
  normally renders.
- Per-grade cells: `grade !== undefined` — grade-split views.
- Per-MU cells: `mu !== undefined` — MU breakdown views.

Filtering helpers (`selectForecast`, `cellValue`) **skip** cells with any
axis set unless you explicitly query for them.

## `ForecastIndex` class

In-memory index. Two internal maps:

- `map`: `Map<string, ForecastCell>` keyed by the canonical string
  `"${cycleId}::${puCode}::${metric}::${period}"`. Stores aggregate cells.
- `byGrade`: `Map<key, Map<grade, ForecastCell>>`. Stores per-grade cells.

O(1) `get`, `getCell`, `getByGrade`. `rebuild(cells)` is idempotent and should
be called whenever `forecastCells` changes materially (bulk ingest, scenario
promote, lock).

## Reading values

| Scenario | Use |
| --- | --- |
| Quick value lookup | `ForecastIndex.get(...)` |
| Need the cell metadata | `ForecastIndex.getCell(...)` |
| Need to resolve virtual PUs | `effectiveValue(cells, allPus, ...)` |
| Sum over specific PU list | `rollUp(cells, cycleId, metric, period, puCodes)` |
| FTE-weighted average over PUs | `weightedRollup(cells, ...)` (used internally by `effectiveValue` for `PCT_METRICS`) |

## Virtual PU roll-ups

```
if (puCode === "CCA_TOTAL")
  → rollUp (or weightedRollup for PCT_METRICS) over leafPuCodes

if (puCode === "CCA_SE_TOTAL")
  → rollUp (or weightedRollup for PCT_METRICS) over sePuCodes
```

`PCT_METRICS` = `["ARVE_PCT", "ARVI_PCT", "BENCH_PCT", "LND_PCT",
"VACATION_PCT"]`. Anything else is a straight sum.

## Locked cycles

`effectiveCells(live, snapshots, cycles)` returns:

- For cycles with `status ∈ {"locked", "archived"}` and a snapshot present:
  the snapshot cells only.
- For all other cycles: the live cells.
- Both concatenated into a single array.

Use `effectiveCells()` — never `state.forecastCells` directly — when reading
values for display. Write paths may target `forecastCells` directly but must
guard on `canEditCycle(id)`.

## Variance

- `variance(cells, curCycle, prevCycle, pu, metric, period, pus)` →
  `{ current, previous, delta, deltaPct }`.
- `attributeVariance(deltaFte)` returns the driver split
  (`joiners / leavers / movers / project_ramp / arve_drift / other`). Current
  implementation is a fixed-share heuristic — treat as placeholder for a
  future data-driven split.

## Budget

`indexBudget(budget)` builds a `Map<"puCode::metric::period", number>`.
`budgetValue(map, pu, metric, period)` is the O(1) reader. Budget cells do
not have a `cycleId` — budget is annual.

## MAPE

`mape(forecasts, actuals)` — standard mean absolute percentage error,
skipping rows where `actuals[i] === 0`. Used in the FC-vs-actuals accuracy
view.
