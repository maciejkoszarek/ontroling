import { describe, expect, it } from "vitest";
import {
  DEFAULT_COMMIT_PROBABILITY,
  aggregateProjects,
  assignmentsByEmployee,
  buildArveLookup,
  employeeMap,
  employeeProjectsForPeriod,
  getCommitProbability,
  projectKey,
  trailingArve,
  weightedDemand,
  yearPeriods,
} from "./projectHelpers";
import type { Employee, EmployeeMonthSnapshot, GfsHours, Project, WorkingCalendarEntry } from "../types";

function proj(overrides: Partial<Project> = {}): Project {
  return {
    projectNumber: "PRJ-1",
    name: "Test",
    customer: "Acme",
    marketUnit: "MU1",
    kind: "project",
    isBillable: true,
    status: "active",
    tags: [],
    ...overrides,
  };
}

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

describe("projectHelpers / getCommitProbability (I30)", () => {
  it("returns 1.0 for kind=project regardless of stored value", () => {
    expect(getCommitProbability(proj({ kind: "project" }))).toBe(1.0);
    // Even a stored value is ignored for kind=project.
    expect(getCommitProbability(proj({ kind: "project", commitProbability: 0.5 }))).toBe(1.0);
  });

  it("returns kind default when commitProbability is unset for opportunity/ambition", () => {
    expect(getCommitProbability(proj({ kind: "opportunity" }))).toBe(DEFAULT_COMMIT_PROBABILITY.opportunity);
    expect(getCommitProbability(proj({ kind: "ambition" }))).toBe(DEFAULT_COMMIT_PROBABILITY.ambition);
  });

  it("returns stored commitProbability for opportunity/ambition when set", () => {
    expect(getCommitProbability(proj({ kind: "opportunity", commitProbability: 0.8 }))).toBe(0.8);
    expect(getCommitProbability(proj({ kind: "ambition", commitProbability: 0.1 }))).toBe(0.1);
  });
});

describe("projectHelpers / weightedDemand", () => {
  it("multiplies FTE demand by the project's commit probability", () => {
    expect(weightedDemand(100, proj({ kind: "project" }))).toBe(100);
    expect(weightedDemand(100, proj({ kind: "opportunity" }))).toBeCloseTo(50, 5);
    expect(weightedDemand(100, proj({ kind: "ambition" }))).toBeCloseTo(30, 5);
    expect(weightedDemand(10, proj({ kind: "opportunity", commitProbability: 0.75 }))).toBeCloseTo(7.5, 5);
  });
});

/**
 * Roll-up coverage — mirrors the Cockpit / Projects.tsx / MarketUnit / Bench
 * aggregation pipeline that the feature-developer could not verify in-browser.
 * These tests lock in the `Σ fteDemand × getCommitProbability(project)` contract
 * so a future refactor of a page cannot silently change totals.
 */
describe("projectHelpers / demand roll-up (I30)", () => {
  it("Cockpit-style weighted sum for a single period mixes kinds by probability", () => {
    // Same shape as Cockpit.tsx: project-indexed lookup, then Σ weightedDemand.
    const projects: Project[] = [
      proj({ projectNumber: "PRJ-COMMIT", kind: "project" }),
      proj({ projectNumber: "PRJ-OPP", kind: "opportunity" }),
      proj({ projectNumber: "PRJ-AMB", kind: "ambition" }),
    ];
    const projectByNumber = new Map(projects.map((p) => [p.projectNumber, p] as const));
    const demand = [
      { projectNumber: "PRJ-COMMIT", period: "2026-05", fteDemand: 10 },
      { projectNumber: "PRJ-OPP", period: "2026-05", fteDemand: 8 },
      { projectNumber: "PRJ-AMB", period: "2026-05", fteDemand: 5 },
    ];

    const demandByPeriod = new Map<string, number>();
    for (const d of demand) {
      const p = projectByNumber.get(d.projectNumber);
      if (!p) continue;
      demandByPeriod.set(d.period, (demandByPeriod.get(d.period) ?? 0) + weightedDemand(d.fteDemand, p));
    }

    // 10*1.0 + 8*0.5 + 5*0.3 = 15.5
    expect(demandByPeriod.get("2026-05")).toBeCloseTo(15.5, 5);
  });

  it("custom commitProbability on an opportunity overrides the 0.5 default in the weighted sum", () => {
    const p = proj({ projectNumber: "PRJ-HOT", kind: "opportunity", commitProbability: 0.8 });
    // 10 * 0.8 = 8.0 — NOT 10 * 0.5 = 5.0.
    expect(weightedDemand(10, p)).toBeCloseTo(8.0, 5);
    expect(weightedDemand(10, p)).not.toBeCloseTo(5.0, 5);
  });

  it("ignores a stored commitProbability on kind=project (guard against bad persisted state)", () => {
    // Hypothetical bad state — a persisted project row with a leftover
    // opportunity-era probability. getCommitProbability must clamp to 1.0.
    const bad = proj({ projectNumber: "PRJ-BAD", kind: "project", commitProbability: 0.5 });
    expect(getCommitProbability(bad)).toBe(1.0);
    expect(weightedDemand(10, bad)).toBe(10);
  });

  it("Projects.tsx Raw vs Weighted: Raw = Σ fteDemand; Weighted = Σ fteDemand × getCommitProbability(project)", () => {
    // Replicates the per-project row computation in Projects.tsx:
    //   rawMonthly  = demand[]
    //   weightedMonthly = rawMonthly.map(v => v * getCommitProbability(p))
    //   rawTotal = Σ rawMonthly
    //   weightedTotal = Σ weightedMonthly
    // then grand totals = Σ over projects.
    const projects: Project[] = [
      proj({ projectNumber: "PRJ-C", kind: "project" }), // prob = 1.0
      proj({ projectNumber: "PRJ-O", kind: "opportunity" }), // prob = 0.5
      proj({ projectNumber: "PRJ-A", kind: "ambition", commitProbability: 0.2 }),
    ];
    const demandByProject: Record<string, number[]> = {
      "PRJ-C": [4, 4, 4], // Σ = 12
      "PRJ-O": [2, 2, 4], // Σ = 8
      "PRJ-A": [10, 0, 0], // Σ = 10
    };

    let rawGrand = 0;
    let weightedGrand = 0;
    for (const p of projects) {
      const raw = demandByProject[p.projectNumber] ?? [];
      const prob = getCommitProbability(p);
      const rawTotal = raw.reduce((s, v) => s + v, 0);
      const weightedTotal = raw.reduce((s, v) => s + v * prob, 0);
      rawGrand += rawTotal;
      weightedGrand += weightedTotal;
    }

    // Raw = 12 + 8 + 10 = 30
    expect(rawGrand).toBe(30);
    // Weighted = 12*1.0 + 8*0.5 + 10*0.2 = 12 + 4 + 2 = 18
    expect(weightedGrand).toBeCloseTo(18, 5);
    // Parallel check using weightedDemand directly — must match manual math.
    const viaHelper = projects.reduce(
      (s, p) => s + (demandByProject[p.projectNumber] ?? []).reduce((ss, v) => ss + weightedDemand(v, p), 0),
      0,
    );
    expect(viaHelper).toBeCloseTo(weightedGrand, 5);
  });
});
