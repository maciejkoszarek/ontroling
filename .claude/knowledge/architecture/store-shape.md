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
| `projects` | `Project[]` | client + internal projects; CRUD via `addProject` / `updateProject` |
| `capabilities` | `Capability[]` | skill taxonomy (Java, React, AWS, …); CRUD via `addCapability` / `renameCapability` / `removeCapability` |

### Facts

| Field | Type | Notes |
| --- | --- | --- |
| `employees` | `Employee[]` | current roster; mutated by `addEmployee`, `transferEmployee`, `setEmployeeCapabilities`, `setEmployeeGermanSpeaker`, `setEmployeeClearanceLevel` |
| `snapshots` | `EmployeeMonthSnapshot[]` | per-employee-per-month observations |
| `gfsHours` | `GfsHours[]` | timesheet rows; mutated by `assignEmployeeToProject` / `unassignEmployeeFromProject` |
| `joiners` / `leavers` | `Joiner[]` / `Leaver[]` | people-flow entries via `addJoiner` / `addLeaver`; `addJoiner` can materialize an `Employee` when `status === "actual"` |
| `contractOfMandate` | `ContractOfMandate[]` | UZ contractor markers |
| `transfers` | `Transfer[]` | inter-PU moves recorded by `transferEmployee` |

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

### Configuration

| Field | Type | Notes |
| --- | --- | --- |
| `workingCalendar` | `WorkingCalendarEntry[]` | per-period working days + hours; single source of truth for FTE↔hours conversions app-wide. Seeded via `seedWorkingCalendar(2024, 2028)` using Polish holiday algorithm from [src/lib/workingDays.ts](src/lib/workingDays.ts). Edited in Admin → Working calendar card. Fallback chain in [src/lib/workingCalendar.ts](src/lib/workingCalendar.ts): indexed Map → array find → algorithmic default. |

### UI state

| Field | Type | Notes |
| --- | --- | --- |
| `role` | `Role` | one of `controller`/`pu_lead`/`finance`/`hr`/`viewer` |
| `user` | `{ name; email; puCode? }` | `puCode` scopes `pu_lead` write access for I25 (default `PL01NC03`) |
| `filter` | `AppFilter` | shared PU / period / grade filter bar |
| `theme` | `"light" \| "dark"` | toggled via `setTheme` |
| `density` | `"comfortable" \| "compact"` | table density |
| `lastIngest` | `{ fileName; sheetNames; rowCounts; warnings; at }?` | set by `ingest` only; ephemeral, persisted for display |

## Actions

Grouped in [src/store.ts](src/store.ts) around the body of `create(persist(...))`.
Categories:

- **Preferences**: `setRole`, `setTheme`, `setDensity`, `setFilter`,
  `setActiveCycle`. `setTheme` is a pure state setter — the `dark` class on
  `<html>` is owned exclusively by the effect in
  [src/App.tsx](src/App.tsx), which subscribes to `state.theme`.
- **Working calendar**: `setWorkingCalendarEntry(period, patch)`,
  `resetWorkingCalendar(fromYear?, toYear?)`. Both append an `AuditEntry` with
  `entityType: "working_calendar"` (I29).
- **Forecast writes**: `setForecastValue` (single cell), `setForecastValuesBulk`.
  Both guard on `canEditCycle(cycleId, puCode)`, push the value through
  `validateForecastCell` (clamps I4/I6 + non-negative volumes), and append a
  `"validation-clamp"` audit entry when the value was coerced. Live writes to
  locked/archived cycles are rejected by the guard (I17).
- **People-flow**: `addEmployee`, `addJoiner`, `addLeaver`, `transferEmployee`,
  `assignEmployeeToProject`, `unassignEmployeeFromProject`. `addJoiner` will
  materialize an `Employee` when the joiner is `status === "actual"` with a
  `localNumber` that does not already exist.
- **Projects**: `addProject`, `updateProject` — validate that the
  `projectNumber` is unique (I15), trim strings, append audit.
- **Capabilities**: `addCapability`, `renameCapability`, `removeCapability`,
  `setEmployeeCapabilities`, `setEmployeeGermanSpeaker`,
  `setEmployeeClearanceLevel`. Capabilities are a flat taxonomy; removing one
  cascades through `employees[].capabilities`. Pure reference CRUD — no audit
  entries (they mutate reference data, not facts).
- **Cycle lifecycle**: `openCycle`, `startEditing`, `startReconciling`,
  `lockCycle`, `archiveCycle`, `canEditCycle(id, puCode)` (predicate).
  `openCycle` is controller-only, returns `boolean`, and locks any currently
  active cycle (snapshot + audit) before creating the new one — same path as
  `lockCycle`, so I18 and I27 hold across the transition. `canEditCycle`
  takes `puCode` so `pu_lead` scope (I25) can be enforced at the predicate.
- **DQ**: `runDqChecks` (also computes `dq-arithmetic` from
  `checkArithmeticIdentities` — I1/I3/I5/I7/I8 are DQ-reported, never
  write-enforced), `waiveDqCheck`.
- **Scenarios**: `addScenario`, `promoteScenario`.
- **Ingestion**: `ingest` (replaces facts, keeps preferences; writes
  `lastIngest`).
- **Backup & restore**: `applyImportPatch(patch, source)` — controller-only
  (returns early for non-controller roles), whitelist-guarded bulk replace
  used by the Admin → Data & backup panel. Only replaces data slices
  explicitly listed in the whitelist (reference data + forecast cells +
  working calendar). Never touches preferences (`role`, `theme`, `user`,
  `filter`). Appends a single audit entry with `entityType: "import"`,
  `action: "update"`, `after: { tables, source }` in the standard
  `[entry, ...audit].slice(0, 2000)` position. Callers:
  [src/components/AdminDataBackup.tsx](src/components/AdminDataBackup.tsx)
  after a dry-run validated via [src/lib/dataImport.ts](src/lib/dataImport.ts).
- **Reset**: `resetToDemo` (full reseed).

### RBAC enforcement

Write actions gate on either `get().role` (cycle lifecycle, applyImportPatch)
or `canEditCycle(id, puCode)` (forecast writes). No write path trusts a
caller-supplied role; the guard always re-reads from store state.

## Read-path hook — `useForecastIndex`

[src/hooks/useForecastIndex.ts](src/hooks/useForecastIndex.ts) is the
canonical read subscription for forecast data. It selects `forecastCells`,
`lockedSnapshots`, and `cycles`, merges via `effectiveCells(...)` so locked
cycles serve their frozen snapshot (I17), and returns a memoized
`{ cells, index }` pair.

All read-site pages that render forecast values must use this hook rather
than subscribing to `forecastCells` directly — otherwise they bypass the
lock-snapshot substitution and can show stale live writes for locked
cycles. Current consumers: `Cockpit`, `PuDetail`, `Trends`, `FcVsBudget`,
`Arve`, `AssistantDrawer`. `FcFc` subscribes to `forecastCells` directly
because it needs the raw-live cells for F↔F cross-cycle consolidation.

## Persistence

`persist` middleware. Storage name: **`cca-practiceview-v2`**. Schema-change
rule: if a new field is not forward-compatible (or renames an existing one),
bump the suffix. Additive fields (e.g. `workingCalendar`) are safe without a
bump — Zustand shallow-merges on rehydrate and uses the initial seed for
missing fields.

### Quota-safe storage wrapper

The `storage` option wraps `localStorage` via `quotaSafeStorage()` (in
[src/store.ts](src/store.ts)). On `setItem` `QuotaExceededError`, the wrapper
parses the JSON payload, trims `state.audit` to the most recent 200 entries
(`AUDIT_TRIM_LIMIT`), and retries once. If the retry still fails, it logs and
gives up silently — the app keeps running with a stale persisted snapshot
rather than crashing. Audit is the only unbounded slice (`.slice(0, 2000)`
in-memory) and is therefore the trim target; forecast cells, cycles, and
reference data are bounded by domain cardinality.

`partialize` at the bottom of [src/store.ts](src/store.ts) lists which
fields are persisted. Reference data like PUs, MUs, grades, locations is
**not** persisted — it always comes from `demoData.ts`. Persisted fields:
preferences (`role`, `theme`, `density`, `filter`), `activeCycleId` /
`previousCycleId`, `forecastCells`, `lockedSnapshots`, `cycles`, `comments`,
`audit`, `scenarios`, `employees`, `joiners`, `leavers`, `transfers`,
`gfsHours`, `capabilities`, `projects`, `workingCalendar`. Adding a new
persisted slice requires updating both the seed in `initialState()` and the
`partialize` list.

## Writing a new action

1. Declare the signature in the `AppState` interface.
2. Implement in the `create(persist(...))` body.
3. Append to `audit[]` if the action mutates domain state.
4. If it mutates types or forecast shape, update this file and the matching
   knowledge page in the same turn.
5. Add a test under `src/store.<feature>.test.ts`.
