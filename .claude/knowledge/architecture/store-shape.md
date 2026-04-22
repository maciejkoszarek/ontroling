---
title: Zustand Store Shape
owner: architect
---

# Store shape — `src/store.ts`

Single Zustand store with `persist` middleware. All slices live in one
`AppState` because the data is highly cross-referential (forecast cells reference
cycles reference PUs reference employees). Splitting into multiple stores would
duplicate selectors without cutting re-renders.

## Slices

### Reference data (immutable post-seed / post-ingest)

| Field | Type | Notes |
| --- | --- | --- |
| `productionUnits` | `ProductionUnit[]` | 10 real + 2 virtual; `leafPuCodes` / `sePuCodes` derived |
| `marketUnits` | `MarketUnit[]` | 9 MUs |
| `locations` | `Location[]` | 6 PL locations incl. REMOTE |
| `grades` | `Grade[]` | 8 grades |
| `projects` | `Project[]` | client + internal projects |

### Facts

| Field | Type | Notes |
| --- | --- | --- |
| `employees` | `Employee[]` | current roster |
| `snapshots` | `EmployeeMonthSnapshot[]` | per-employee-per-month observations |
| `gfsHours` | `GfsHours[]` | timesheet rows |
| `joiners` / `leavers` | their types | people-flow entries |
| `contractOfMandate` | `ContractOfMandate[]` | UZ contractor markers |
| `transfers` | `Transfer[]` | inter-PU moves |

### Forecast & planning

| Field | Type | Notes |
| --- | --- | --- |
| `cycles` | `ForecastCycle[]` | all cycles, any status |
| `activeCycleId` / `previousCycleId` | `string` | driving the UI |
| `forecastCells` | `ForecastCell[]` | **live** cells; keyed by identity axes |
| `lockedSnapshots` | `Record<cycleId, ForecastCell[]>` | frozen on lock; wins over live |
| `budget` | `BudgetCell[]` | yearly budget reference |
| `pipeline` | `PipelineOpportunity[]` | — |
| `projectDemand` | `ProjectDemandForecast[]` | — |
| `scenarios` | `Scenario[]` | what-if forks |

### Cross-cutting

`comments`, `audit` (append-only), `anomalies`, `dqChecks`.

### UI state

`role`, `user`, `filter`, `theme`, `density`, `lastIngest`.

## Actions

Grouped in [src/store.ts:80-159](src/store.ts). Categories:

- **Preferences**: `setRole`, `setTheme`, `setDensity`, `setFilter`,
  `setActiveCycle`.
- **Forecast writes**: `setForecastValue` (single cell), `setForecastValuesBulk`.
- **People-flow**: `addEmployee`, `addJoiner`, `addLeaver`, `transferEmployee`,
  `assignEmployeeToProject`, `unassignEmployeeFromProject`.
- **Cycle lifecycle**: `openCycle`, `startEditing`, `startReconciling`,
  `lockCycle`, `archiveCycle`, `canEditCycle` (predicate).
- **DQ**: `runDqChecks`, `waiveDqCheck`.
- **Scenarios**: `addScenario`, `promoteScenario`.
- **Ingestion**: `ingest` (replaces facts, keeps preferences).
- **Reset**: `resetToDemo` (full reseed).

## Persistence

`persist` middleware. Storage name: **`cca-practiceview-v1`**. Schema-change
rule: if a new field is not forward-compatible (or renames an existing one),
bump the suffix (`v2`). Otherwise reloads on stale clients corrupt.

`partialize` in [src/store.ts:719-737](src/store.ts) lists which fields are
persisted. Reference data (PUs, MUs, grades, etc.) is **not** persisted — it
always comes from `demoData.ts`. Editable facts, forecast cells, cycles,
comments, audit, scenarios are persisted.

## Writing a new action

1. Declare the signature in the `AppState` interface.
2. Implement in the `create(persist(...))` body.
3. Append to `audit[]` if the action mutates domain state.
4. If it mutates types or forecast shape, update this file and the matching
   knowledge page in the same turn.
5. Add a test under `src/store.<feature>.test.ts`.
