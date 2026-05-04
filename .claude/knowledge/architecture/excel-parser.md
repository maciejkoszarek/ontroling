---
title: Excel ingestion
owner: architect
---

# Excel parsers

Two distinct browser-side Excel parsers built on SheetJS (`xlsx`):

| Parser | Purpose | Output sink |
| --- | --- | --- |
| `src/lib/excelParser.ts` | Legacy `CCA_PracticeView (N).xlsm` workbook (operational data) | `useAppStore.ingest(...)` |
| `src/lib/hrDbParser.ts` | Monthly HR Database file (~44 columns, single sheet) | `useAppStore.commitHrImport(...)` (slice 4) |

Both share helpers from `src/lib/parseUtils.ts`: `asPeriod`, `asDate`,
`str`, `num`, `headerKey`, `parsePercent`, `inferPuCode`, `inferLocCode`.
The split happened during the HR Database Import feature (see
[hr_database_import.md](../../../hr_database_import.md) §18.5) — neither
parser imports from the other.

`src/lib/hrImportDiff.ts` is the pure diff engine that takes parsed HR
rows + the current employee list and emits a per-employee classification
(`new-employee` / `changed` / `unchanged` / `re-hire` / `terminating` /
`missing-from-file`) without touching the store.

## Legacy parser — `src/lib/excelParser.ts`

Parses the monthly `CCA_PracticeView (N).xlsm` workbook directly in the
browser via SheetJS (`xlsx`). Output is a normalized payload fed into
`useAppStore.ingest(...)`.

## Sheets consumed

| Sheet | Produces | Notes |
| --- | --- | --- |
| `HR_DB` | `employees[]` + current-month `snapshots[]` | roster + monthly observation |
| `GFS_DB` | `gfsHours[]` + ARVE contribution to `snapshots` | timesheet |
| `Joiners_DB` | `joiners[]` | planned + actual joiners |
| `Leavers_DB` | `leavers[]` | — |
| `Contract_of_mandate_DB` | `contractOfMandate[]` | UZ contractor markers |

## Column matching

Loose, case-insensitive, whitespace-tolerant. e.g. all of the following match
the same logical column:

```
"Employee Number"   "Employee No."   "EmployeeNumber"   "employee_number"
```

The matcher trims non-alphanumerics and compares lower-cased. Extend by
adding the new alias to the per-column synonym list in `excelParser.ts`.

## Production Unit inference

If a dedicated PU column is missing, PU is inferred from the `Engagement`
string (e.g. "CCA_SE2 / VW_GROUP" → `PL01NC04`). The resolver uses
`shortName` as the anchor and falls back to `displayName`. Unmapped
engagements produce a warning in `lastIngest.warnings`.

## Dates

Excel stores dates as serial numbers (days since 1899-12-30). Parsing flow:

```
raw cell value → XLSX.SSF.parse_date_code(serial) → Date object → "YYYY-MM-DD"
                                                              → "YYYY-MM" for Period
```

Bad / missing dates yield `null` or `undefined` and surface as warnings.

## Warnings vs errors

- **Warning** — parser continues: bad date, unknown PU, unknown project.
- **Error** — parser throws, UI shows the red banner: file has no recognized
  sheets, sheet has zero rows, or a required column is totally absent.

All warnings are returned in `lastIngest.warnings`. The Ingestion UI renders
them in a scrollable list.

## After ingest

`ingest(payload)`:

1. Replaces `employees`, `snapshots`, `gfsHours`, `joiners`, `leavers`,
   `contractOfMandate` wholesale.
2. **Keeps** forecast cells, cycles, comments, audit, scenarios.
3. Records `lastIngest` for the Ingestion UI banner.

So re-ingesting a newer workbook updates the factual base without losing the
forecast you've been editing. Use **Reset to demo dataset** if you need to
start over.

## Adding a new workbook version

See [../playbooks/ingest-new-workbook-version.md](../playbooks/ingest-new-workbook-version.md).

## HR Database parser — `src/lib/hrDbParser.ts`

Standalone parser for the monthly HR file (single sheet, ~44 columns). Pure
function — receives a `ResolvePuFn` (and optional `validGradeCodes` /
`validLocationCodes` / `puIndex`) via parameters; never imports the store.

PU resolution order:

1. `resolvePu(rawProductionUnit)` — the caller wires this to
   `state.resolveHrMapping("production_unit", raw)`. If a mapping exists,
   `via: "mapping"`.
2. Heuristic `inferPuCode()` from `parseUtils.ts` — `via: "heuristic"`.
   Fires R01 warning so the controller can promote the fallback in Admin.
3. Empty raw value — `via: "none"`, `resolvedPuCode: null`.

File-level errors (block upload, `fileErrors[]`): F01..F07. Staleness
(F08) lives in the store, NOT here.

Row-level checks: R01..R11. R06 (Leaver=YES + empty termination) and R11
(Part time outside (0, 1]) reject the row; everything else is a warning.

The `Part time` percent normaliser (`parsePercent`) only auto-divides by
100 for values >= 2 (or with explicit `%`), so `1.5` stays at `1.5` and
trips R11 instead of silently becoming `0.015`.

## HR import diff — `src/lib/hrImportDiff.ts`

`buildHrImportPreview(parseResult, currentEmployees)` returns an
`HrImportPreview` with:

- `diffs[]` — one `HrEmployeeDiff` per accepted parsed row plus one
  per active employee absent from the file.
- `rejectedRows[]` — parsed rows whose `rowErrors.length > 0`.
- `fileWarningSummary` — `{ R01: n, R02: n, ... }`.
- `counts` — tallies for new / changed / unchanged / rehires /
  terminating / missingFromFile / joiners / leavers.

User-managed fields (`capabilities`, `germanSpeaker`, `clearanceLevel`,
`skills`, `engagement`, `ggid`, `displayName`) NEVER appear in
`fieldDiffs` — the file is not authoritative for them. String comparison
trims; `""` and `undefined` are treated as equal; `fteCapacity` uses
±0.001 tolerance.
