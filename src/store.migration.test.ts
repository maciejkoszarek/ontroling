import { beforeEach, describe, expect, it } from "vitest";
import { migrateFromLegacyLocalStorage, migratePersistedState } from "./store";
import type { Employee } from "./types";

function v2State() {
  const employees: Employee[] = [
    {
      localNumber: "P0000001",
      firstName: "Pre",
      lastName: "Existing",
      displayName: "Pre Existing",
      puCode: "PL01NC03",
      gradeCode: "B2",
      jobFunction: "CSS",
      locationCode: "WRO",
      startDate: "2020-01-01",
      fteCapacity: 1,
      engagement: "UoP",
      skills: [],
    },
  ];
  return {
    employees,
    forecastCells: [],
    audit: [],
    capabilities: [],
    projects: [
      {
        projectNumber: "PRJ-1",
        name: "Pre-existing",
        customer: "Acme",
        marketUnit: "MU1",
        kind: "project",
        isBillable: true,
        status: "active",
        tags: [],
      },
    ],
    workingCalendar: [{ period: "2024-01", workingDays: 21, workingHours: 168 }],
    cycles: [],
    activeCycleId: "fc-2026-04",
    previousCycleId: "fc-2026-03",
    filter: {},
    theme: "light" as const,
    density: "comfortable" as const,
    role: "controller",
    lockedSnapshots: {},
    comments: [],
    scenarios: [],
    joiners: [],
    leavers: [],
    transfers: [],
    gfsHours: [],
  };
}

describe("store — v2 → v3 persistence migration", () => {
  it("adds empty hrMappings and hrImports and leaves existing slices intact", () => {
    const v2 = v2State();
    const employeesRef = v2.employees;
    const projectsRef = v2.projects;
    const workingCalRef = v2.workingCalendar;

    const migrated = migratePersistedState(v2, 2) as unknown as Record<string, unknown>;

    // New slices appear, empty.
    expect(migrated.hrMappings).toEqual([]);
    expect(migrated.hrImports).toEqual([]);

    // Existing slices are byte-for-byte the same content.
    expect(migrated.employees).toBe(employeesRef);
    expect(migrated.projects).toBe(projectsRef);
    expect(migrated.workingCalendar).toBe(workingCalRef);
    expect((migrated.employees as Employee[])[0].localNumber).toBe("P0000001");
  });

  it("migrating from v0/v1 still applies the v2 fixes and adds v3 hr* slices", () => {
    const v1 = {
      ...v2State(),
      workingCalendar: [],
      projects: [{ projectNumber: "PRJ-1", name: "X", customer: "Y", marketUnit: "MU1", isBillable: true, status: "active", tags: [] }],
    };

    const migrated = migratePersistedState(v1, 1) as unknown as Record<string, unknown>;

    // v2 path: workingCalendar reseeded (non-empty), projects gain a `kind` default.
    expect(Array.isArray(migrated.workingCalendar)).toBe(true);
    expect((migrated.workingCalendar as unknown[]).length).toBeGreaterThan(0);
    const firstProj = (migrated.projects as Array<Record<string, unknown>>)[0];
    expect(firstProj.kind).toBe("project");

    // v3 path: hr* slices present.
    expect(migrated.hrMappings).toEqual([]);
    expect(migrated.hrImports).toEqual([]);
  });

  it("returns input unchanged for non-object persisted payloads", () => {
    expect(migratePersistedState(null, 2)).toBeNull();
    expect(migratePersistedState(undefined, 2)).toBeUndefined();
  });
});

describe("store — migrateFromLegacyLocalStorage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("reads a v2 envelope from localStorage, migrates it, and removes the legacy key", () => {
    const v2 = v2State();
    localStorage.setItem(
      "cca-practiceview-v2",
      JSON.stringify({ state: v2, version: 2 }),
    );

    const migrated = migrateFromLegacyLocalStorage() as unknown as Record<string, unknown>;
    expect(migrated).not.toBeNull();
    expect(migrated.hrMappings).toEqual([]);
    expect(migrated.hrImports).toEqual([]);
    // The unique pre-existing employee survives untouched.
    expect((migrated.employees as Employee[])[0].localNumber).toBe("P0000001");
    // Legacy key removed so we never double-read on subsequent boots.
    expect(localStorage.getItem("cca-practiceview-v2")).toBeNull();
  });

  it("returns null and leaves the legacy key alone when JSON is corrupt", () => {
    localStorage.setItem("cca-practiceview-v2", "{ this is not :: valid json");
    expect(migrateFromLegacyLocalStorage()).toBeNull();
    // Corrupt blob is left in place — caller falls back to initialState seed.
    expect(localStorage.getItem("cca-practiceview-v2")).toBe("{ this is not :: valid json");
  });

  it("returns null when no legacy key exists", () => {
    expect(migrateFromLegacyLocalStorage()).toBeNull();
  });

  it("returns null and leaves the key when envelope is missing `state`", () => {
    localStorage.setItem("cca-practiceview-v2", JSON.stringify({ version: 2 }));
    expect(migrateFromLegacyLocalStorage()).toBeNull();
    expect(localStorage.getItem("cca-practiceview-v2")).toBeTruthy();
  });
});
