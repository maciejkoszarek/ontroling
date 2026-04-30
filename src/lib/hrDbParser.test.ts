import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseHrDatabaseFile, type ResolvePuFn } from "./hrDbParser";

/** Build an in-memory `.xlsx` File from an array-of-arrays. */
function buildFile(sheets: Record<string, unknown[][]>, name = "hr.xlsx"): File {
  const wb = XLSX.utils.book_new();
  for (const [sheetName, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), sheetName);
  }
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  return new File([out], name, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/**
 * Full header set covering every column the parser knows about. Tests build
 * data rows in the same order; reusing one constant avoids drift.
 */
const FULL_HEADER = [
  "Month",
  "Employee Number",
  "Last Name",
  "First Name",
  "Name",
  "Hired YES/NO",
  "Joiner?",
  "Leaver",
  "Location",
  "Date of employment",
  "Date of termination",
  "Date of the end contract",
  "Date of release",
  "The method of contract termination",
  "Report generation date",
  "Organization Name",
  "Number of Organization",
  "Organization Name2",
  "Number of Organization3",
  "Production Unit",
  "People Unit",
  "Practice",
  "SBU",
  "P&L",
  "Qualification",
  "Job type",
  "Job name zgodnie z modelem",
  "Grade",
  "Position (Polish)",
  "Position (English)",
  "Contract manager",
  "Contract manager's number",
  "Contract manager's email",
  "Direct supervisor",
  "Direct supervisor's number",
  "Direct supervisor's email",
  "e-mail",
  "Sex",
  "File number",
  "Separations",
  "Part time",
  "Work experience (month | day)",
  "Aktualny typ pracownika",
  "Employee_Number",
];

/** Build a fully-populated valid row keyed by Employee Number. */
function buildRow(overrides: Partial<Record<string, unknown>> = {}): unknown[] {
  const base: Record<string, unknown> = {
    Month: "2026-04",
    "Employee Number": "P1000001",
    "Last Name": "Kowalski",
    "First Name": "Jan",
    Name: "Jan Kowalski",
    "Hired YES/NO": "NO",
    "Joiner?": "NO",
    Leaver: "NO",
    Location: "Wrocław",
    "Date of employment": "2025-07-01",
    "Date of termination": "",
    "Date of the end contract": "",
    "Date of release": "",
    "The method of contract termination": "",
    "Report generation date": "2026-04-29",
    "Organization Name": "Capgemini",
    "Number of Organization": "PL01",
    "Organization Name2": "C&CA",
    "Number of Organization3": "NC04",
    "Production Unit": "CCA Software Engineers 2",
    "People Unit": "CCA Software Engineers 2",
    Practice: "C&CA",
    SBU: "C&CA",
    "P&L": "P&L01",
    Qualification: "Master",
    "Job type": "CSS",
    "Job name zgodnie z modelem": "Software Engineer",
    Grade: "B2",
    "Position (Polish)": "Programista",
    "Position (English)": "Software Engineer",
    "Contract manager": "Anna Nowak",
    "Contract manager's number": "P1000002",
    "Contract manager's email": "anna.nowak@example.com",
    "Direct supervisor": "Anna Nowak",
    "Direct supervisor's number": "P1000002",
    "Direct supervisor's email": "anna.nowak@example.com",
    "e-mail": "jan.kowalski@example.com",
    Sex: "M",
    "File number": "F123",
    Separations: "",
    "Part time": "100%",
    "Work experience (month | day)": "24 | 7",
    "Aktualny typ pracownika": "Full-time employee",
    Employee_Number: "P1000001",
    ...overrides,
  };
  return FULL_HEADER.map((h) => base[h] ?? "");
}

const knownPus: Record<string, string> = {
  "CCA Software Engineers 2": "PL01NC04",
  "CCA Software Engineers 3": "PL01NC05",
};

const stubResolvePu: ResolvePuFn = (raw) => {
  const trimmed = raw.trim();
  if (trimmed in knownPus) {
    return { code: knownPus[trimmed], via: "mapping" };
  }
  // Heuristic-style fallback for the unmapped case.
  if (trimmed) return { code: "PL01NC01", via: "heuristic" };
  return { code: "", via: "none" };
};

describe("parseHrDatabaseFile — file-level errors", () => {
  it("F02: missing required columns", async () => {
    // Drop "Grade" — required column.
    const headers = FULL_HEADER.filter((h) => h !== "Grade");
    const row = buildRow();
    const rowMinusGrade = headers.map((h) => row[FULL_HEADER.indexOf(h)]);
    const file = buildFile({ HR_DB: [headers, rowMinusGrade] });
    const result = await parseHrDatabaseFile(file, stubResolvePu);
    expect(result.fileErrors.find((e) => e.code === "F02")).toBeTruthy();
    expect(result.fileErrors[0].message).toMatch(/Grade/);
  });

  it("F03: Month differs across rows", async () => {
    const r1 = buildRow({ "Employee Number": "P1", Employee_Number: "P1", Month: "2026-04" });
    const r2 = buildRow({ "Employee Number": "P2", Employee_Number: "P2", Month: "2026-05" });
    const file = buildFile({ HR_DB: [FULL_HEADER, r1, r2] });
    const result = await parseHrDatabaseFile(file, stubResolvePu);
    expect(result.fileErrors.find((e) => e.code === "F03")).toBeTruthy();
  });

  it("F04: zero data rows", async () => {
    const file = buildFile({ HR_DB: [FULL_HEADER] });
    const result = await parseHrDatabaseFile(file, stubResolvePu);
    expect(result.fileErrors.find((e) => e.code === "F04")).toBeTruthy();
  });

  it("F05: empty Employee Number on a row", async () => {
    const r1 = buildRow({ "Employee Number": "", Employee_Number: "" });
    const file = buildFile({ HR_DB: [FULL_HEADER, r1] });
    const result = await parseHrDatabaseFile(file, stubResolvePu);
    expect(result.fileErrors.find((e) => e.code === "F05")).toBeTruthy();
  });

  it("F06: duplicate Employee Number within file", async () => {
    const r1 = buildRow({ "Employee Number": "P1", Employee_Number: "P1" });
    const r2 = buildRow({ "Employee Number": "P1", Employee_Number: "P1" });
    const file = buildFile({ HR_DB: [FULL_HEADER, r1, r2] });
    const result = await parseHrDatabaseFile(file, stubResolvePu);
    expect(result.fileErrors.find((e) => e.code === "F06")).toBeTruthy();
  });

  it("F07: Employee Number != Employee_Number per row", async () => {
    const r1 = buildRow({ "Employee Number": "P1", Employee_Number: "P2" });
    const file = buildFile({ HR_DB: [FULL_HEADER, r1] });
    const result = await parseHrDatabaseFile(file, stubResolvePu);
    const f07 = result.fileErrors.find((e) => e.code === "F07");
    expect(f07).toBeTruthy();
    // Message should include counts and example values, not a wall of indices.
    expect(f07!.message).toMatch(/1 of 1 row/);
    expect(f07!.message).toMatch(/"P1"/);
    expect(f07!.message).toMatch(/"P2"/);
  });

  it("F07: accepts org-prefix pattern in Employee_Number (e.g. \"8310_P0001\")", async () => {
    // Real-world HR exports prefix the duplicate column with an org-unit code.
    const r1 = buildRow({
      "Employee Number": "P0001",
      Employee_Number: "8310_P0001",
    });
    const r2 = buildRow({
      "Employee Number": "P0002",
      Employee_Number: "8310_P0002",
    });
    const file = buildFile({ HR_DB: [FULL_HEADER, r1, r2] });
    const result = await parseHrDatabaseFile(file, stubResolvePu);
    expect(result.fileErrors.find((e) => e.code === "F07")).toBeUndefined();
  });

  it("F06 message truncates long duplicate lists with a count + first 5", async () => {
    const rows = Array.from({ length: 8 }, () =>
      buildRow({ "Employee Number": "P1", Employee_Number: "P1" }),
    );
    const file = buildFile({ HR_DB: [FULL_HEADER, ...rows] });
    const result = await parseHrDatabaseFile(file, stubResolvePu);
    const f06 = result.fileErrors.find((e) => e.code === "F06");
    expect(f06).toBeTruthy();
    expect(f06!.message).toMatch(/×8/);
  });

  it("F01: no sheet has both Month and Employee Number columns", async () => {
    const file = buildFile({ Other: [["foo", "bar"], [1, 2]] });
    const result = await parseHrDatabaseFile(file, stubResolvePu);
    expect(result.fileErrors.find((e) => e.code === "F01")).toBeTruthy();
  });
});

describe("parseHrDatabaseFile — row-level rules", () => {
  it("R01: PU with no mapping surfaces a warning but row still parses with heuristic", async () => {
    const r = buildRow({
      "Production Unit": "Some Unknown Unit",
      "People Unit": "Some Unknown Unit",
    });
    const file = buildFile({ HR_DB: [FULL_HEADER, r] });
    const result = await parseHrDatabaseFile(file, stubResolvePu);
    expect(result.fileErrors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].resolvedPuVia).toBe("heuristic");
    expect(result.rows[0].resolvedPuCode).toBe("PL01NC01");
    expect(result.rows[0].rowWarnings.find((w) => w.code === "R01")).toBeTruthy();
    expect(result.rows[0].rowErrors).toHaveLength(0);
  });

  it("R06: Leaver=YES with empty Date of termination rejects the row", async () => {
    const r = buildRow({
      Leaver: "YES",
      "Date of termination": "",
    });
    const file = buildFile({ HR_DB: [FULL_HEADER, r] });
    const result = await parseHrDatabaseFile(file, stubResolvePu);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].rowErrors.find((e) => e.code === "R06")).toBeTruthy();
    expect(result.rowCounts.rejected).toBe(1);
  });

  it("R11: Part time = 1.5 rejects the row", async () => {
    const r = buildRow({ "Part time": "1.5" });
    const file = buildFile({ HR_DB: [FULL_HEADER, r] });
    const result = await parseHrDatabaseFile(file, stubResolvePu);
    expect(result.rows[0].rowErrors.find((e) => e.code === "R11")).toBeTruthy();
  });

  it("R04: termination before employment surfaces a warning", async () => {
    const r = buildRow({
      "Date of employment": "2025-07-01",
      "Date of termination": "2024-01-01",
      Leaver: "NO",
    });
    const file = buildFile({ HR_DB: [FULL_HEADER, r] });
    const result = await parseHrDatabaseFile(file, stubResolvePu);
    expect(result.rows[0].rowWarnings.find((w) => w.code === "R04")).toBeTruthy();
  });

  it("R05: Hired=NO + Joiner?=YES surfaces a warning", async () => {
    const r = buildRow({ "Hired YES/NO": "NO", "Joiner?": "YES" });
    const file = buildFile({ HR_DB: [FULL_HEADER, r] });
    const result = await parseHrDatabaseFile(file, stubResolvePu);
    expect(result.rows[0].rowWarnings.find((w) => w.code === "R05")).toBeTruthy();
    // joinerYes is the OR of Hired and Joiner? — should still be true.
    expect(result.rows[0].joinerYes).toBe(true);
  });

  it("does NOT raise R05 when both fields agree", async () => {
    const r = buildRow({ "Hired YES/NO": "YES", "Joiner?": "YES" });
    const file = buildFile({ HR_DB: [FULL_HEADER, r] });
    const result = await parseHrDatabaseFile(file, stubResolvePu);
    expect(result.rows[0].rowWarnings.find((w) => w.code === "R05")).toBeFalsy();
  });

  it("accepts Polish TAK/NIE for Hired YES/NO and Joiner?", async () => {
    const hired = buildRow({ "Hired YES/NO": "TAK", "Joiner?": "TAK" });
    const notHired = buildRow({
      "Employee Number": "P2",
      Employee_Number: "P2",
      "Hired YES/NO": "NIE",
      "Joiner?": "NIE",
    });
    const file = buildFile({ HR_DB: [FULL_HEADER, hired, notHired] });
    const result = await parseHrDatabaseFile(file, stubResolvePu);
    expect(result.rows[0].joinerYes).toBe(true);
    expect(result.rows[1].joinerYes).toBe(false);
  });

  it("accepts native boolean Joiner?/Leaver values", async () => {
    const r = buildRow({ "Hired YES/NO": "NO", "Joiner?": false, Leaver: true });
    const file = buildFile({ HR_DB: [FULL_HEADER, r] });
    const result = await parseHrDatabaseFile(file, stubResolvePu);
    expect(result.rows[0].joinerYes).toBe(false);
    expect(result.rows[0].leaverYes).toBe(true);
  });
});

describe("parseHrDatabaseFile — resolver injection", () => {
  it("uses the resolver — `mapping` for known input, `none`/heuristic for unknown", async () => {
    const known = buildRow({
      "Employee Number": "P1",
      Employee_Number: "P1",
      "Production Unit": "CCA Software Engineers 2",
    });
    const unknown = buildRow({
      "Employee Number": "P2",
      Employee_Number: "P2",
      "Production Unit": "Brand New Unit",
      "People Unit": "Brand New Unit",
    });
    const file = buildFile({ HR_DB: [FULL_HEADER, known, unknown] });
    const result = await parseHrDatabaseFile(file, stubResolvePu);
    expect(result.fileErrors).toHaveLength(0);
    const r1 = result.rows.find((r) => r.rawEmployeeNumber === "P1")!;
    const r2 = result.rows.find((r) => r.rawEmployeeNumber === "P2")!;
    expect(r1.resolvedPuVia).toBe("mapping");
    expect(r1.resolvedPuCode).toBe("PL01NC04");
    expect(r1.rowWarnings.find((w) => w.code === "R01")).toBeFalsy();
    expect(r2.resolvedPuVia).toBe("heuristic");
    expect(r2.rowWarnings.find((w) => w.code === "R01")).toBeTruthy();
  });
});

describe("parseHrDatabaseFile — Polish percent normalisation for Part time", () => {
  it("normalises '100%', '0.8', '80', '80%', and '1' all to a finite 0..1 number", async () => {
    const cases: Array<[string, number]> = [
      ["100%", 1],
      ["0.8", 0.8],
      ["80", 0.8],
      ["80%", 0.8],
      ["1", 1],
    ];
    for (let i = 0; i < cases.length; i++) {
      const [input, expected] = cases[i];
      const r = buildRow({
        "Employee Number": `P${i + 100}`,
        Employee_Number: `P${i + 100}`,
        "Part time": input,
      });
      const file = buildFile({ HR_DB: [FULL_HEADER, r] });
      const result = await parseHrDatabaseFile(file, stubResolvePu);
      expect(result.rows[0].rowErrors).toHaveLength(0);
      expect(result.rows[0].employee.fteCapacity).toBeCloseTo(expected, 5);
    }
  });
});

describe("parseHrDatabaseFile — happy path", () => {
  it("produces a parsed row with canonical mappings and a single fileMonth", async () => {
    const r = buildRow();
    const file = buildFile({ HR_DB: [FULL_HEADER, r] });
    const result = await parseHrDatabaseFile(file, stubResolvePu);
    expect(result.fileErrors).toHaveLength(0);
    expect(result.fileMonth).toBe("2026-04");
    expect(result.rows).toHaveLength(1);
    const parsed = result.rows[0];
    expect(parsed.employee.localNumber).toBe("P1000001");
    expect(parsed.employee.firstName).toBe("Jan");
    expect(parsed.employee.lastName).toBe("Kowalski");
    expect(parsed.employee.puCode).toBe("PL01NC04");
    expect(parsed.employee.locationCode).toBe("WRO");
    expect(parsed.employee.fteCapacity).toBe(1);
    expect(parsed.employee.jobFunction).toBe("CSS");
    expect(parsed.employee.email).toBe("jan.kowalski@example.com");
    expect(parsed.employee.directSupervisorLocalNumber).toBe("P1000002");
    expect(parsed.reportGeneratedAt).toBe("2026-04-29");
  });
});
