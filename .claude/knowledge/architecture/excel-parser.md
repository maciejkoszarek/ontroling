---
title: Excel ingestion
owner: architect
---

# Excel parser — `src/lib/excelParser.ts`

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
