// Standalone parser for the HR Database file (single-sheet Excel exported
// from the corporate HR system). See hr_database_import.md §5, §8, §9, §11.4,
// §18.5. Distinct from `excelParser.ts`, which parses the operational
// CCA_PracticeView (N).xlsm workbook.

import * as XLSX from "xlsx";
import type { Employee, HrImportWarning, Period } from "../types";
import {
  asDate,
  asPeriod,
  headerKey,
  inferLocCode,
  num,
  parsePercent,
  str,
} from "./parseUtils";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface HrParsedRow {
  rowIndex: number;
  rawEmployeeNumber: string;
  rawEmployeeNumberDup: string;
  fileMonth: Period | null;
  employee: Partial<Employee> & { localNumber: string };
  joinerYes: boolean;
  leaverYes: boolean;
  dateOfTermination: string | null;
  dateOfEndContract: string | null;
  dateOfRelease: string | null;
  /** §8 col 15 — `Leaver.terminationMethod` source value when present. */
  parsedTerminationMethod: string | null;
  reportGeneratedAt: string | null;
  resolvedPuCode: string | null;
  resolvedPuVia: "mapping" | "heuristic" | "none";
  rawProductionUnit: string;
  rawPeopleUnit: string;
  rawLocation: string;
  rowWarnings: HrImportWarning[];
  rowErrors: { code: string; message: string }[];
}

export interface HrParseResult {
  fileName: string;
  fileSize: number;
  fileMonth: Period | null;
  reportGeneratedAt: string | null;
  rows: HrParsedRow[];
  fileErrors: { code: string; message: string }[];
  rowCounts: { read: number; rejected: number; warnings: number };
}

export type ResolvePuFn = (rawValue: string) => {
  code: string;
  via: "mapping" | "heuristic" | "none";
};

export interface HrParseOptions {
  /** Optional set of grade codes to validate against (R02). */
  validGradeCodes?: Set<string>;
  /** Optional set of location codes to validate against (R03). */
  validLocationCodes?: Set<string>;
  /** Optional `puCode → sbu` lookup for R08 SBU mismatch detection. */
  puIndex?: Map<string, { sbu?: string }>;
}

// ---------------------------------------------------------------------------
// Header resolution
// ---------------------------------------------------------------------------

/**
 * Column aliases for the HR Database file (§8). Each canonical key maps to a
 * list of accepted spellings; matching is case- and whitespace-insensitive
 * via `headerKey`.
 */
const COLUMN_ALIASES: Record<string, string[]> = {
  month: ["Month"],
  employeeNumber: ["Employee Number", "Employee No", "Employee No."],
  employeeNumberDup: ["Employee_Number"],
  lastName: ["Last Name"],
  firstName: ["First Name"],
  displayName: ["Name"],
  hiredYesNo: ["Hired YES/NO", "Hired"],
  joinerQ: ["Joiner?", "Joiner"],
  leaver: ["Leaver"],
  location: ["Location"],
  dateOfEmployment: ["Date of employment"],
  dateOfTermination: ["Date of termination"],
  dateOfEndContract: ["Date of the end contract", "Date of end contract"],
  dateOfRelease: ["Date of release"],
  terminationMethod: ["The method of contract termination"],
  reportGenerationDate: ["Report generation date"],
  org1Name: ["Organization Name"],
  org1Code: ["Number of Organization"],
  org2Name: ["Organization Name2"],
  org3Code: ["Number of Organization3"],
  productionUnit: ["Production Unit"],
  peopleUnit: ["People Unit"],
  practice: ["Practice"],
  sbu: ["SBU"],
  pnl: ["P&L"],
  qualification: ["Qualification"],
  jobType: ["Job type"],
  jobNameModel: ["Job name zgodnie z modelem", "Job name model"],
  grade: ["Grade"],
  positionPl: ["Position (Polish)"],
  positionEn: ["Position (English)"],
  contractManagerName: ["Contract manager"],
  contractManagerLocalNumber: ["Contract manager's number", "Contract managers number"],
  contractManagerEmail: ["Contract manager's email", "Contract managers email"],
  directSupervisorName: ["Direct supervisor"],
  directSupervisorLocalNumber: ["Direct supervisor's number", "Direct supervisors number"],
  directSupervisorEmail: ["Direct supervisor's email", "Direct supervisors email"],
  email: ["e-mail", "email"],
  sex: ["Sex"],
  hrFileNumber: ["File number"],
  separations: ["Separations"],
  partTime: ["Part time"],
  workExperience: ["Work experience (month | day)", "Work experience"],
  currentEmployeeType: ["Aktualny typ pracownika"],
};

/**
 * The minimum set of canonical columns required for the file to be processed
 * at all (§9.1 F02). Anything else is optional.
 */
const REQUIRED_CANONICAL_KEYS = [
  "month",
  "employeeNumber",
  "firstName",
  "lastName",
  "hiredYesNo",
  "leaver",
  "location",
  "dateOfEmployment",
  "productionUnit",
  "jobType",
  "grade",
  "partTime",
] as const;

interface HeaderResolver {
  /** Canonical-key → first matching raw header (verbatim from sheet). */
  byCanonical: Map<string, string>;
  /** Read a value for a canonical key from a row object. */
  get(row: Record<string, unknown>, canonical: string): unknown;
}

function buildHeaderResolver(rawHeaders: string[]): HeaderResolver {
  // Group raw headers by `headerKey` so collisions (e.g. "Employee Number"
  // vs "Employee_Number" both normalising to "employeenumber") preserve
  // both verbatim spellings — needed to distinguish §8 columns 2 and 3.
  const buckets = new Map<string, string[]>();
  for (const h of rawHeaders) {
    const k = headerKey(h);
    const bucket = buckets.get(k);
    if (bucket) bucket.push(h);
    else buckets.set(k, [h]);
  }

  const byCanonical = new Map<string, string>();

  // Resolve `employeeNumber` and `employeeNumberDup` together so the duplicate
  // header (column 44) is bound to the second occurrence rather than colliding
  // with the primary "Employee Number" column.
  const empBucket = buckets.get(headerKey("Employee Number")) ?? [];
  const primary = empBucket.find(
    (h) => COLUMN_ALIASES.employeeNumber.some((alias) => alias === h),
  );
  const dup = empBucket.find((h) => h === "Employee_Number");
  if (primary) byCanonical.set("employeeNumber", primary);
  else if (empBucket.length > 0) byCanonical.set("employeeNumber", empBucket[0]);
  if (dup && dup !== byCanonical.get("employeeNumber")) {
    byCanonical.set("employeeNumberDup", dup);
  } else if (empBucket.length > 1) {
    // Fallback: pick a different occurrence than the one we picked for primary.
    const other = empBucket.find((h) => h !== byCanonical.get("employeeNumber"));
    if (other) byCanonical.set("employeeNumberDup", other);
  }

  for (const [canonical, aliases] of Object.entries(COLUMN_ALIASES)) {
    if (canonical === "employeeNumber" || canonical === "employeeNumberDup") continue;
    for (const alias of aliases) {
      const bucket = buckets.get(headerKey(alias));
      if (bucket && bucket.length > 0) {
        byCanonical.set(canonical, bucket[0]);
        break;
      }
    }
  }

  return {
    byCanonical,
    get(row, canonical) {
      const raw = byCanonical.get(canonical);
      return raw === undefined ? undefined : row[raw];
    },
  };
}

/**
 * Locate the data sheet: pick the first sheet that has both `Month` and
 * `Employee Number` columns (§ "Detect the data sheet").
 */
function findDataSheet(
  wb: XLSX.WorkBook,
): { name: string; rows: Record<string, unknown>[]; headers: string[] } | null {
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    // Read headers from row 1 directly so we can detect the data sheet even
    // when there are zero data rows (F04 still needs to fire downstream).
    const headerRows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      defval: "",
    });
    if (headerRows.length === 0) continue;
    const headers = (headerRows[0] as unknown[]).map((v) => String(v ?? "").trim());
    const keys = new Set(headers.map(headerKey));
    const hasMonth = COLUMN_ALIASES.month.some((a) => keys.has(headerKey(a)));
    const hasEmpNum = COLUMN_ALIASES.employeeNumber.some((a) => keys.has(headerKey(a)));
    if (!hasMonth || !hasEmpNum) continue;
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
    return { name, rows, headers };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Row parsing
// ---------------------------------------------------------------------------

function jobFunctionOf(jobType: string): Employee["jobFunction"] {
  const v = jobType.toUpperCase();
  if (v === "CSS") return "CSS";
  if (v === "EEC") return "EEC";
  return "Z";
}

// Accepts English ("YES"/"NO"), Polish ("TAK"/"NIE"), single-letter ("Y"/"N"),
// numeric ("1"/"0"), and native booleans. HR exports vary by locale and source
// system; users shouldn't have to translate before importing.
const YES_TOKENS = new Set(["YES", "Y", "TAK", "T", "1", "TRUE"]);
const NO_TOKENS = new Set(["NO", "N", "NIE", "0", "FALSE"]);

function isYes(v: unknown): boolean {
  if (v === true) return true;
  if (v === false) return false;
  return YES_TOKENS.has(str(v).toUpperCase());
}

function isNo(v: unknown): boolean {
  if (v === false) return true;
  if (v === true) return false;
  return NO_TOKENS.has(str(v).toUpperCase());
}

// Some HR exports add an org-unit prefix to the duplicate Employee_Number
// column (e.g. "8310_P0000659" while Employee Number is "P0000659"). Treat the
// dup as valid when it ends with "_<empNumber>" — the trailing token is what
// the sanity check actually cares about.
function dupMatchesEmployeeNumber(emp: string, dup: string): boolean {
  if (!emp || !dup) return false;
  if (emp === dup) return true;
  return dup.endsWith(`_${emp}`);
}

interface RowParseContext {
  resolver: HeaderResolver;
  resolvePu: ResolvePuFn;
  validGradeCodes?: Set<string>;
  validLocationCodes?: Set<string>;
  puIndex?: Map<string, { sbu?: string }>;
  knownLocalNumbers: Set<string>; // populated as rows parse, used for R09/R10
}

function parseRow(
  row: Record<string, unknown>,
  rowIndex: number,
  ctx: RowParseContext,
): HrParsedRow {
  const r = ctx.resolver;
  const localNumber = str(r.get(row, "employeeNumber"));
  const dup = str(r.get(row, "employeeNumberDup"));
  const fileMonth = asPeriod(r.get(row, "month"));

  const rawProductionUnit = str(r.get(row, "productionUnit"));
  const rawPeopleUnit = str(r.get(row, "peopleUnit"));
  const rawLocation = str(r.get(row, "location"));

  const firstName = str(r.get(row, "firstName"));
  const lastName = str(r.get(row, "lastName"));
  const explicitDisplay = str(r.get(row, "displayName"));
  const displayName = explicitDisplay || `${firstName} ${lastName}`.trim();

  const employment = asDate(r.get(row, "dateOfEmployment"));
  const termination = asDate(r.get(row, "dateOfTermination"));
  const endContract = asDate(r.get(row, "dateOfEndContract"));
  const release = asDate(r.get(row, "dateOfRelease"));
  const terminationMethodRaw = str(r.get(row, "terminationMethod"));
  const parsedTerminationMethod = terminationMethodRaw || null;
  const reportGeneratedAt = asDate(r.get(row, "reportGenerationDate"));

  const hiredVal = r.get(row, "hiredYesNo");
  const joinerQVal = r.get(row, "joinerQ");
  const leaverVal = r.get(row, "leaver");
  const hiredYes = isYes(hiredVal);
  const joinerQYes = isYes(joinerQVal);
  // `Hired YES/NO` in real HR exports means "currently employed" (a static
  // status that's TAK for almost everyone), while `Joiner?` is the per-month
  // event flag we actually care about. Trust `Joiner?` when present; only
  // fall back to `Hired YES/NO` if the file doesn't include `Joiner?` at all.
  const hasJoinerQColumn = ctx.resolver.byCanonical.has("joinerQ");
  const joinerYes = hasJoinerQColumn ? joinerQYes : hiredYes;
  const leaverYes = isYes(leaverVal);

  const partTimeRaw = r.get(row, "partTime");
  const fteCapacity = parsePercent(partTimeRaw);

  const gradeCode = str(r.get(row, "grade"));
  const jobType = str(r.get(row, "jobType"));
  const locationCode = inferLocCode(rawLocation);

  // PU resolution: mapping first, then heuristic fallback.
  const puResolution = ctx.resolvePu(rawProductionUnit);
  const resolvedPuCode = puResolution.via === "none" ? null : puResolution.code;
  const resolvedPuVia = puResolution.via;

  // Independent People-Unit resolution for R07.
  const peopleUnitResolution = rawPeopleUnit
    ? ctx.resolvePu(rawPeopleUnit)
    : { code: "", via: "none" as const };

  const rowWarnings: HrImportWarning[] = [];
  const rowErrors: { code: string; message: string }[] = [];

  // R01 — PU not resolvable via mapping (heuristic still fills it).
  if (resolvedPuVia !== "mapping") {
    rowWarnings.push({
      code: "R01",
      localNumber,
      message: `Production Unit "${rawProductionUnit}" has no admin mapping; resolved by heuristic.`,
    });
  }

  // R02 — Grade unknown.
  if (gradeCode && ctx.validGradeCodes && !ctx.validGradeCodes.has(gradeCode)) {
    rowWarnings.push({
      code: "R02",
      localNumber,
      message: `Grade "${gradeCode}" is not in the application grade list.`,
    });
  }

  // R03 — Location code unknown.
  if (
    locationCode &&
    ctx.validLocationCodes &&
    !ctx.validLocationCodes.has(locationCode)
  ) {
    rowWarnings.push({
      code: "R03",
      localNumber,
      message: `Location "${rawLocation}" resolved to unknown code "${locationCode}".`,
    });
  }

  // R04 — termination earlier than employment.
  if (employment && termination && termination < employment) {
    rowWarnings.push({
      code: "R04",
      localNumber,
      message: `Date of termination ${termination} is before date of employment ${employment}.`,
    });
  }

  // R05 — anomaly: Joiner=YES but employee is not currently employed.
  // The original "they should always agree" rule was wrong: `Hired YES/NO`
  // is a static employment status (TAK for nearly everyone) while `Joiner?`
  // is the per-month event flag, so they legitimately differ on most rows.
  // Only the inconsistent direction (joiner of someone marked NOT employed)
  // is worth surfacing.
  const hiredHasValue = isYes(hiredVal) || isNo(hiredVal);
  const joinerHasValue = isYes(joinerQVal) || isNo(joinerQVal);
  if (
    hiredHasValue &&
    joinerHasValue &&
    joinerQYes &&
    !hiredYes
  ) {
    rowWarnings.push({
      code: "R05",
      localNumber,
      message: `Joiner? = YES but Hired YES/NO = ${str(hiredVal)} (employee not marked as currently employed).`,
    });
  }

  // R06 — Leaver=YES but Date of termination empty. ROW REJECTED.
  if (leaverYes && !termination) {
    rowErrors.push({
      code: "R06",
      message: `Leaver = YES but Date of termination is empty.`,
    });
  }

  // R07 — People Unit resolves to a different PU than Production Unit.
  if (
    rawPeopleUnit &&
    peopleUnitResolution.via !== "none" &&
    resolvedPuVia !== "none" &&
    peopleUnitResolution.code !== resolvedPuCode
  ) {
    rowWarnings.push({
      code: "R07",
      localNumber,
      message: `People Unit "${rawPeopleUnit}" resolves to ${peopleUnitResolution.code} but Production Unit resolves to ${resolvedPuCode}.`,
    });
  }

  // R08 — SBU mismatch.
  const fileSbu = str(r.get(row, "sbu"));
  if (fileSbu && resolvedPuCode && ctx.puIndex) {
    const puSbu = ctx.puIndex.get(resolvedPuCode)?.sbu;
    if (puSbu && puSbu !== fileSbu) {
      rowWarnings.push({
        code: "R08",
        localNumber,
        message: `SBU "${fileSbu}" from file does not match PU SBU "${puSbu}" for ${resolvedPuCode}.`,
      });
    }
  }

  // R09 — directSupervisorLocalNumber not in known set.
  const directSupervisorLocalNumber = str(r.get(row, "directSupervisorLocalNumber"));
  if (
    directSupervisorLocalNumber &&
    !ctx.knownLocalNumbers.has(directSupervisorLocalNumber)
  ) {
    rowWarnings.push({
      code: "R09",
      localNumber,
      message: `Direct supervisor's number ${directSupervisorLocalNumber} not found in file or store.`,
    });
  }

  // R10 — contractManagerLocalNumber not in known set.
  const contractManagerLocalNumber = str(r.get(row, "contractManagerLocalNumber"));
  if (
    contractManagerLocalNumber &&
    !ctx.knownLocalNumbers.has(contractManagerLocalNumber)
  ) {
    rowWarnings.push({
      code: "R10",
      localNumber,
      message: `Contract manager's number ${contractManagerLocalNumber} not found in file or store.`,
    });
  }

  // R11 — Part time out of (0, 1]. ROW REJECTED.
  if (partTimeRaw !== undefined && partTimeRaw !== "" && partTimeRaw !== null) {
    if (fteCapacity === null || fteCapacity <= 0 || fteCapacity > 1) {
      rowErrors.push({
        code: "R11",
        message: `Part time value "${str(partTimeRaw)}" is outside (0, 1].`,
      });
    }
  }

  // Build the partial Employee from §8 mappings.
  const employee: Partial<Employee> & { localNumber: string } = {
    localNumber,
    firstName,
    lastName,
    displayName,
    puCode: resolvedPuCode ?? "",
    gradeCode,
    jobFunction: jobFunctionOf(jobType),
    locationCode,
    startDate: employment ?? "",
    endDate: termination,
    fteCapacity: fteCapacity ?? 0,
    engagement: rawProductionUnit,
    skills: [],
  };

  // Optional / NEW fields — only set when non-empty so the diff comparison
  // treats "" === undefined cleanly.
  const setIf = <K extends keyof Employee>(key: K, value: Employee[K] | "" | null) => {
    if (value === "" || value === null || value === undefined) return;
    employee[key] = value as Employee[K];
  };

  setIf("email", str(r.get(row, "email")));
  const sex = str(r.get(row, "sex")).toUpperCase();
  if (sex === "M" || sex === "F") employee.sex = sex;
  else if (sex && sex !== "M" && sex !== "F") employee.sex = "Other";
  setIf("hrFileNumber", str(r.get(row, "hrFileNumber")));
  if (endContract) employee.contractEndDate = endContract;
  if (release) employee.releaseDate = release;
  setIf("practice", str(r.get(row, "practice")));
  setIf("pnlUnit", str(r.get(row, "pnl")));
  setIf("qualification", str(r.get(row, "qualification")));
  setIf("jobNameModel", str(r.get(row, "jobNameModel")));
  setIf("positionPl", str(r.get(row, "positionPl")));
  setIf("positionEn", str(r.get(row, "positionEn")));
  setIf("contractManagerName", str(r.get(row, "contractManagerName")));
  setIf("contractManagerLocalNumber", contractManagerLocalNumber);
  setIf("contractManagerEmail", str(r.get(row, "contractManagerEmail")));
  setIf("directSupervisorName", str(r.get(row, "directSupervisorName")));
  setIf("directSupervisorLocalNumber", directSupervisorLocalNumber);
  setIf("directSupervisorEmail", str(r.get(row, "directSupervisorEmail")));
  setIf("workExperience", str(r.get(row, "workExperience")));
  setIf("currentEmployeeType", str(r.get(row, "currentEmployeeType")));
  setIf("separationsFlag", str(r.get(row, "separations")));
  setIf("org1Name", str(r.get(row, "org1Name")));
  setIf("org1Code", str(r.get(row, "org1Code")));
  setIf("org2Name", str(r.get(row, "org2Name")));
  setIf("org3Code", str(r.get(row, "org3Code")));

  // Touch num() so the import path is exercised by the linter even when
  // the column doesn't exist; keeps it consistent with `excelParser.ts`.
  void num;

  return {
    rowIndex,
    rawEmployeeNumber: localNumber,
    rawEmployeeNumberDup: dup,
    fileMonth,
    employee,
    joinerYes,
    leaverYes,
    dateOfTermination: termination,
    dateOfEndContract: endContract,
    dateOfRelease: release,
    parsedTerminationMethod,
    reportGeneratedAt,
    resolvedPuCode,
    resolvedPuVia,
    rawProductionUnit,
    rawPeopleUnit,
    rawLocation,
    rowWarnings,
    rowErrors,
  };
}

// ---------------------------------------------------------------------------
// File-level orchestration
// ---------------------------------------------------------------------------

export async function parseHrDatabaseFile(
  file: File,
  resolvePu: ResolvePuFn,
  options: HrParseOptions = {},
): Promise<HrParseResult> {
  const fileErrors: { code: string; message: string }[] = [];

  let wb: XLSX.WorkBook;
  try {
    const buffer = await file.arrayBuffer();
    wb = XLSX.read(buffer, { type: "array", cellDates: false });
  } catch (e) {
    return {
      fileName: file.name,
      fileSize: file.size,
      fileMonth: null,
      reportGeneratedAt: null,
      rows: [],
      fileErrors: [
        {
          code: "F01",
          message: `Could not parse file as .xlsx/.xlsm: ${(e as Error).message}`,
        },
      ],
      rowCounts: { read: 0, rejected: 0, warnings: 0 },
    };
  }

  const sheet = findDataSheet(wb);
  if (!sheet) {
    fileErrors.push({
      code: "F01",
      message: `No sheet contains both "Month" and "Employee Number" columns.`,
    });
    return {
      fileName: file.name,
      fileSize: file.size,
      fileMonth: null,
      reportGeneratedAt: null,
      rows: [],
      fileErrors,
      rowCounts: { read: 0, rejected: 0, warnings: 0 },
    };
  }

  const resolver = buildHeaderResolver(sheet.headers);

  // F02 — required columns missing.
  const missing = REQUIRED_CANONICAL_KEYS.filter((k) => !resolver.byCanonical.has(k));
  if (missing.length > 0) {
    const friendly = missing.map((k) => COLUMN_ALIASES[k][0]).join(", ");
    fileErrors.push({
      code: "F02",
      message: `Missing required columns: ${friendly}.`,
    });
  }

  // F04 — zero data rows.
  if (sheet.rows.length === 0) {
    fileErrors.push({ code: "F04", message: "File contains no data rows." });
  }

  // If we already can't parse the structure, return early before per-row work.
  if (fileErrors.length > 0) {
    return {
      fileName: file.name,
      fileSize: file.size,
      fileMonth: null,
      reportGeneratedAt: null,
      rows: [],
      fileErrors,
      rowCounts: { read: sheet.rows.length, rejected: 0, warnings: 0 },
    };
  }

  // First pass: collect known local numbers so R09/R10 can check forward references.
  const knownLocalNumbers = new Set<string>();
  for (const row of sheet.rows) {
    const n = str(resolver.get(row, "employeeNumber"));
    if (n) knownLocalNumbers.add(n);
  }

  const ctx: RowParseContext = {
    resolver,
    resolvePu,
    validGradeCodes: options.validGradeCodes,
    validLocationCodes: options.validLocationCodes,
    puIndex: options.puIndex,
    knownLocalNumbers,
  };

  const parsed: HrParsedRow[] = [];
  const monthsSeen = new Set<string>();
  const localNumberCounts = new Map<string, number>();
  let canonicalReportGen: string | null = null;

  for (let i = 0; i < sheet.rows.length; i++) {
    const row = sheet.rows[i];
    const parsedRow = parseRow(row, i, ctx);
    parsed.push(parsedRow);

    if (parsedRow.fileMonth) monthsSeen.add(parsedRow.fileMonth);
    if (parsedRow.rawEmployeeNumber) {
      localNumberCounts.set(
        parsedRow.rawEmployeeNumber,
        (localNumberCounts.get(parsedRow.rawEmployeeNumber) ?? 0) + 1,
      );
    }
    if (parsedRow.reportGeneratedAt && !canonicalReportGen) {
      canonicalReportGen = parsedRow.reportGeneratedAt;
    }
  }

  // F05 — empty Employee Number in any row.
  const emptyRows = parsed
    .map((p, i) => (p.rawEmployeeNumber ? null : i))
    .filter((i): i is number => i !== null);
  if (emptyRows.length > 0) {
    const examples = emptyRows.slice(0, 3).map((i) => `row ${i + 2}`);
    const more =
      emptyRows.length > examples.length
        ? ` …and ${emptyRows.length - examples.length} more`
        : "";
    fileErrors.push({
      code: "F05",
      message: `${emptyRows.length} row(s) have an empty Employee Number: ${examples.join(", ")}${more}.`,
    });
  }

  // F06 — duplicates within file.
  const duplicates = [...localNumberCounts.entries()].filter(([, c]) => c > 1);
  if (duplicates.length > 0) {
    const examples = duplicates.slice(0, 5).map(([n, c]) => `${n} (×${c})`);
    const more =
      duplicates.length > examples.length
        ? ` …and ${duplicates.length - examples.length} more`
        : "";
    fileErrors.push({
      code: "F06",
      message: `${duplicates.length} Employee Number(s) appear more than once: ${examples.join(", ")}${more}.`,
    });
  }

  // F07 — Employee Number != Employee_Number per row (only when dup column is present).
  if (resolver.byCanonical.has("employeeNumberDup")) {
    const mismatches = parsed.filter(
      (p) =>
        p.rawEmployeeNumber &&
        p.rawEmployeeNumberDup &&
        !dupMatchesEmployeeNumber(p.rawEmployeeNumber, p.rawEmployeeNumberDup),
    );
    if (mismatches.length > 0) {
      const examples = mismatches
        .slice(0, 3)
        .map(
          (m) =>
            `row ${m.rowIndex + 2}: "${m.rawEmployeeNumber}" ≠ "${m.rawEmployeeNumberDup}"`,
        );
      const more =
        mismatches.length > examples.length
          ? ` …and ${mismatches.length - examples.length} more`
          : "";
      fileErrors.push({
        code: "F07",
        message: `${mismatches.length} of ${parsed.length} row(s) have an "Employee_Number" value that doesn't match "Employee Number". Examples: ${examples.join("; ")}${more}.`,
      });
    }
  }

  // F03 — Month not identical/parseable across rows.
  if (parsed.some((p) => p.fileMonth === null)) {
    fileErrors.push({
      code: "F03",
      message: `One or more rows have an unparseable Month value.`,
    });
  } else if (monthsSeen.size > 1) {
    fileErrors.push({
      code: "F03",
      message: `Month column is not identical across rows (saw: ${[...monthsSeen].sort().join(", ")}).`,
    });
  }

  const fileMonth = monthsSeen.size === 1 ? [...monthsSeen][0] : null;

  const rejected = parsed.filter((p) => p.rowErrors.length > 0).length;
  const warningCount = parsed.reduce((s, p) => s + p.rowWarnings.length, 0);

  return {
    fileName: file.name,
    fileSize: file.size,
    fileMonth,
    reportGeneratedAt: canonicalReportGen,
    rows: parsed,
    fileErrors,
    rowCounts: { read: parsed.length, rejected, warnings: warningCount },
  };
}
