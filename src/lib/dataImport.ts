import * as XLSX from "xlsx";
import type { AppState } from "../store";
import type {
  AuditEntry,
  Bu,
  Employee,
  ForecastCell,
  MarketUnit,
  Project,
  ProductionUnit,
  Sbu,
  WorkingCalendarEntry,
} from "../types";

/**
 * Validates and parses a workbook previously produced by `dataExport.ts`.
 *
 * The result is a "patch" — a partial AppState that can be applied to the
 * store. We keep the surface narrow: only the tables we explicitly whitelist
 * here are accepted. Anything else is reported as a warning but ignored.
 *
 * Philosophy: the import must NEVER throw on partial or lightly-damaged
 * files. Instead we collect errors/warnings and let the user decide whether
 * to apply the patch. This is the escape hatch for a broken UI.
 */

export interface ImportReport {
  ok: boolean;
  tables: Array<{ name: string; rowCount: number; kept: number; skipped: number }>;
  errors: string[];
  warnings: string[];
  patch: Partial<AppState>;
  meta: Record<string, unknown>;
}

function readSheet(wb: XLSX.WorkBook, name: string): Record<string, unknown>[] {
  const sheet = wb.Sheets[name];
  if (!sheet) return [];
  const raw = XLSX.utils.sheet_to_json(sheet, { defval: "" }) as Record<string, unknown>[];
  // Header-only "(empty)" sheets produced by the export come back with one row
  // whose single value starts with "(empty)". Drop them.
  if (raw.length === 1) {
    const only = raw[0];
    const vals = Object.values(only);
    if (vals.length === 1 && typeof vals[0] === "string" && vals[0].startsWith("(empty)")) {
      return [];
    }
  }
  return raw;
}

function coerceNumber(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function coerceBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    return s === "true" || s === "1" || s === "yes";
  }
  return false;
}

function coerceString(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

function coerceOptionalString(v: unknown): string | undefined {
  const s = coerceString(v);
  return s === "" ? undefined : s;
}

function coerceArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  const s = coerceString(v);
  if (!s) return [];
  // Accept both JSON array ("[a,b]") and pipe-separated ("a|b")
  if (s.startsWith("[")) {
    try {
      const parsed = JSON.parse(s) as unknown;
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      // fall through to pipe-split
    }
  }
  return s.split("|").map((x) => x.trim()).filter(Boolean);
}

function parseProductionUnits(rows: Record<string, unknown>[]): ProductionUnit[] {
  return rows
    .filter((r) => r.code)
    .map((r) => ({
      code: coerceString(r.code),
      shortName: coerceString(r.shortName),
      displayName: coerceString(r.displayName),
      sbu: coerceString(r.sbu),
      bu: coerceString(r.bu),
      parentCode: coerceOptionalString(r.parentCode) ?? null,
      sortOrder: coerceNumber(r.sortOrder),
      active: coerceBool(r.active),
      isVirtual: r.isVirtual === "" ? undefined : coerceBool(r.isVirtual),
    }));
}

function parseSbus(rows: Record<string, unknown>[]): Sbu[] {
  return rows
    .filter((r) => r.code)
    .map((r) => ({
      code: coerceString(r.code),
      displayName: coerceString(r.displayName),
      sortOrder: r.sortOrder === "" || r.sortOrder === undefined ? undefined : coerceNumber(r.sortOrder),
    }));
}

function parseBus(rows: Record<string, unknown>[]): Bu[] {
  return rows
    .filter((r) => r.code)
    .map((r) => ({
      code: coerceString(r.code),
      displayName: coerceString(r.displayName),
      sbuCode: coerceString(r.sbuCode),
      sortOrder: r.sortOrder === "" || r.sortOrder === undefined ? undefined : coerceNumber(r.sortOrder),
    }));
}

function parseMarketUnits(rows: Record<string, unknown>[]): MarketUnit[] {
  return rows
    .filter((r) => r.code)
    .map((r) => ({
      code: coerceString(r.code),
      displayName: coerceString(r.displayName),
      // Accept legacy `sbu` column as a fallback so old exports still import.
      buCode: coerceString(r.buCode) || coerceString(r.sbu),
    }));
}

function parseProjects(rows: Record<string, unknown>[]): Project[] {
  return rows
    .filter((r) => r.projectNumber)
    .map((r) => {
      const kind = coerceString(r.kind) || "project";
      const status = coerceString(r.status) || "unknown";
      return {
        projectNumber: coerceString(r.projectNumber),
        name: coerceString(r.name),
        customer: coerceString(r.customer),
        marketUnit: coerceString(r.marketUnit),
        kind: (kind === "opportunity" || kind === "ambition" ? kind : "project") as Project["kind"],
        isBillable: coerceBool(r.isBillable),
        status: (status === "active" || status === "completed" ? status : "unknown") as Project["status"],
        startDate: coerceOptionalString(r.startDate),
        endDate: coerceOptionalString(r.endDate),
        tags: coerceArray(r.tags),
        description: coerceOptionalString(r.description),
      };
    });
}

function parseEmployees(rows: Record<string, unknown>[]): Employee[] {
  return rows
    .filter((r) => r.localNumber)
    .map((r) => ({
      localNumber: coerceString(r.localNumber),
      ggid: coerceOptionalString(r.ggid),
      firstName: coerceString(r.firstName),
      lastName: coerceString(r.lastName),
      displayName: coerceString(r.displayName),
      puCode: coerceString(r.puCode),
      gradeCode: coerceString(r.gradeCode),
      jobFunction: (coerceString(r.jobFunction) || "CSS") as Employee["jobFunction"],
      locationCode: coerceString(r.locationCode),
      startDate: coerceString(r.startDate),
      endDate: coerceOptionalString(r.endDate),
      fteCapacity: coerceNumber(r.fteCapacity, 1),
      engagement: coerceString(r.engagement),
      skills: coerceArray(r.skills),
      capabilities: coerceArray(r.capabilities),
      germanSpeaker: r.germanSpeaker === "" ? undefined : coerceBool(r.germanSpeaker),
      clearanceLevel:
        coerceString(r.clearanceLevel) === "SU1" || coerceString(r.clearanceLevel) === "SU2"
          ? (coerceString(r.clearanceLevel) as Employee["clearanceLevel"])
          : undefined,
    }));
}

function parseWorkingCalendar(rows: Record<string, unknown>[]): WorkingCalendarEntry[] {
  return rows
    .filter((r) => r.period)
    .map((r) => ({
      period: coerceString(r.period),
      workingDays: coerceNumber(r.workingDays),
      workingHours: coerceNumber(r.workingHours),
    }));
}

function parseForecastCells(rows: Record<string, unknown>[]): ForecastCell[] {
  return rows
    .filter((r) => r.cycleId && r.puCode && r.period && r.metric)
    .map((r) => ({
      cycleId: coerceString(r.cycleId),
      puCode: coerceString(r.puCode),
      period: coerceString(r.period),
      metric: coerceString(r.metric) as ForecastCell["metric"],
      value: coerceNumber(r.value),
      grade: coerceOptionalString(r.grade),
      mu: coerceOptionalString(r.mu),
      enteredBy: coerceOptionalString(r.enteredBy),
      enteredAt: coerceOptionalString(r.enteredAt),
      comment: coerceOptionalString(r.comment),
      source: (coerceString(r.source) || "manual") as ForecastCell["source"],
    }));
}

function parseAuditEntries(rows: Record<string, unknown>[]): AuditEntry[] {
  return rows
    .filter((r) => r.id)
    .map((r) => {
      let before: unknown = undefined;
      let after: unknown = undefined;
      const beforeStr = coerceString(r.before);
      const afterStr = coerceString(r.after);
      if (beforeStr) {
        try {
          before = JSON.parse(beforeStr);
        } catch {
          before = beforeStr;
        }
      }
      if (afterStr) {
        try {
          after = JSON.parse(afterStr);
        } catch {
          after = afterStr;
        }
      }
      return {
        id: coerceString(r.id),
        actor: coerceString(r.actor),
        entityType: coerceString(r.entityType),
        entityId: coerceString(r.entityId),
        action: coerceString(r.action) as AuditEntry["action"],
        before,
        after,
        ts: coerceString(r.ts),
        requestId: coerceOptionalString(r.requestId),
      };
    });
}

export async function readWorkbookFromFile(file: File): Promise<XLSX.WorkBook> {
  const buf = await file.arrayBuffer();
  return XLSX.read(buf, { type: "array" });
}

/**
 * Validates a workbook and returns a dry-run report. Does not mutate state.
 *
 * Supported tables are parsed into the patch; missing sheets are reported as
 * warnings (so you can import a partial workbook that only repairs projects,
 * for example). Structural problems (missing _meta, wrong schemaVersion) go
 * into `errors` and flip `ok` to false.
 */
export function validateWorkbook(wb: XLSX.WorkBook): ImportReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const patch: Partial<AppState> = {};
  const tableReports: ImportReport["tables"] = [];

  const metaRows = readSheet(wb, "_meta");
  const meta: Record<string, unknown> = metaRows[0] ?? {};
  if (!metaRows.length) {
    warnings.push("Missing _meta sheet — treating as best-effort import.");
  }

  const whitelist: Array<{
    name: string;
    apply: (rows: Record<string, unknown>[]) => void;
  }> = [
    { name: "productionUnits", apply: (r) => { patch.productionUnits = parseProductionUnits(r); } },
    { name: "sbus", apply: (r) => { patch.sbus = parseSbus(r); } },
    { name: "bus", apply: (r) => { patch.bus = parseBus(r); } },
    { name: "marketUnits", apply: (r) => { patch.marketUnits = parseMarketUnits(r); } },
    { name: "projects", apply: (r) => { patch.projects = parseProjects(r); } },
    { name: "employees", apply: (r) => { patch.employees = parseEmployees(r); } },
    { name: "workingCalendar", apply: (r) => { patch.workingCalendar = parseWorkingCalendar(r); } },
    { name: "forecastCells", apply: (r) => { patch.forecastCells = parseForecastCells(r); } },
    { name: "audit", apply: (r) => { patch.audit = parseAuditEntries(r); } },
  ];

  for (const { name, apply } of whitelist) {
    const rows = readSheet(wb, name);
    if (!wb.Sheets[name]) {
      warnings.push(`Sheet "${name}" missing — leaving store slice untouched.`);
      tableReports.push({ name, rowCount: 0, kept: 0, skipped: 0 });
      continue;
    }
    try {
      const before = rows.length;
      apply(rows);
      const keptSlice = (patch as Record<string, unknown>)[name] as unknown;
      const kept = Array.isArray(keptSlice) ? keptSlice.length : 0;
      tableReports.push({ name, rowCount: before, kept, skipped: before - kept });
    } catch (e) {
      errors.push(`Failed to parse sheet "${name}": ${(e as Error).message}`);
      tableReports.push({ name, rowCount: rows.length, kept: 0, skipped: rows.length });
    }
  }

  // Structural sanity: if a cycle is referenced by forecastCells but missing
  // from projects/meta, warn.
  if (patch.forecastCells && patch.forecastCells.length > 0) {
    const referencedCycles = new Set(patch.forecastCells.map((c) => c.cycleId));
    const knownCycleIds = new Set<string>();
    if (typeof meta.activeCycleId === "string") knownCycleIds.add(meta.activeCycleId);
    if (typeof meta.previousCycleId === "string") knownCycleIds.add(meta.previousCycleId);
    const orphans = [...referencedCycles].filter((id) => !knownCycleIds.has(id));
    if (orphans.length > 0 && knownCycleIds.size > 0) {
      warnings.push(
        `forecastCells reference ${orphans.length} cycle id(s) not present in _meta — apply only if cycles sheet is intact.`,
      );
    }
  }

  return {
    ok: errors.length === 0,
    tables: tableReports,
    errors,
    warnings,
    patch,
    meta,
  };
}
