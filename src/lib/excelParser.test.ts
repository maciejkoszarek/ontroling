import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseWorkbook } from "./excelParser";

/**
 * Build an in-memory .xlsx workbook and wrap it in a `File` so `parseWorkbook`
 * (which reads via `file.arrayBuffer()`) can consume it end-to-end.
 */
function buildFixtureFile(sheets: Record<string, unknown[][]>): File {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  return new File([out], "fixture.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

describe("parseWorkbook — minimal HR_DB + GFS_DB + misformed period", () => {
  it("parses one HR row, one GFS row, and ignores a misformed period row", async () => {
    const hrHeader = [
      "Month",
      "Employee Number",
      "First Name",
      "Last Name",
      "Engagement",
      "Location",
      "Grade",
      "FTE wymiar",
      "Job Function",
      "Date of employment",
      "Hired YES/NO",
    ];
    const hrRows: unknown[][] = [
      hrHeader,
      [
        "2026-04",
        "P1000001",
        "Jan",
        "Kowalski",
        "SE1",
        "Wrocław",
        "B2",
        1,
        "CSS",
        "2025-07-01",
        "YES",
      ],
      // Misformed Month: the row must NOT surface in snapshots — the parser's
      // `asPeriod` returns null and the loop `continue`s.
      [
        "not-a-date",
        "P9999999",
        "Bad",
        "Row",
        "SE2",
        "Kraków",
        "C1",
        1,
        "CSS",
        "2025-07-01",
        "NO",
      ],
    ];
    // GFS_DB with a wide (month-per-column) layout mirrored after the real sheet.
    const gfsHeader = ["Employee No.", "Project Number", "Project Type", "2026-04", "2026-05"];
    const gfsRows: unknown[][] = [
      gfsHeader,
      ["P1000001", "PRJ-001", "External Services", 120, 0],
    ];

    const file = buildFixtureFile({ HR_DB: hrRows, GFS_DB: gfsRows });
    const { result } = await parseWorkbook(file);

    expect(result.sheetNames).toContain("HR_DB");
    expect(result.sheetNames).toContain("GFS_DB");
    // HR row count is the raw sheet count (2 rows), not the filtered count.
    expect(result.rowCounts.HR_DB).toBe(2);

    // Only the well-formed row contributes to snapshots / employees.
    expect(result.snapshots).toHaveLength(1);
    expect(result.snapshots[0].employeeLocalNumber).toBe("P1000001");
    expect(result.snapshots[0].period).toBe("2026-04");
    // Engagement "SE1" → PL01NC03 via inferPuCode.
    expect(result.snapshots[0].puCode).toBe("PL01NC03");

    expect(result.employees).toHaveLength(1);
    expect(result.employees[0].localNumber).toBe("P1000001");
    expect(result.employees[0].puCode).toBe("PL01NC03");
    // "Wrocław" should resolve through inferLocCode to WRO.
    expect(result.employees[0].locationCode).toBe("WRO");

    // GFS: one row, only the non-zero month column produces an entry.
    expect(result.gfsHours).toHaveLength(1);
    expect(result.gfsHours[0]).toMatchObject({
      employeeLocalNumber: "P1000001",
      period: "2026-04",
      projectNumber: "PRJ-001",
      hours: 120,
    });
  });

  it("asPeriod accepts an Excel date serial in the Month column", async () => {
    // Excel serial 45748 = 2025-04-01 under the 1900 date system.
    const ws = XLSX.utils.aoa_to_sheet([
      ["Month", "Employee Number", "First Name", "Last Name", "Engagement", "Location", "Grade", "FTE wymiar"],
    ]);
    XLSX.utils.sheet_add_aoa(
      ws,
      [[45748, "P1000002", "Anna", "Nowak", "SE2", "Kraków", "B2", 1]],
      { origin: "A2" },
    );
    // Mark the Month cell as a date so SheetJS serialises it as a numeric serial on read.
    const cellA2 = ws["A2"];
    if (cellA2) cellA2.t = "n";
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "HR_DB");
    const out = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
    const file = new File([out], "serial.xlsx");

    const { result } = await parseWorkbook(file);
    expect(result.snapshots).toHaveLength(1);
    // The Excel 1900 epoch converts 45748 → 2025-04; exact day doesn't matter for `Period`.
    expect(result.snapshots[0].period).toMatch(/^\d{4}-\d{2}$/);
  });

  it("inferPuCode maps known engagement substrings to the expected codes; unknown engagement falls back to PL01NC01 (locking in CURRENT behavior)", async () => {
    const hrHeader = [
      "Month",
      "Employee Number",
      "First Name",
      "Last Name",
      "Engagement",
      "Location",
      "Grade",
      "FTE wymiar",
    ];
    const cases: Array<[string, string]> = [
      ["SE1", "PL01NC03"],
      ["SE3", "PL01NC05"],
      ["CLOUD native", "PL01NC08"],
      ["Complex deal", "PL01NC09"],
      ["something-else-unknown", "PL01NC01"],
    ];
    const rows: unknown[][] = [hrHeader];
    cases.forEach(([engagement], i) => {
      rows.push(["2026-04", `PX${i.toString().padStart(6, "0")}`, "F", "L", engagement, "Remote", "B2", 1]);
    });
    const file = buildFixtureFile({ HR_DB: rows });
    const { result } = await parseWorkbook(file);
    expect(result.snapshots).toHaveLength(cases.length);
    for (let i = 0; i < cases.length; i++) {
      const [, expectedPu] = cases[i];
      const snap = result.snapshots.find((s) => s.employeeLocalNumber === `PX${i.toString().padStart(6, "0")}`);
      expect(snap?.puCode).toBe(expectedPu);
    }
  });

  it("emits a warning when an expected sheet is missing", async () => {
    const file = buildFixtureFile({
      UnrelatedSheet: [["foo"], ["bar"]],
    });
    const { result } = await parseWorkbook(file);
    // The parser should surface warnings for each of the five expected sheets.
    expect(result.warnings.some((w) => /HR_DB/i.test(w))).toBe(true);
    expect(result.warnings.some((w) => /GFS_DB/i.test(w))).toBe(true);
    expect(result.warnings.some((w) => /Joiners_DB/i.test(w))).toBe(true);
    expect(result.warnings.some((w) => /Leavers_DB/i.test(w))).toBe(true);
    // No employees / snapshots / hours should have leaked through.
    expect(result.employees).toHaveLength(0);
    expect(result.snapshots).toHaveLength(0);
    expect(result.gfsHours).toHaveLength(0);
  });

  it("parses Joiners_DB and Leavers_DB rows into typed objects with inferred PU codes", async () => {
    const file = buildFixtureFile({
      Joiners_DB: [
        ["Employee Number", "First Name", "Last Name", "PU", "Grade", "Location", "Role", "Start Date"],
        ["P0001001", "Ewa", "Maj", "SE1", "B2", "Wrocław", "Engineer", "2030-01-15"],
      ],
      Leavers_DB: [
        ["Employee Number", "First Name", "Last Name", "PU", "Grade", "Engagement", "Leaving Date"],
        ["P0001002", "Piotr", "Zieliński", "SE2", "C1", "SE2", "2026-03-31"],
      ],
    });
    const { result } = await parseWorkbook(file);
    expect(result.joiners).toHaveLength(1);
    expect(result.joiners[0]).toMatchObject({
      employeeLocalNumber: "P0001001",
      puCode: "PL01NC03",
      status: "planned", // 2030 start date is in the future
    });
    expect(result.leavers).toHaveLength(1);
    expect(result.leavers[0]).toMatchObject({
      employeeLocalNumber: "P0001002",
      puCode: "PL01NC04",
      endDate: "2026-03-31",
    });
  });
});
