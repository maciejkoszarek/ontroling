import { describe, expect, it } from "vitest";
import {
  aggregateProjects,
  assignmentsByEmployee,
  buildArveLookup,
  employeeMap,
  employeeProjectsForPeriod,
  projectKey,
  trailingArve,
  yearPeriods,
} from "./projectHelpers";
import type { Employee, EmployeeMonthSnapshot, GfsHours, WorkingCalendarEntry } from "../types";

function emp(overrides: Partial<Employee> = {}): Employee {
  return {
    localNumber: "P001",
    firstName: "A",
    lastName: "B",
    displayName: "A B",
    puCode: "PU1",
    gradeCode: "C1",
    jobFunction: "CSS",
    locationCode: "WRO",
    startDate: "2024-01-01",
    fteCapacity: 1,
    engagement: "perm",
    skills: [],
    ...overrides,
  };
}

function snap(overrides: Partial<EmployeeMonthSnapshot> = {}): EmployeeMonthSnapshot {
  return {
    employeeLocalNumber: "P001",
    period: "2026-04",
    puCode: "PU1",
    fte: 1,
    bfte: 0.8,
    arve: 0.85,
    locationCode: "WRO",
    gradeCode: "C1",
    ...overrides,
  } as EmployeeMonthSnapshot;
}

function gfs(overrides: Partial<GfsHours> = {}): GfsHours {
  return {
    employeeLocalNumber: "P001",
    projectNumber: "PRJ-1",
    period: "2026-04",
    hours: 80,
    projectType: "External Services",
    ...overrides,
  } as GfsHours;
}

const CAL: WorkingCalendarEntry[] = [
  { period: "2026-04", workingDays: 20, workingHours: 160 },
  { period: "2026-05", workingDays: 20, workingHours: 160 },
];

describe("projectHelpers / projectKey", () => {
  it("joins projectNumber and period with '::'", () => {
    expect(projectKey("PRJ-1", "2026-04")).toBe("PRJ-1::2026-04");
  });
});

describe("projectHelpers / yearPeriods", () => {
  it("returns 12 periods January → December", () => {
    const p = yearPeriods(2026);
    expect(p).toHaveLength(12);
    expect(p[0]).toBe("2026-01");
    expect(p[11]).toBe("2026-12");
  });
});

describe("projectHelpers / buildArveLookup", () => {
  it("returns the exact snapshot arve when the (employee, period) key matches", () => {
    const lookup = buildArveLookup([snap({ arve: 0.9 })]);
    expect(lookup.get("P001", "2026-04")).toBe(0.9);
  });

  it("falls back to the employee's historical average when no exact-period snapshot exists", () => {
    const lookup = buildArveLookup([
      snap({ period: "2026-03", arve: 0.8 }),
      snap({ period: "2026-04", arve: 0.9 }),
    ]);
    expect(lookup.get("P001", "2026-07")).toBeCloseTo(0.85, 5);
  });

  it("returns the sentinel default 0.8 when the employee has no snapshots", () => {
    const lookup = buildArveLookup([]);
    expect(lookup.get("Pghost", "2026-04")).toBe(0.8);
  });
});

describe("projectHelpers / aggregateProjects", () => {
  it("aggregates GFS rows into projectNumber::period buckets with FTE derived from working-calendar hours", () => {
    const agg = aggregateProjects(
      [gfs({ hours: 80 }), gfs({ employeeLocalNumber: "P002", hours: 40 })],
      [snap({ arve: 0.9 }), snap({ employeeLocalNumber: "P002", arve: 0.5 })],
      CAL,
    );
    const row = agg.get("PRJ-1::2026-04");
    expect(row).toBeDefined();
    expect(row?.totalHours).toBe(120);
    expect(row?.fte).toBeCloseTo(120 / 160, 5);
    // Hours-weighted ARVE: (0.9*80 + 0.5*40) / 120 = (72 + 20) / 120 = 0.7666…
    expect(row?.arve).toBeCloseTo((0.9 * 80 + 0.5 * 40) / 120, 5);
    expect(row?.people.sort()).toEqual(["P001", "P002"]);
  });

  it("skips internal projects (underscore-prefixed) and zero-hour rows", () => {
    const agg = aggregateProjects(
      [
        gfs({ projectNumber: "_vacation", hours: 40 }),
        gfs({ projectNumber: "PRJ-1", hours: 0 }),
        gfs({ projectNumber: "PRJ-1", hours: 80 }),
      ],
      [snap({ arve: 0.85 })],
      CAL,
    );
    expect(agg.has("_vacation::2026-04")).toBe(false);
    expect(agg.get("PRJ-1::2026-04")?.totalHours).toBe(80);
  });
});

describe("projectHelpers / assignmentsByEmployee", () => {
  it("groups GFS rows by employee and skips internal / zero-hour rows", () => {
    const grouped = assignmentsByEmployee([
      gfs({ projectNumber: "PRJ-1", hours: 40 }),
      gfs({ projectNumber: "PRJ-2", hours: 40 }),
      gfs({ projectNumber: "_vac", hours: 40 }),
      gfs({ projectNumber: "PRJ-3", hours: 0 }),
    ]);
    const rows = grouped.get("P001") ?? [];
    expect(rows.map((r) => r.projectNumber).sort()).toEqual(["PRJ-1", "PRJ-2"]);
  });
});

describe("projectHelpers / employeeProjectsForPeriod", () => {
  it("narrows to a single (employee, period) and filters internal / zero-hour rows", () => {
    const rows = employeeProjectsForPeriod("P001", "2026-04", [
      gfs({ projectNumber: "PRJ-1", hours: 40 }),
      gfs({ projectNumber: "PRJ-2", period: "2026-05", hours: 40 }),
      gfs({ projectNumber: "_vac", hours: 40 }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].projectNumber).toBe("PRJ-1");
  });
});

describe("projectHelpers / trailingArve", () => {
  it("averages the trailing N months up to and including the target period", () => {
    const snaps = [
      snap({ period: "2026-01", arve: 0.6 }),
      snap({ period: "2026-02", arve: 0.7 }),
      snap({ period: "2026-03", arve: 0.8 }),
      snap({ period: "2026-04", arve: 0.9 }),
    ];
    expect(trailingArve("P001", "2026-04", snaps, 3)).toBeCloseTo((0.7 + 0.8 + 0.9) / 3, 5);
  });

  it("returns 0 when the employee has no snapshots at or before the target period", () => {
    expect(trailingArve("P001", "2025-12", [snap({ period: "2026-04" })], 3)).toBe(0);
  });
});

describe("projectHelpers / employeeMap", () => {
  it("builds a localNumber → Employee lookup", () => {
    const m = employeeMap([emp({ localNumber: "P001" }), emp({ localNumber: "P002" })]);
    expect(m.size).toBe(2);
    expect(m.get("P001")?.localNumber).toBe("P001");
  });
});
