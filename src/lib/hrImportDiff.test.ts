import { describe, expect, it } from "vitest";
import type { Employee } from "../types";
import type { HrParseResult, HrParsedRow } from "./hrDbParser";
import { buildHrImportPreview } from "./hrImportDiff";

/** Synthesize a minimal `HrParsedRow` without going through the Excel parser. */
function makeParsedRow(
  localNumber: string,
  employee: Partial<Employee>,
  flags: Partial<{
    joinerYes: boolean;
    leaverYes: boolean;
    dateOfTermination: string | null;
    rowErrors: { code: string; message: string }[];
  }> = {},
): HrParsedRow {
  return {
    rowIndex: 0,
    rawEmployeeNumber: localNumber,
    rawEmployeeNumberDup: localNumber,
    fileMonth: "2026-04",
    employee: { localNumber, ...employee },
    joinerYes: flags.joinerYes ?? false,
    leaverYes: flags.leaverYes ?? false,
    dateOfTermination: flags.dateOfTermination ?? null,
    dateOfEndContract: null,
    dateOfRelease: null,
    parsedTerminationMethod: null,
    reportGeneratedAt: null,
    resolvedPuCode: employee.puCode ?? null,
    resolvedPuVia: "mapping",
    rawProductionUnit: "",
    rawPeopleUnit: "",
    rawLocation: "",
    rowWarnings: [],
    rowErrors: flags.rowErrors ?? [],
  };
}

function makeParseResult(rows: HrParsedRow[]): HrParseResult {
  return {
    fileName: "hr.xlsx",
    fileSize: 1,
    fileMonth: "2026-04",
    reportGeneratedAt: "2026-04-29",
    rows,
    fileErrors: [],
    rowCounts: {
      read: rows.length,
      rejected: rows.filter((r) => r.rowErrors.length > 0).length,
      warnings: rows.reduce((s, r) => s + r.rowWarnings.length, 0),
    },
  };
}

function makeEmployee(over: Partial<Employee> & { localNumber: string }): Employee {
  return {
    firstName: "First",
    lastName: "Last",
    displayName: "First Last",
    puCode: "PL01NC04",
    gradeCode: "B2",
    jobFunction: "CSS",
    locationCode: "WRO",
    startDate: "2024-01-01",
    fteCapacity: 1,
    engagement: "",
    skills: [],
    ...over,
  };
}

describe("buildHrImportPreview — diff classification", () => {
  it("classifies new-employee, changed, unchanged, re-hire, terminating, missing-from-file", () => {
    const employees: Employee[] = [
      makeEmployee({
        localNumber: "P-CHANGED",
        puCode: "PL01NC04",
        gradeCode: "B2",
        firstName: "Anna",
        lastName: "Adamska",
      }),
      makeEmployee({
        localNumber: "P-UNCHANGED",
        puCode: "PL01NC05",
        firstName: "Bartosz",
        lastName: "Bednarek",
        fteCapacity: 1,
        gradeCode: "C1",
        jobFunction: "CSS",
        locationCode: "WRO",
        startDate: "2023-05-01",
      }),
      makeEmployee({
        localNumber: "P-REHIRE",
        puCode: "PL01NC04",
        gradeCode: "B2",
        firstName: "Cezary",
        lastName: "Cichy",
        endDate: "2025-09-30",
      }),
      makeEmployee({
        localNumber: "P-TERMINATING",
        puCode: "PL01NC04",
        gradeCode: "B2",
        firstName: "Dorota",
        lastName: "Dabrowska",
      }),
      makeEmployee({ localNumber: "P-MISSING", puCode: "PL01NC04" }),
    ];

    const rows: HrParsedRow[] = [
      // CHANGED — gradeCode differs.
      makeParsedRow("P-CHANGED", {
        firstName: "Anna",
        lastName: "Adamska",
        puCode: "PL01NC04",
        gradeCode: "C1",
        jobFunction: "CSS",
        locationCode: "WRO",
        startDate: "2024-01-01",
        fteCapacity: 1,
      }),
      // UNCHANGED — every mapped field matches.
      makeParsedRow("P-UNCHANGED", {
        firstName: "Bartosz",
        lastName: "Bednarek",
        puCode: "PL01NC05",
        gradeCode: "C1",
        jobFunction: "CSS",
        locationCode: "WRO",
        startDate: "2023-05-01",
        fteCapacity: 1,
      }),
      // RE-HIRE — past endDate AND joinerYes.
      makeParsedRow(
        "P-REHIRE",
        {
          firstName: "Cezary",
          lastName: "Cichy",
          puCode: "PL01NC04",
          gradeCode: "B2",
          jobFunction: "CSS",
          locationCode: "WRO",
          startDate: "2026-04-01",
          fteCapacity: 1,
          endDate: null,
        },
        { joinerYes: true },
      ),
      // TERMINATING — termination falls within fileMonth.
      makeParsedRow(
        "P-TERMINATING",
        {
          firstName: "Dorota",
          lastName: "Dabrowska",
          puCode: "PL01NC04",
          gradeCode: "B2",
          jobFunction: "CSS",
          locationCode: "WRO",
          startDate: "2024-01-01",
          fteCapacity: 1,
          endDate: "2026-04-30",
        },
        { leaverYes: true, dateOfTermination: "2026-04-30" },
      ),
      // NEW — not in store.
      makeParsedRow(
        "P-NEW",
        {
          firstName: "Ewa",
          lastName: "Edelman",
          puCode: "PL01NC05",
          gradeCode: "B2",
          jobFunction: "CSS",
          locationCode: "WRO",
          startDate: "2026-04-15",
          fteCapacity: 1,
        },
        { joinerYes: true },
      ),
    ];

    const preview = buildHrImportPreview(makeParseResult(rows), employees);

    const kindOf = (ln: string) => preview.diffs.find((d) => d.localNumber === ln)?.diffKind;
    expect(kindOf("P-NEW")).toBe("new-employee");
    expect(kindOf("P-CHANGED")).toBe("changed");
    expect(kindOf("P-UNCHANGED")).toBe("unchanged");
    expect(kindOf("P-REHIRE")).toBe("re-hire");
    expect(kindOf("P-TERMINATING")).toBe("terminating");
    expect(kindOf("P-MISSING")).toBe("missing-from-file");

    expect(preview.counts).toMatchObject({
      new: 1,
      changed: 1,
      unchanged: 1,
      rehires: 1,
      terminating: 1,
      missingFromFile: 1,
    });

    // Joiner is set for new-employee (joinerYes) AND re-hire.
    expect(preview.counts.joiners).toBe(2);
    // Leaver only on terminating row.
    expect(preview.counts.leavers).toBe(1);
  });

  it("missing-from-file excludes employees whose endDate is in the past", () => {
    const employees: Employee[] = [
      makeEmployee({ localNumber: "P-LEFT", endDate: "2025-12-31" }),
      makeEmployee({ localNumber: "P-ACTIVE" }),
    ];
    const preview = buildHrImportPreview(makeParseResult([]), employees);
    const missing = preview.diffs.filter((d) => d.diffKind === "missing-from-file");
    expect(missing.map((m) => m.localNumber)).toEqual(["P-ACTIVE"]);
  });

  it("re-hire requires both a past endDate AND hired YES", () => {
    const employees: Employee[] = [
      makeEmployee({ localNumber: "P1", endDate: "2025-09-30" }),
    ];
    // Past endDate but joinerYes = false → not a re-hire.
    const rows = [
      makeParsedRow(
        "P1",
        {
          firstName: "First",
          lastName: "Last",
          puCode: "PL01NC04",
          gradeCode: "B2",
          jobFunction: "CSS",
          locationCode: "WRO",
          startDate: "2024-01-01",
          fteCapacity: 1,
          endDate: "2025-09-30",
        },
        { joinerYes: false },
      ),
    ];
    const preview = buildHrImportPreview(makeParseResult(rows), employees);
    expect(preview.diffs[0].diffKind).not.toBe("re-hire");
  });

  it("terminating only fires when termination month equals fileMonth", () => {
    const employees: Employee[] = [makeEmployee({ localNumber: "P1" })];
    const earlyRow = makeParsedRow(
      "P1",
      {
        firstName: "First",
        lastName: "Last",
        puCode: "PL01NC04",
        gradeCode: "B2",
        jobFunction: "CSS",
        locationCode: "WRO",
        startDate: "2024-01-01",
        fteCapacity: 1,
        endDate: "2026-03-15",
      },
      { leaverYes: true, dateOfTermination: "2026-03-15" },
    );
    const preview = buildHrImportPreview(makeParseResult([earlyRow]), employees);
    // dateOfTermination 2026-03 != fileMonth 2026-04 → NOT terminating.
    expect(preview.diffs[0].diffKind).not.toBe("terminating");
    expect(preview.diffs[0].willCreateLeaver).toBe(false);
  });

  it("never includes user-managed fields in fieldDiffs", () => {
    const employees: Employee[] = [
      makeEmployee({
        localNumber: "P1",
        capabilities: ["java"],
        germanSpeaker: true,
        clearanceLevel: "SU1",
        ggid: "GGID-OLD",
      }),
    ];
    // The HR file would never carry capabilities / germanSpeaker / etc. — but
    // even if a parsed row somehow did, the diff must skip them.
    const row = makeParsedRow(
      "P1",
      {
        firstName: "First",
        lastName: "Last",
        puCode: "PL01NC04",
        gradeCode: "B2",
        jobFunction: "CSS",
        locationCode: "WRO",
        startDate: "2024-01-01",
        fteCapacity: 1,
      },
    );
    // Sneak some user-managed values into the parsed employee shape.
    (row.employee as Partial<Employee>).capabilities = ["java", "kafka"];
    (row.employee as Partial<Employee>).germanSpeaker = false;
    (row.employee as Partial<Employee>).clearanceLevel = "SU2";
    (row.employee as Partial<Employee>).ggid = "GGID-NEW";

    const preview = buildHrImportPreview(makeParseResult([row]), employees);
    const diff = preview.diffs[0];
    const fields = diff.fieldDiffs.map((f) => f.field);
    expect(fields).not.toContain("capabilities");
    expect(fields).not.toContain("germanSpeaker");
    expect(fields).not.toContain("clearanceLevel");
    expect(fields).not.toContain("ggid");
  });

  it("string comparison ignores whitespace and treats '' equal to undefined", () => {
    const employees: Employee[] = [
      makeEmployee({
        localNumber: "P1",
        firstName: "Jan",
        lastName: "Kowalski",
        puCode: "PL01NC04",
        gradeCode: "B2",
        jobFunction: "CSS",
        locationCode: "WRO",
        startDate: "2024-01-01",
      }),
    ];
    const row = makeParsedRow("P1", {
      firstName: " Jan ", // padded whitespace
      lastName: "Kowalski",
      puCode: "PL01NC04",
      gradeCode: "B2",
      jobFunction: "CSS",
      locationCode: "WRO",
      startDate: "2024-01-01",
      fteCapacity: 1,
      // email is not provided in the file (undefined) but the existing employee
      // also lacks one — should NOT show up as a diff.
    });
    const preview = buildHrImportPreview(makeParseResult([row]), employees);
    expect(preview.diffs[0].diffKind).toBe("unchanged");
  });

  it("rejected rows are returned separately and never appear in diffs", () => {
    const employees: Employee[] = [makeEmployee({ localNumber: "P1" })];
    const reject = makeParsedRow(
      "P1",
      {
        firstName: "First",
        lastName: "Last",
        puCode: "PL01NC04",
        gradeCode: "B2",
        jobFunction: "CSS",
        locationCode: "WRO",
        startDate: "2024-01-01",
        fteCapacity: 1,
      },
      {
        rowErrors: [{ code: "R06", message: "leaver=YES + empty termination" }],
      },
    );
    const preview = buildHrImportPreview(makeParseResult([reject]), employees);
    expect(preview.diffs.find((d) => d.diffKind !== "missing-from-file")).toBeUndefined();
    expect(preview.rejectedRows).toHaveLength(1);
    // P1 is now missing-from-file because its row was rejected.
    expect(preview.diffs.find((d) => d.localNumber === "P1")?.diffKind).toBe("missing-from-file");
  });

  it("fteCapacity uses ±0.001 tolerance", () => {
    const employees: Employee[] = [
      makeEmployee({ localNumber: "P1", fteCapacity: 0.8 }),
    ];
    const row = makeParsedRow("P1", {
      firstName: "First",
      lastName: "Last",
      puCode: "PL01NC04",
      gradeCode: "B2",
      jobFunction: "CSS",
      locationCode: "WRO",
      startDate: "2024-01-01",
      fteCapacity: 0.8005, // within tolerance
    });
    const preview = buildHrImportPreview(makeParseResult([row]), employees);
    expect(preview.diffs[0].diffKind).toBe("unchanged");
  });
});
