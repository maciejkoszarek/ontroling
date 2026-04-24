---
title: Data Backup & Escape Hatch
owner: architect
---

# Data backup & escape hatch — `src/lib/dataExport.ts`, `dataImport.ts`, `sqliteExport.ts`

Full-state export + validated import, exposed via Admin → **Data & backup**
([src/components/AdminDataBackup.tsx](src/components/AdminDataBackup.tsx)). The
point is a **relational escape hatch**: if the UI fails or data needs manual
repair, the user can download the full store as Excel / SQLite / JSON, fix it
externally, and re-upload the Excel.

## Export

Three formats, all derived from the same `buildExportTables(state)` in
[src/lib/dataExport.ts](src/lib/dataExport.ts):

| Format | Writer | Blob MIME | Notes |
| --- | --- | --- | --- |
| Excel | `exportWorkbookToBlob` | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` | One sheet per slice + `_index` summary + `_meta` runtime; re-importable |
| SQLite | `exportStateToSqliteBlob` (lazy) | `application/vnd.sqlite3` | sql.js WASM loaded on click; one SQL table per slice; column types inferred (INTEGER/REAL/TEXT); `_meta` KV table |
| JSON | `exportStateToJsonBlob` | `application/json` | Raw `{ schemaVersion, tables, meta }` — fallback when xlsx/wasm fails |

Shared constants:
- `EXPORT_SCHEMA_VERSION` — bumped whenever the whitelist or row shape
  changes incompatibly.
- `buildExportFilename(ext)` — `cca-practiceview-backup-YYYYMMDD-HHMM.{ext}`.

Whitelist lives in `buildExportTables`: production units, market units,
locations, grades, projects, capabilities, employees, snapshots, gfsHours,
joiners, leavers, contractOfMandate, transfers, cycles, forecastCells,
lockedSnapshots (flattened with `cycleId` column), budget, pipeline,
projectDemand, scenarios (+ scenarioChanges split), comments, audit,
anomalies, dqChecks, workingCalendar. Preferences are deliberately excluded.

## Import (Excel only)

[src/lib/dataImport.ts](src/lib/dataImport.ts) — dry-run validator with zero
side-effects. `readWorkbookFromFile(file)` wraps `XLSX.read`.
`validateWorkbook(wb)` returns an `ImportReport`:

```ts
interface ImportReport {
  ok: boolean;
  tables: Array<{ name: string; rowCount: number; kept: number; skipped: number }>;
  errors: string[];
  warnings: string[];
  patch: Partial<AppState>;   // only whitelisted slices
  meta: Record<string, string>;
}
```

Per-slice parsers use coercion helpers (`coerceNumber`, `coerceBool`,
`coerceString`, `coerceArray` — handles both JSON arrays and pipe-separated
values). `coerceArray` tries `JSON.parse` first, then falls through to
pipe-split. Orphan `cycleId` references, missing sheets, or corrupt rows
produce errors/warnings; the parser never throws.

The store action `applyImportPatch(patch, source)` is what actually commits
the import after the user confirms. It appends a single audit entry of type
`import.update`.

## Round-trip guarantee

`src/lib/dataExport.test.ts` asserts that a workbook built via `buildWorkbook`,
serialized through `XLSX.write` then re-parsed through `XLSX.read`, survives
`validateWorkbook` with zero errors and the `projects.tags` / `forecastCells.value`
values preserved intact. If you add a new slice, add the parser in
`dataImport.ts`, the table builder in `dataExport.ts`, and extend that test.
