// Importer for the CCA_People.xlsx flat-table format.
//
// The file is a single-sheet roster: one row per employee for a given month,
// with columns describing identity, employment status, PU, grade, FTE, and
// joiner/leaver flags. This is distinct from the legacy CCA_PracticeView
// workbook handled by `excelParser.ts` (which has multiple sheets:
// HR_DB, GFS_DB, Joiners_DB, Leavers_DB, Contract_of_mandate_DB).
//
// The importer is deliberately strict about identity columns (Employee
// Number, Month) and forgiving about everything else — fields fall back to
// sane defaults so a partially-filled workbook still produces a usable patch.

import * as XLSX from "xlsx";
import type {
  Employee,
  EmployeeMonthSnapshot,
  Joiner,
  Leaver,
  Period,
} from "../types";

export interface PeopleImportPayload {
  employees: Employee[];
  snapshots: EmployeeMonthSnapshot[];
  joiners: Joiner[];
  leavers: Leaver[];
  /** The month the file represents — derived from the most-frequent `Month` column value. */
  period: Period | null;
  /**
   * Map from `puCode` → human-readable People Unit name (e.g.
   * "CCA_Complex Transformation"). Used by the store to give a friendly
   * display name to PUs that aren't in the seeded taxonomy.
   */
  puCodeToPeopleUnit: Record<string, string>;
  warnings: string[];
  rowCount: number;
  sheetName: string;
}

/** Convert raw Excel cell values to a `YYYY-MM` Period. */
function asPeriod(v: unknown): Period | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return `${d.y}-${String(d.m).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  const m = /^(\d{4})-(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}`;
  const d = new Date(s);
  if (Number.isFinite(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  return null;
}

function asDate(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  if (v instanceof Date && Number.isFinite(v.getTime())) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  // dd.MM.yyyy (Polish format used in the report)
  const m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const d = new Date(s);
  if (Number.isFinite(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function str(v: unknown): string {
  return v === null || v === undefined ? "" : String(v).trim();
}

function num(v: unknown, fallback = 0): number {
  if (v === null || v === undefined || v === "") return fallback;
  if (typeof v === "number") return Number.isFinite(v) ? v : fallback;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}

function bool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  const s = str(v).toUpperCase();
  return s === "TAK" || s === "YES" || s === "TRUE" || s === "1";
}

const PEOPLE_UNIT_TO_PU: Record<string, string> = {
  CCA_HEAD: "PL01NC01",
  CCA_CLOUD_NATIVE: "PL01NC08",
  CCA_COMPLEX_TRANSFORMATION: "PL01NC09",
  CCA_SE1: "PL01NC03",
  CCA_SE2: "PL01NC04",
  CCA_SE3: "PL01NC05",
  CCA_SE4: "PL01NC06",
  CCA_SE5: "PL01NC07",
  CCA_EEC: "PL01NC10",
};

function mapPuCode(productionUnit: string, peopleUnit: string): string {
  const pu = productionUnit.toUpperCase();
  if (/^PL\d{2}NC\d{2}$/.test(pu)) return pu;
  const fromPeople = PEOPLE_UNIT_TO_PU[peopleUnit.toUpperCase()];
  if (fromPeople) return fromPeople;
  return pu || "PL01NC01";
}

function mapLocationCode(loc: string): string {
  const s = loc.toUpperCase();
  if (s.startsWith("WROC")) return "WRO";
  if (s.startsWith("POZ")) return "POZ";
  if (s.startsWith("GDA")) return "GDN";
  if (s.startsWith("WAR")) return "WAW";
  if (s.startsWith("KRA") || s.startsWith("CRA")) return "KRK";
  if (s.startsWith("KAT")) return "KAT";
  if (s.startsWith("OPO")) return "OPO";
  if (s.includes("REMOTE")) return "REMOTE";
  return "REMOTE";
}

function titleCase(s: string): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .split(/(\s+|-)/)
    .map((part) => (part.match(/^\s+|-$/) ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join("");
}

function pickFirstSheet(wb: XLSX.WorkBook): { name: string; rows: Record<string, unknown>[] } | null {
  if (wb.SheetNames.length === 0) return null;
  const name = wb.SheetNames[0];
  const ws = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
  return { name, rows };
}

/**
 * Parses a CCA_People-style workbook. The file contains one row per employee
 * for a given month; this importer treats it as a complete roster snapshot
 * for that month and emits Employee, EmployeeMonthSnapshot, Joiner, Leaver
 * arrays. Joiners/Leavers are derived from the per-row flags so that
 * downstream views stay consistent with HC_BEGIN/HC_END math.
 */
export async function parsePeopleWorkbook(file: File): Promise<PeopleImportPayload> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array", cellDates: false });
  const warnings: string[] = [];
  const sheet = pickFirstSheet(wb);
  if (!sheet) {
    return {
      employees: [],
      snapshots: [],
      joiners: [],
      leavers: [],
      period: null,
      puCodeToPeopleUnit: {},
      warnings: ["Workbook has no sheets."],
      rowCount: 0,
      sheetName: "",
    };
  }

  const rows = sheet.rows;
  const employees = new Map<string, Employee>();
  const snapshots: EmployeeMonthSnapshot[] = [];
  const joiners: Joiner[] = [];
  const leavers: Leaver[] = [];

  // Detect dominant period — rows with a different month are accepted but flagged.
  const periodCounts = new Map<string, number>();
  for (const row of rows) {
    const p = asPeriod(row["Month"]);
    if (p) periodCounts.set(p, (periodCounts.get(p) ?? 0) + 1);
  }
  let dominantPeriod: Period | null = null;
  let max = 0;
  for (const [p, c] of periodCounts) {
    if (c > max) {
      max = c;
      dominantPeriod = p;
    }
  }
  if (periodCounts.size > 1) {
    warnings.push(
      `File mixes ${periodCounts.size} months — using ${dominantPeriod} as the dominant period.`,
    );
  }

  let skippedNoId = 0;
  let skippedNoMonth = 0;
  const unknownLocations = new Set<string>();
  const puCodeToPeopleUnit: Record<string, string> = {};

  for (const row of rows) {
    const localNumber = str(row["Employee Number"]);
    const period = asPeriod(row["Month"]);
    if (!localNumber) {
      skippedNoId++;
      continue;
    }
    if (!period) {
      skippedNoMonth++;
      continue;
    }

    const lastName = titleCase(str(row["Last Name"]));
    const firstName = titleCase(str(row["First Name"]));
    const displayName = str(row["Name"]) || `${firstName} ${lastName}`.trim();
    const locationRaw = str(row["Location"]);
    const locationCode = mapLocationCode(locationRaw);
    if (locationRaw && locationCode === "REMOTE" && !/REMOTE/i.test(locationRaw)) {
      unknownLocations.add(locationRaw);
    }
    const startDate = asDate(row["Date of employment"]) ?? `${period}-01`;
    const endDate = asDate(row["Date of termination"]);
    const fteCapacity = num(row["Part time"], 1) || 1;
    const peopleUnit = str(row["People Unit"]);
    const puCode = mapPuCode(str(row["Production Unit"]), peopleUnit);
    if (peopleUnit && !puCodeToPeopleUnit[puCode]) {
      puCodeToPeopleUnit[puCode] = peopleUnit;
    }
    const gradeCode = str(row["Grade"]) || "B2";
    const jobType = str(row["Job type"]).toUpperCase();
    const jobFunction: Employee["jobFunction"] =
      jobType === "EEC" ? "EEC" : jobType === "Z" ? "Z" : "CSS";
    const engagement = str(row["Organization Name"]) || str(row["Position (English)"]) || puCode;
    const ggid = str(row["Employee_Number"]) || undefined;
    const isJoiner = bool(row["Joiner?"]);
    const isLeaver = bool(row["Leaver"]);

    if (!employees.has(localNumber)) {
      employees.set(localNumber, {
        localNumber,
        ggid,
        firstName,
        lastName,
        displayName,
        puCode,
        gradeCode,
        jobFunction,
        locationCode,
        startDate,
        endDate: endDate ?? null,
        fteCapacity,
        engagement,
        skills: [],
      });
    } else {
      // Multiple rows for one person → keep the row matching the dominant period.
      if (period === dominantPeriod) {
        const merged: Employee = {
          localNumber,
          ggid,
          firstName,
          lastName,
          displayName,
          puCode,
          gradeCode,
          jobFunction,
          locationCode,
          startDate,
          endDate: endDate ?? null,
          fteCapacity,
          engagement,
          skills: employees.get(localNumber)?.skills ?? [],
        };
        employees.set(localNumber, merged);
      }
    }

    snapshots.push({
      employeeLocalNumber: localNumber,
      period,
      puCode,
      gradeCode,
      fteAssigned: fteCapacity,
      bfte: 0,
      arve: 0,
      projectHours: 0,
      vacationHours: 0,
      learningHours: 0,
      managementHours: 0,
      isJoiner,
      isLeaver,
      isMover: false,
    });

    if (isJoiner) {
      joiners.push({
        id: `j-imp-${localNumber}`,
        employeeLocalNumber: localNumber,
        firstName,
        lastName,
        puCode,
        gradeCode,
        locationCode,
        role: str(row["Position (English)"]) || "Engineer",
        startDate,
        source: "HR",
        status: "actual",
      });
    }
    if (isLeaver && endDate) {
      leavers.push({
        id: `l-imp-${localNumber}`,
        employeeLocalNumber: localNumber,
        firstName,
        lastName,
        puCode,
        gradeCode,
        startDate,
        endDate,
        reason: "voluntary",
        engagement,
      });
    }
  }

  if (skippedNoId > 0) warnings.push(`${skippedNoId} row(s) skipped — missing Employee Number.`);
  if (skippedNoMonth > 0) warnings.push(`${skippedNoMonth} row(s) skipped — missing/invalid Month.`);
  if (unknownLocations.size > 0) {
    warnings.push(
      `Unknown location(s) mapped to REMOTE: ${[...unknownLocations].slice(0, 5).join(", ")}` +
        (unknownLocations.size > 5 ? ` (+${unknownLocations.size - 5} more)` : ""),
    );
  }

  return {
    employees: Array.from(employees.values()),
    snapshots,
    joiners,
    leavers,
    period: dominantPeriod,
    puCodeToPeopleUnit,
    warnings,
    rowCount: rows.length,
    sheetName: sheet.name,
  };
}
