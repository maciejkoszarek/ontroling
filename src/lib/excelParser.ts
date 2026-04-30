// Browser-side parser for the CCA_PracticeView (x).xlsm workbook.
// Focuses on the five raw databases (HR_DB, GFS_DB, Joiners_DB, Leavers_DB, Contract_of_mandate_DB).

import * as XLSX from "xlsx";
import type {
  ContractOfMandate,
  Employee,
  EmployeeMonthSnapshot,
  GfsHours,
  Joiner,
  Leaver,
} from "../types";
import { asPeriod, asDate, str, num, inferPuCode, inferLocCode } from "./parseUtils";

export interface ParseResult {
  employees: Employee[];
  snapshots: EmployeeMonthSnapshot[];
  gfsHours: GfsHours[];
  joiners: Joiner[];
  leavers: Leaver[];
  contractOfMandate: ContractOfMandate[];
  warnings: string[];
  sheetNames: string[];
  rowCounts: Record<string, number>;
}

export interface ParseReport {
  result: ParseResult;
  fileName: string;
  fileSize: number;
}

function pickSheet(wb: XLSX.WorkBook, candidates: string[]): { name: string; rows: Record<string, unknown>[] } | null {
  for (const name of wb.SheetNames) {
    if (candidates.some((c) => name.toLowerCase().includes(c.toLowerCase()))) {
      const ws = wb.Sheets[name];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
      return { name, rows };
    }
  }
  return null;
}

export async function parseWorkbook(file: File): Promise<ParseReport> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array", cellDates: false });
  const warnings: string[] = [];
  const rowCounts: Record<string, number> = {};

  // ---- HR_DB ----
  const hr = pickSheet(wb, ["HR_DB"]);
  const employeesMap = new Map<string, Employee>();
  const snapshots: EmployeeMonthSnapshot[] = [];

  if (hr) {
    rowCounts["HR_DB"] = hr.rows.length;
    for (const row of hr.rows) {
      const month = asPeriod(row["Month"] ?? row["month"]);
      const localNumber = str(row["Employee Number"] ?? row["Employee No."] ?? row["Employee No"]);
      if (!month || !localNumber) continue;
      const engagement = str(row["Engagement"]);
      const puCode = inferPuCode(engagement);
      const firstName = str(row["First Name"] ?? row["First name"]);
      const lastName = str(row["Last Name"] ?? row["Last name"]);
      const locCode = inferLocCode(str(row["Location"]));
      const employment = asDate(row["Date of employment"]);
      const termination = asDate(row["Date of termination"]);
      const fte = num(row["FTE wymiar"] ?? row["FTE"] ?? 1);
      const hired = str(row["Hired YES/NO"] ?? row["Hired"]);

      if (!employeesMap.has(localNumber)) {
        employeesMap.set(localNumber, {
          localNumber,
          firstName,
          lastName,
          displayName: `${firstName} ${lastName}`.trim(),
          puCode,
          gradeCode: str(row["Grade"]) || "B2",
          jobFunction: (str(row["Job Function"]) as Employee["jobFunction"]) || "CSS",
          locationCode: locCode,
          startDate: employment ?? `${month}-01`,
          endDate: termination,
          fteCapacity: fte || 1,
          engagement: engagement || puCode,
          skills: [],
        });
      } else {
        const e = employeesMap.get(localNumber)!;
        // keep the most recent values
        e.puCode = puCode;
        e.locationCode = locCode;
        e.endDate = termination;
        e.engagement = engagement || e.engagement;
      }

      snapshots.push({
        employeeLocalNumber: localNumber,
        period: month,
        puCode,
        gradeCode: str(row["Grade"]) || "B2",
        fteAssigned: fte || 1,
        bfte: 0,
        arve: 0,
        projectHours: 0,
        vacationHours: 0,
        learningHours: 0,
        managementHours: 0,
        isJoiner: hired.toUpperCase() === "YES",
        isLeaver: !!termination && termination.slice(0, 7) === month,
        isMover: false,
      });
    }
  } else warnings.push("HR_DB sheet not found");

  // ---- GFS_DB ----
  const gfs = pickSheet(wb, ["GFS_DB"]);
  const gfsHours: GfsHours[] = [];

  if (gfs) {
    rowCounts["GFS_DB"] = gfs.rows.length;
    // Find first set of month columns by matching yyyy-mm-like headers
    const sample = gfs.rows[0] ?? {};
    const keys = Object.keys(sample);
    const monthCols = keys.filter((k) => asPeriod(k) !== null);
    const hasMonthCols = monthCols.length > 0;

    for (const row of gfs.rows) {
      const localNumber = str(row["Employee No."] ?? row["Employee Number"] ?? row["Employee No"]);
      const projectNumber = str(row["Project Number"] ?? row["Project"]) || "_UNKNOWN_";
      const projectType = str(row["Project Type"]) || "External Services";
      if (hasMonthCols) {
        for (const k of monthCols) {
          const period = asPeriod(k);
          if (!period) continue;
          const hours = num(row[k]);
          if (hours === 0) continue;
          gfsHours.push({ employeeLocalNumber: localNumber, period, projectNumber, projectType, hours });
        }
      } else {
        const period = asPeriod(row["Month"]);
        const hours = num(row["Hours"]);
        if (!period || hours === 0) continue;
        gfsHours.push({ employeeLocalNumber: localNumber, period, projectNumber, projectType, hours });
      }
    }
  } else warnings.push("GFS_DB sheet not found");

  // ---- Joiners_DB ----
  const jb = pickSheet(wb, ["Joiners_DB"]);
  const joiners: Joiner[] = [];
  if (jb) {
    rowCounts["Joiners_DB"] = jb.rows.length;
    for (const row of jb.rows) {
      const startDate = asDate(row["Start Date"] ?? row["Start date"] ?? row["Start"]);
      if (!startDate) continue;
      joiners.push({
        id: `j-${joiners.length}`,
        employeeLocalNumber: str(row["Employee Number"]) || undefined,
        firstName: str(row["First Name"] ?? row["First name"]),
        lastName: str(row["Last Name"] ?? row["Last name"]),
        puCode: inferPuCode(str(row["PU"] ?? row["Engagement"])),
        gradeCode: str(row["Grade"]) || "B2",
        locationCode: inferLocCode(str(row["Location"])),
        role: str(row["Role"]) || "Engineer",
        startDate,
        source: "HR",
        status: new Date(startDate) > new Date() ? "planned" : "actual",
      });
    }
  } else warnings.push("Joiners_DB sheet not found");

  // ---- Leavers_DB ----
  const lb = pickSheet(wb, ["Leavers_DB"]);
  const leavers: Leaver[] = [];
  if (lb) {
    rowCounts["Leavers_DB"] = lb.rows.length;
    for (const row of lb.rows) {
      const endDate = asDate(row["Leaving Date"] ?? row["Leaving date"] ?? row["End date"] ?? row["Date of termination"]);
      if (!endDate) continue;
      leavers.push({
        id: `l-${leavers.length}`,
        employeeLocalNumber: str(row["Employee Number"]),
        firstName: str(row["First Name"] ?? row["First name"]),
        lastName: str(row["Last Name"] ?? row["Last name"]),
        puCode: inferPuCode(str(row["PU"] ?? row["Engagement"])),
        gradeCode: str(row["Grade"]) || "B2",
        startDate: asDate(row["Joining Date"] ?? row["Date of employment"]) ?? endDate,
        endDate,
        reason: "voluntary",
        engagement: str(row["Engagement"]),
      });
    }
  } else warnings.push("Leavers_DB sheet not found");

  // ---- Contract_of_mandate_DB ----
  const cm = pickSheet(wb, ["Contract_of_mandate"]);
  const contractOfMandate: ContractOfMandate[] = [];
  if (cm) {
    rowCounts["Contract_of_mandate_DB"] = cm.rows.length;
    for (const row of cm.rows) {
      const period = asPeriod(row["Month"]);
      const localNumber = str(row["Employee Number"]) || `UZ-${contractOfMandate.length}`;
      const puCode = inferPuCode(str(row["PU"] ?? row["Engagement"]));
      if (!period) continue;
      contractOfMandate.push({
        employeeLocalNumber: localNumber,
        period,
        puCode,
        locationCode: inferLocCode(str(row["Location"])),
        active: true,
      });
    }
  }

  return {
    result: {
      employees: Array.from(employeesMap.values()),
      snapshots,
      gfsHours,
      joiners,
      leavers,
      contractOfMandate,
      warnings,
      sheetNames: wb.SheetNames,
      rowCounts,
    },
    fileName: file.name,
    fileSize: file.size,
  };
}

/** Export current application state back to an Excel workbook that mirrors the legacy layout. */
export function exportWorkbook(data: {
  employees: Employee[];
  snapshots: EmployeeMonthSnapshot[];
  gfsHours: GfsHours[];
  joiners: Joiner[];
  leavers: Leaver[];
  contractOfMandate: ContractOfMandate[];
}): Blob {
  const wb = XLSX.utils.book_new();

  const hr = data.snapshots.map((s) => ({
    Month: s.period,
    "Employee Number": s.employeeLocalNumber,
    "FTE wymiar": s.fteAssigned,
    PU: s.puCode,
    Grade: s.gradeCode,
    Joiner: s.isJoiner ? "YES" : "NO",
    Leaver: s.isLeaver ? "YES" : "NO",
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hr), "HR_DB");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.gfsHours), "GFS_DB");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.joiners), "Joiners_DB");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.leavers), "Leavers_DB");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.contractOfMandate), "Contract_of_mandate_DB");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.employees), "Employees");

  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
