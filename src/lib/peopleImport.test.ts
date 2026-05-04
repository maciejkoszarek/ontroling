import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parsePeopleWorkbook } from "./peopleImport";

const HEADER = [
  "Month",
  "Last Name",
  "First Name",
  "Employee Number",
  "Hired YES/NO",
  "Location",
  "Date of employment",
  "Date of termination",
  "Organization Name",
  "Number of Organization",
  "Organization Name2",
  "Number of Organization3",
  "Production Unit",
  "Qualification",
  "Job type",
  "Job name zgodnie z modelem",
  "Grade",
  "Contract manager",
  "Contract manager's number",
  "Contract manager's email",
  "File number",
  "Separations",
  "Part time",
  "Position (Polish)",
  "Position (English)",
  "Direct supervisor",
  "Direct supervisor's number",
  "Direct supervisor's email",
  "Work experience (month | day)",
  "Sex",
  "The method of contract termination",
  "Date of the end contract",
  "Date of release",
  "Report generation date",
  "e-mail",
  " Aktualny typ pracownika",
  "SBU",
  "P&L",
  "Practice",
  "People Unit",
  "Leaver",
  "Joiner?",
  "Name",
  "Employee_Number",
];

function row(overrides: Partial<Record<string, unknown>> = {}): unknown[] {
  const base: Record<string, unknown> = {
    Month: "2026-02",
    "Last Name": "KOWALSKI",
    "First Name": "JAN",
    "Employee Number": "P1000001",
    "Hired YES/NO": "TAK",
    Location: "Wrocław - Business Garden K",
    "Date of employment": "01.07.2025",
    "Date of termination": "",
    "Organization Name": "CCA-PL-CAPPS-CAPPS_39NSE3_PL01",
    "Production Unit": "PL01NC05",
    "Job type": "CSS",
    Grade: "B2",
    "Part time": 1,
    "Position (English)": "Senior Delivery Architect",
    "People Unit": "CCA_SE3",
    Leaver: "NO",
    "Joiner?": false,
    Name: "Kowalski Jan",
    Employee_Number: "8310_P1000001",
  };
  Object.assign(base, overrides);
  return HEADER.map((h) => base[h] ?? "");
}

function buildFile(rows: unknown[][]): File {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([HEADER, ...rows]);
  XLSX.utils.book_append_sheet(wb, ws, "Arkusz1");
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  return new File([out], "people.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

describe("parsePeopleWorkbook", () => {
  it("parses a basic roster row into Employee + Snapshot", async () => {
    const file = buildFile([row()]);
    const out = await parsePeopleWorkbook(file);
    expect(out.employees).toHaveLength(1);
    const e = out.employees[0];
    expect(e.localNumber).toBe("P1000001");
    expect(e.firstName).toBe("Jan");
    expect(e.lastName).toBe("Kowalski");
    expect(e.puCode).toBe("PL01NC05");
    expect(e.locationCode).toBe("WRO");
    expect(e.gradeCode).toBe("B2");
    expect(e.startDate).toBe("2025-07-01");
    expect(e.fteCapacity).toBe(1);
    expect(out.snapshots).toHaveLength(1);
    expect(out.snapshots[0].period).toBe("2026-02");
    expect(out.period).toBe("2026-02");
  });

  it("emits a Joiner record when Joiner? is true", async () => {
    const file = buildFile([row({ "Joiner?": true })]);
    const out = await parsePeopleWorkbook(file);
    expect(out.joiners).toHaveLength(1);
    expect(out.joiners[0].employeeLocalNumber).toBe("P1000001");
    expect(out.joiners[0].status).toBe("actual");
  });

  it("emits a Leaver record when Leaver=YES with end date", async () => {
    const file = buildFile([
      row({
        Leaver: "YES",
        "Date of termination": "31.01.2026",
      }),
    ]);
    const out = await parsePeopleWorkbook(file);
    expect(out.leavers).toHaveLength(1);
    expect(out.leavers[0].endDate).toBe("2026-01-31");
  });

  it("falls back to People Unit when Production Unit is missing", async () => {
    const file = buildFile([
      row({
        "Production Unit": "",
        "People Unit": "CCA_SE4",
      }),
    ]);
    const out = await parsePeopleWorkbook(file);
    expect(out.employees[0].puCode).toBe("PL01NC06");
  });

  it("skips rows missing Employee Number and reports a warning", async () => {
    const file = buildFile([
      row(),
      row({ "Employee Number": "" }),
    ]);
    const out = await parsePeopleWorkbook(file);
    expect(out.employees).toHaveLength(1);
    expect(out.warnings.some((w) => w.includes("missing Employee Number"))).toBe(true);
  });

  it("handles part-time FTE values", async () => {
    const file = buildFile([row({ "Part time": 0.625 })]);
    const out = await parsePeopleWorkbook(file);
    expect(out.employees[0].fteCapacity).toBe(0.625);
  });

  it("warns about unknown locations", async () => {
    const file = buildFile([row({ Location: "Atlantis - Sea Office" })]);
    const out = await parsePeopleWorkbook(file);
    expect(out.warnings.some((w) => w.includes("Unknown location"))).toBe(true);
    expect(out.employees[0].locationCode).toBe("REMOTE");
  });
});
