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
| `sbus` | `Sbu[]` | top of MU hierarchy; CRUD via `addSbu` / `updateSbu` / `removeSbu` (delete blocked while child BUs exist) |
| `bus` | `Bu[]` | references `sbuCode`; CRUD via `addBu` / `updateBu` / `removeBu` (delete blocked while child MUs exist) |
| `marketUnits` | `MarketUnit[]` | references `buCode`; CRUD via `addMarketUnit` / `updateMarketUnit` / `removeMarketUnit` (delete blocked while projects reference it) |
| `locations` | `Location[]` | 6 PL locations incl. REMOTE |
| `grades` | `Grade[]` | 8 grades |
| `projects` | `Project[]` | client + internal projects; CRUD via `addProject` / `updateProject` |
| `capabilities` | `Capability[]` | skill taxonomy (Java, React, AWS, …); CRUD via `addCapability` / `renameCapability` / `removeCapability` |

### Facts

| Field | Type | Notes |
| --- | --- | --- |
| `employees` | `Employee[]` | current roster; mutated by `addEmployee`, `updateEmployee`, `transferEmployee`, `promoteEmployee`, `addPlaceholderForProject`, `setEmployeeCapabilities`, `setEmployeeGermanSpeaker`, `setEmployeeClearanceLevel`. Rows with `isPlaceholder: true` are forecast-only roles (see `placeholderRole`) — excluded from People directory, attrition, and capability mgmt; included in `gfsHours` and the project FTE chart |
| `snapshots` | `EmployeeMonthSnapshot[]` | per-employee-per-month observations (placeholders never have snapshots) |
| `gfsHours` | `GfsHours[]` | timesheet rows; mutated by `assignEmployeeToProject` / `unassignEmployeeFromProject` / `addPlaceholderForProject` |
| `joiners` / `leavers` | `Joiner[]` / `Leaver[]` | people-flow entries via `addJoiner` / `addLeaver`; `addJoiner` can materialize an `Employee` when `status === "actual"` |
| `contractOfMandate` | `ContractOfMandate[]` | UZ contractor markers |
| `transfers` | `Transfer[]` | inter-PU moves recorded by `transferEmployee` |
| `promotions` | `Promotion[]` | grade changes with effective period; recorded by `promoteEmployee` (added in persist v3) |

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

### HR import (see [hr_database_import.md](../../../hr_database_import.md))

| Field | Type | Notes |
| --- | --- | --- |
| `hrMappings` | `HrMappingEntry[]` | controller-curated bridge from raw HR file values to canonical app codes. Seeded on init via `seedHrMappings(productionUnits)` with identity rows for every non-virtual PU's `code`, `shortName`, `displayName` (§11.5). `resolveHrMapping(kind, source)` is case- and whitespace-insensitive and ignores inactive entries. |
| `hrImports` | `HrImport[]` | history of committed HR imports. Populated by `commitHrImport` in a later slice. |
| `lastHrImport` | `{ id; month; importedAt; importedBy }?` | metadata of the most recent committed HR import; drives the staleness guard (F08). |

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
  `assignEmployeeToProject`, `unassignEmployeeFromProject`,
  `addPlaceholderForProject`. `addJoiner` will
  materialize an `Employee` when the joiner is `status === "actual"` with a
  `localNumber` that does not already exist. `addPlaceholderForProject` is
  scoped to `ambition` / `opportunity` projects: it creates an `Employee` with
  `isPlaceholder: true` plus monthly `GfsHours` rows across the requested
  period range, and is the only entry point that should set `isPlaceholder`.
- **Projects**: `addProject`, `updateProject` — validate that the
  `projectNumber` is unique (I15), trim strings, append audit. Both manage
  `Project.commitProbability` (I30): `addProject` applies kind defaults
  (`project → 1.0`, `opportunity → 0.5`, `ambition → 0.3`) and clamps to
  `[0, 1]`; `updateProject` resets to the new kind's default on kind change,
  forces `1.0` when kind is `project`, and clamps out-of-range inputs with a
  `"validation-clamp"` audit entry (`{ entity: "project", field:
  "commitProbability", reason: "I30 range" }`). Read sites must resolve
  effective probability via `getCommitProbability(p)` from
  [src/lib/projectHelpers.ts](src/lib/projectHelpers.ts) — stored values for
  `project`-kind rows are ignored. FTE demand roll-ups on Cockpit, Projects,
  MarketUnit, and Bench apply `weightedDemand(fte, project)` so
  opportunities and ambitions contribute their probability-scaled share.
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
- **HR import**: `addHrMapping(entry)`, `updateHrMapping(id, patch)`,
  `removeHrMapping(id)`, `resolveHrMapping(kind, source)`,
  `canImportHr(role)`, `canOverrideStaleness(role)`, `buildResolvePuFn()`,
  `commitHrImport(args)`. `addHrMapping` / `updateHrMapping` /
  `removeHrMapping` are silent no-ops for non-controller roles (matches the
  `lockCycle` / `applyImportPatch` gating pattern). `addHrMapping` rejects
  duplicate `(kind, normalized-source)` rows among active entries.
  `canImportHr` is true for `controller` and `hr`; `canOverrideStaleness`
  is true only for `controller`. `buildResolvePuFn()` returns a
  `ResolvePuFn` closure over `hrMappings + inferPuCode` that the parser
  consumes — keeps the UI from having to assemble it. `commitHrImport({
  preview, decisions, fileName, fileSize, durationMs, reportGeneratedAt,
  warnings, stalenessOverrideReason? })` first throws
  `Error("FORBIDDEN_HR_IMPORT")` when `canImportHr(role)` is false (UI
  surfaces a user-readable "no permission" banner), then re-checks
  staleness (throws `Error("STALE_IMPORT")` when `preview.fileMonth <
  lastHrImport.month` and no override), walks `preview.diffs` keyed by
  decisions:
  `new-employee` appends a new `Employee` + `Joiner` (id
  `j-hr-${importId}-${localNumber}`); `changed` merges file-mapped fields on
  top of the existing employee preserving user-managed fields
  (`capabilities`, `germanSpeaker`, `clearanceLevel`, `ggid`, `skills`);
  `re-hire` does the same merge, clears `endDate`, re-applies file
  `startDate`, appends a `Joiner`; `terminating` merges + sets
  `endDate = parsedRow.dateOfTermination` and appends a `Leaver` (id
  `l-hr-${importId}-${localNumber}`, `terminationMethod` resolved as
  `decision.edits?.terminationMethod ?? parsedRow.parsedTerminationMethod`
  — `HrParsedRow.parsedTerminationMethod` is read from §8 col 15 by the
  parser); `unchanged` is a no-op for the employee but always writes a
  `EmployeeMonthSnapshot` for `(localNumber, fileMonth)`;
  `missing-from-file` is informational and ignored even when a decision is
  passed (no audit, no leaver, no snapshot). `decision.action === "skip"`
  increments `counts.rowsSkipped` without touching state. Joiner emission
  for `new-employee` trusts the parser's `diff.willCreateJoiner` flag (set
  from `Hired YES/NO || Joiner?`) — the store does NOT additionally fall
  through on `startDate.slice(0, 7) === fileMonth`, which would override
  an explicit `Hired YES/NO = NO`. Every persisted
  `HrImport.rowDecisions[i].importId` is re-stamped to the new
  `HrImport.id` before write — the walker hard-codes a `"pending"`
  placeholder that the store rewrites. Audit fan-out (§18.4): one umbrella
  `AuditEntry` (`kind: "hr_import"`, `entityType: "import"`, `entityId:
  importId`, `actor: state.user.email`, `action: "create"`, `after: {
  fileName, fileMonth, counts, stalenessOverrideReason }`) plus one
  per-employee `AuditEntry` (`kind: "hr_import"`, `entityType: "employee"`,
  `entityId: localNumber`, `action: "create"|"update"`, `before/after =
  subset of touched fields via buildAuditSubset` — `new-employee` derives
  the touched-field set from `diff.fieldDiffs` so PII like `email` /
  `sex` doesn't leak into audit unless the diff explicitly carried it,
  `importId: <self>`) for every non-skip non-unchanged decision. Returns
  `{ id }`.
- **Audit fan-out for employee mutations** (per
  [hr_database_import.md](../../../hr_database_import.md) §18.4): `addEmployee`
  (`kind: "user_edit"`, `action: "create"`), `transferEmployee` (`kind:
  "transfer"`), `setEmployeeCapabilities` (`kind: "capability_change"`,
  before/after = capability id arrays), `setEmployeeGermanSpeaker` /
  `setEmployeeClearanceLevel` (`kind: "user_edit"`, scalar before/after),
  `addJoiner` (`kind: "joiner"`), `addLeaver` (`kind: "leaver"`). All use
  `entityType: "employee"`, `entityId: localNumber`, `actor: state.user.email`,
  `id: uid("audit-")`. This makes the per-person change-history view (§14)
  populate from existing user actions even before HR import lands.
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

`persist` middleware. Storage name: **`cca-practiceview-v3`**. Schema-change
rule: if a new field is not forward-compatible (or renames an existing one),
bump the suffix. Additive fields (e.g. `workingCalendar`) are safe without a
bump — Zustand shallow-merges on rehydrate and uses the initial seed for
missing fields. The `migrate` callback handles in-place upgrades from older
versions; the v2→v3 migration synthesizes `sbus` and `bus` from any legacy
`MarketUnit.sbu` strings and rewrites MUs to `{ buCode }`.

### v2 → v3 migration

Bumped from `cca-practiceview-v2` (`version: 2`) to `cca-practiceview-v3`
(`version: 3`) when `Employee` gained the optional HR-Database fields and the
new `hrMappings`, `hrImports`, `lastHrImport` slices were introduced.

Because the persist `name` changed, zustand-persist looks under the new key
on first boot and finds nothing — without a bridge, every existing v2 user
would silently fall back to `initialState()` and lose their data. The
storage wrapper (`quotaSafeStorage().getItem`) handles this: when the v3
key is empty, it reads `localStorage["cca-practiceview-v2"]`, runs the
parsed envelope through `migratePersistedState(state, version)`, removes
the legacy key (only on success), and returns a re-wrapped v3 envelope.
Corrupt JSON falls through to `initialState()` rather than crashing. The
same logic is exposed as `migrateFromLegacyLocalStorage()` so tests can
exercise the helper without round-tripping through Zustand. The
`migrate` callback then performs additive shape fixes (`hrMappings: []`,
`hrImports: []`); `onRehydrateStorage` finally fills empty `hrMappings`
with `seedHrMappings(productionUnits)` so existing users still get the
identity-mapping seed without re-installing demo data.

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
fields are persisted. Most reference data (PUs, grades, locations) is
**not** persisted — it always comes from `demoData.ts`. The org-hierarchy
slices (`sbus`, `bus`, `marketUnits`) ARE persisted because they're
admin-editable. Persisted fields: preferences (`role`, `theme`, `density`,
`filter`), `activeCycleId` / `previousCycleId`, `forecastCells`,
`lockedSnapshots`, `cycles`, `comments`, `audit`, `scenarios`, `employees`,
`joiners`, `leavers`, `transfers`, `gfsHours`, `capabilities`, `projects`,
`sbus`, `bus`, `marketUnits`, `workingCalendar`, `hrMappings`, `hrImports`,
`lastHrImport`. Adding a new persisted slice requires updating both the
seed in `initialState()` and the `partialize` list.

## Writing a new action

1. Declare the signature in the `AppState` interface.
2. Implement in the `create(persist(...))` body.
3. Append to `audit[]` if the action mutates domain state.
4. If it mutates types or forecast shape, update this file and the matching
   knowledge page in the same turn.
5. Add a test under `src/store.<feature>.test.ts`.
