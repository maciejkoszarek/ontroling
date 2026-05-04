import * as XLSX from "xlsx";
import type { AppState } from "../store";
import type {
  ForecastCell,
  Scenario,
  ScenarioChange,
} from "../types";

/**
 * Relational-style workbook export.
 *
 * Each domain table becomes a sheet. `_index` is a summary of all sheets with
 * row counts. `_meta` captures runtime metadata (app version, exported-at, user).
 * Array/object fields that don't fit a single cell are JSON-encoded.
 *
 * The goal is a human-readable, Excel-editable backup that can be fed back
 * through `dataImport.ts` after repair — a relational escape hatch for when
 * the UI fails or data needs manual correction.
 */

export const EXPORT_SCHEMA_VERSION = 1;

type Row = Record<string, unknown>;

function toJSON(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}

function flattenArrayField<T>(arr: T[] | undefined): string {
  if (!Array.isArray(arr) || arr.length === 0) return "";
  return arr.map(String).join("|");
}

function normalize<T extends object>(rows: readonly T[]): Row[] {
  return rows.map((r) => {
    const out: Row = {};
    for (const [k, v] of Object.entries(r)) {
      if (v === null || v === undefined) {
        out[k] = "";
      } else if (Array.isArray(v)) {
        out[k] = flattenArrayField(v as unknown[]);
      } else if (typeof v === "object") {
        out[k] = toJSON(v);
      } else {
        out[k] = v;
      }
    }
    return out;
  });
}

function flattenLockedSnapshots(
  locked: Record<string, ForecastCell[]> | undefined,
): Row[] {
  if (!locked) return [];
  const rows: Row[] = [];
  for (const [cycleId, cells] of Object.entries(locked)) {
    for (const cell of cells) {
      rows.push({ ...cell, cycleId });
    }
  }
  return rows;
}

function flattenScenarios(scenarios: Scenario[]): {
  scenarios: Row[];
  scenarioChanges: Row[];
} {
  const scenRows: Row[] = scenarios.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    baseCycleId: s.baseCycleId,
    owner: s.owner,
    status: s.status,
    createdAt: s.createdAt,
  }));
  const changeRows: Row[] = [];
  for (const s of scenarios) {
    for (const ch of s.changes as ScenarioChange[]) {
      changeRows.push({
        scenarioId: s.id,
        id: ch.id,
        type: ch.type,
        effectivePeriod: ch.effectivePeriod,
        payload: toJSON(ch.payload),
      });
    }
  }
  return { scenarios: scenRows, scenarioChanges: changeRows };
}

export interface ExportTable {
  name: string;
  rows: Row[];
  /** Optional human-readable notes shown in `_index`. */
  notes?: string;
}

export function buildExportTables(state: AppState): ExportTable[] {
  const { scenarios, scenarioChanges } = flattenScenarios(state.scenarios);

  return [
    { name: "productionUnits", rows: normalize(state.productionUnits) },
    { name: "sbus", rows: normalize(state.sbus) },
    { name: "bus", rows: normalize(state.bus) },
    { name: "marketUnits", rows: normalize(state.marketUnits) },
    { name: "locations", rows: normalize(state.locations) },
    { name: "grades", rows: normalize(state.grades) },
    { name: "capabilities", rows: normalize(state.capabilities) },
    { name: "projects", rows: normalize(state.projects) },
    { name: "employees", rows: normalize(state.employees) },
    { name: "workingCalendar", rows: normalize(state.workingCalendar) },
    { name: "snapshots", rows: normalize(state.snapshots) },
    { name: "gfsHours", rows: normalize(state.gfsHours) },
    { name: "joiners", rows: normalize(state.joiners) },
    { name: "leavers", rows: normalize(state.leavers) },
    { name: "contractOfMandate", rows: normalize(state.contractOfMandate) },
    { name: "transfers", rows: normalize(state.transfers) },
    { name: "cycles", rows: normalize(state.cycles) },
    { name: "forecastCells", rows: normalize(state.forecastCells) },
    {
      name: "lockedSnapshots",
      rows: flattenLockedSnapshots(state.lockedSnapshots),
      notes: "cycleId column joins to cycles.id",
    },
    { name: "budget", rows: normalize(state.budget) },
    { name: "pipeline", rows: normalize(state.pipeline) },
    { name: "projectDemand", rows: normalize(state.projectDemand) },
    { name: "scenarios", rows: scenarios },
    {
      name: "scenarioChanges",
      rows: scenarioChanges,
      notes: "scenarioId column joins to scenarios.id",
    },
    { name: "comments", rows: normalize(state.comments) },
    { name: "audit", rows: normalize(state.audit) },
    { name: "anomalies", rows: normalize(state.anomalies) },
    { name: "dqChecks", rows: normalize(state.dqChecks) },
  ];
}

export function buildWorkbook(state: AppState): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const tables = buildExportTables(state);

  const indexRows = tables.map((t) => ({
    table: t.name,
    rowCount: t.rows.length,
    notes: t.notes ?? "",
  }));
  indexRows.unshift({ table: "_meta", rowCount: 1, notes: "export metadata" });
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(indexRows),
    "_index",
  );

  const meta: Row[] = [
    {
      schemaVersion: EXPORT_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      activeCycleId: state.activeCycleId,
      previousCycleId: state.previousCycleId,
      role: state.role,
      userName: state.user?.name ?? "",
      userEmail: state.user?.email ?? "",
      theme: state.theme,
      density: state.density,
    },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(meta), "_meta");

  for (const table of tables) {
    // Empty tables still get a sheet (header-only) so schema is visible.
    const sheet =
      table.rows.length > 0
        ? XLSX.utils.json_to_sheet(table.rows)
        : XLSX.utils.aoa_to_sheet([[`(empty) ${table.name}`]]);
    XLSX.utils.book_append_sheet(wb, sheet, table.name.slice(0, 31));
  }
  return wb;
}

export function exportWorkbookToBlob(state: AppState): Blob {
  const wb = buildWorkbook(state);
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export function exportStateToJsonBlob(state: AppState): Blob {
  const payload = {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    tables: Object.fromEntries(
      buildExportTables(state).map((t) => [t.name, t.rows]),
    ),
    meta: {
      activeCycleId: state.activeCycleId,
      previousCycleId: state.previousCycleId,
      role: state.role,
      user: state.user,
      theme: state.theme,
      density: state.density,
    },
  };
  return new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
}

export function buildExportFilename(ext: "xlsx" | "json" | "db"): string {
  const d = new Date();
  const stamp = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}-${String(d.getUTCHours()).padStart(2, "0")}${String(d.getUTCMinutes()).padStart(2, "0")}`;
  return `cca-practiceview-backup-${stamp}.${ext}`;
}
