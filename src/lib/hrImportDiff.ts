// Pure diff engine for HR Database imports. See hr_database_import.md §7.2 step 5
// and §13. Takes parsed rows + the current employee list and classifies each
// employee into one of six diff kinds without touching the store.

import type { Employee, Period } from "../types";
import type { HrParsedRow, HrParseResult } from "./hrDbParser";

export type HrDiffKind =
  | "new-employee"
  | "changed"
  | "unchanged"
  | "re-hire"
  | "terminating"
  | "missing-from-file";

export interface HrEmployeeDiff {
  localNumber: string;
  diffKind: HrDiffKind;
  parsedRow?: HrParsedRow;
  currentEmployee?: Employee;
  fieldDiffs: Array<{ field: keyof Employee; before: unknown; after: unknown }>;
  willCreateJoiner: boolean;
  willCreateLeaver: boolean;
}

export interface HrImportPreview {
  fileMonth: Period;
  reportGeneratedAt: string | null;
  diffs: HrEmployeeDiff[];
  rejectedRows: HrParsedRow[];
  fileWarningSummary: Record<string, number>;
  counts: {
    rowsRead: number;
    rowsRejected: number;
    new: number;
    changed: number;
    unchanged: number;
    rehires: number;
    terminating: number;
    missingFromFile: number;
    joiners: number;
    leavers: number;
  };
}

// ---------------------------------------------------------------------------
// Field-comparison configuration
// ---------------------------------------------------------------------------

/**
 * Fields that are user-managed in PracticeView and never overwritten by the
 * HR file (§7.3). They MUST never appear in `fieldDiffs`.
 */
const NEVER_DIFF_FIELDS = new Set<keyof Employee>([
  "capabilities",
  "germanSpeaker",
  "clearanceLevel",
  "skills",
  "engagement",
  "ggid",
  "displayName", // auto-derived from firstName + lastName
]);

/**
 * The set of `Employee` fields written by the HR Database parser. Anything
 * outside this set (e.g. `capabilities`) is preserved on the existing
 * employee and skipped during the diff.
 */
const HR_MAPPED_FIELDS: Array<keyof Employee> = [
  "firstName",
  "lastName",
  "puCode",
  "gradeCode",
  "jobFunction",
  "locationCode",
  "startDate",
  "endDate",
  "fteCapacity",
  "email",
  "sex",
  "hrFileNumber",
  "contractEndDate",
  "releaseDate",
  "practice",
  "pnlUnit",
  "qualification",
  "jobNameModel",
  "positionPl",
  "positionEn",
  "contractManagerName",
  "contractManagerLocalNumber",
  "contractManagerEmail",
  "directSupervisorName",
  "directSupervisorLocalNumber",
  "directSupervisorEmail",
  "workExperience",
  "currentEmployeeType",
  "separationsFlag",
  "org1Name",
  "org1Code",
  "org2Name",
  "org3Code",
];

const FTE_TOLERANCE = 0.001;

function normaliseString(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function valuesEqual(field: keyof Employee, before: unknown, after: unknown): boolean {
  if (field === "fteCapacity") {
    const a = typeof before === "number" ? before : Number(before);
    const b = typeof after === "number" ? after : Number(after);
    if (!Number.isFinite(a) && !Number.isFinite(b)) return true;
    if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
    return Math.abs(a - b) < FTE_TOLERANCE;
  }
  // String fields (and absent values): trim, treat "" === undefined === null.
  return normaliseString(before) === normaliseString(after);
}

function endDateInPast(endDate: string | null | undefined, fileMonth: Period): boolean {
  if (!endDate) return false;
  // endDate is "YYYY-MM-DD" or earlier-format ISO; compare YYYY-MM lexically.
  const month = endDate.slice(0, 7);
  return month < fileMonth;
}

function endDateInFuture(endDate: string | null | undefined, fileMonth: Period): boolean {
  if (!endDate) return false;
  const month = endDate.slice(0, 7);
  return month >= fileMonth;
}

// ---------------------------------------------------------------------------
// Per-row diff
// ---------------------------------------------------------------------------

function buildFieldDiffs(
  current: Employee | undefined,
  parsed: HrParsedRow,
): Array<{ field: keyof Employee; before: unknown; after: unknown }> {
  const out: Array<{ field: keyof Employee; before: unknown; after: unknown }> = [];
  for (const field of HR_MAPPED_FIELDS) {
    if (NEVER_DIFF_FIELDS.has(field)) continue;
    const after = parsed.employee[field];
    const before = current?.[field];
    // Skip fields the file didn't touch (after is undefined or "") AND
    // there was no prior value either — keeps the diff list tight.
    if (
      (after === undefined || after === "" || after === null) &&
      (before === undefined || before === "" || before === null)
    ) {
      continue;
    }
    if (valuesEqual(field, before, after)) continue;
    out.push({ field, before, after });
  }
  return out;
}

function classifyRow(
  parsed: HrParsedRow,
  current: Employee | undefined,
  fileMonth: Period,
): HrEmployeeDiff {
  const localNumber = parsed.rawEmployeeNumber;

  // Terminating: termination date falls within fileMonth.
  const termInFileMonth =
    !!parsed.dateOfTermination &&
    parsed.dateOfTermination.slice(0, 7) === fileMonth;
  const willCreateLeaver = parsed.leaverYes && termInFileMonth;

  if (!current) {
    // new-employee: include all non-empty mapped fields.
    const fieldDiffs: Array<{ field: keyof Employee; before: unknown; after: unknown }> = [];
    for (const field of HR_MAPPED_FIELDS) {
      if (NEVER_DIFF_FIELDS.has(field)) continue;
      const after = parsed.employee[field];
      if (after === undefined || after === "" || after === null) continue;
      if (field === "fteCapacity" && after === 0) continue;
      fieldDiffs.push({ field, before: undefined, after });
    }
    return {
      localNumber,
      diffKind: "new-employee",
      parsedRow: parsed,
      fieldDiffs,
      willCreateJoiner: parsed.joinerYes,
      willCreateLeaver,
    };
  }

  // Re-hire: existing employee with a past endDate AND file says hired YES.
  const isRehire =
    parsed.joinerYes &&
    endDateInPast(current.endDate, fileMonth);

  if (isRehire) {
    // For re-hire, treat as changed at the field level but mark the joiner
    // event and clear endDate in the after view.
    const synthetic: HrParsedRow = {
      ...parsed,
      employee: { ...parsed.employee, endDate: null },
    };
    const fieldDiffs = buildFieldDiffs(current, synthetic);
    return {
      localNumber,
      diffKind: "re-hire",
      parsedRow: parsed,
      currentEmployee: current,
      fieldDiffs,
      willCreateJoiner: true,
      willCreateLeaver,
    };
  }

  if (willCreateLeaver) {
    const fieldDiffs = buildFieldDiffs(current, parsed);
    return {
      localNumber,
      diffKind: "terminating",
      parsedRow: parsed,
      currentEmployee: current,
      fieldDiffs,
      willCreateJoiner: false,
      willCreateLeaver: true,
    };
  }

  const fieldDiffs = buildFieldDiffs(current, parsed);
  return {
    localNumber,
    diffKind: fieldDiffs.length > 0 ? "changed" : "unchanged",
    parsedRow: parsed,
    currentEmployee: current,
    fieldDiffs,
    willCreateJoiner: false,
    willCreateLeaver: false,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function buildHrImportPreview(
  parse: HrParseResult,
  currentEmployees: Employee[],
): HrImportPreview {
  const fileMonth = parse.fileMonth ?? "";
  const employeeByLocal = new Map<string, Employee>();
  for (const e of currentEmployees) employeeByLocal.set(e.localNumber, e);

  const accepted = parse.rows.filter((r) => r.rowErrors.length === 0);
  const rejectedRows = parse.rows.filter((r) => r.rowErrors.length > 0);
  const seenInFile = new Set<string>();

  const diffs: HrEmployeeDiff[] = [];
  for (const row of accepted) {
    if (!row.rawEmployeeNumber) continue;
    seenInFile.add(row.rawEmployeeNumber);
    const current = employeeByLocal.get(row.rawEmployeeNumber);
    diffs.push(classifyRow(row, current, fileMonth));
  }

  // missing-from-file: employees in store with no endDate (or future endDate)
  // who don't appear in the file at all.
  for (const e of currentEmployees) {
    if (seenInFile.has(e.localNumber)) continue;
    const isActive = !e.endDate || endDateInFuture(e.endDate, fileMonth);
    if (!isActive) continue;
    diffs.push({
      localNumber: e.localNumber,
      diffKind: "missing-from-file",
      currentEmployee: e,
      fieldDiffs: [],
      willCreateJoiner: false,
      willCreateLeaver: false,
    });
  }

  const fileWarningSummary: Record<string, number> = {};
  for (const r of parse.rows) {
    for (const w of r.rowWarnings) {
      fileWarningSummary[w.code] = (fileWarningSummary[w.code] ?? 0) + 1;
    }
  }

  const counts = {
    rowsRead: parse.rowCounts.read,
    rowsRejected: parse.rowCounts.rejected,
    new: diffs.filter((d) => d.diffKind === "new-employee").length,
    changed: diffs.filter((d) => d.diffKind === "changed").length,
    unchanged: diffs.filter((d) => d.diffKind === "unchanged").length,
    rehires: diffs.filter((d) => d.diffKind === "re-hire").length,
    terminating: diffs.filter((d) => d.diffKind === "terminating").length,
    missingFromFile: diffs.filter((d) => d.diffKind === "missing-from-file").length,
    joiners: diffs.filter((d) => d.willCreateJoiner).length,
    leavers: diffs.filter((d) => d.willCreateLeaver).length,
  };

  return {
    fileMonth,
    reportGeneratedAt: parse.reportGeneratedAt,
    diffs,
    rejectedRows,
    fileWarningSummary,
    counts,
  };
}
