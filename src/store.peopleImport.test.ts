import { beforeEach, describe, expect, it } from "vitest";
import { useAppStore } from "./store";
import type { Employee, EmployeeMonthSnapshot, GfsHours, Joiner, Leaver, Project } from "./types";

function reset() {
  localStorage.clear();
  useAppStore.setState({ role: "controller" });
}

function emp(localNumber: string, overrides: Partial<Employee> = {}): Employee {
  return {
    localNumber,
    firstName: "First",
    lastName: "Last",
    displayName: "First Last",
    puCode: "PL01NC05",
    gradeCode: "B2",
    jobFunction: "CSS",
    locationCode: "WRO",
    startDate: "2025-01-01",
    fteCapacity: 1,
    engagement: "PL01NC05",
    skills: [],
    ...overrides,
  };
}

function snap(localNumber: string, period: string): EmployeeMonthSnapshot {
  return {
    employeeLocalNumber: localNumber,
    period,
    puCode: "PL01NC05",
    gradeCode: "B2",
    fteAssigned: 1,
    bfte: 0,
    arve: 0,
    projectHours: 0,
    vacationHours: 0,
    learningHours: 0,
    managementHours: 0,
    isJoiner: false,
    isLeaver: false,
    isMover: false,
  };
}

describe("store.replacePeopleAndPruneProjects", () => {
  beforeEach(reset);

  it("replaces employees, filters gfsHours, and removes orphan projects", () => {
    const survivor: Project = {
      projectNumber: "PRJ-KEEP",
      name: "Keep me",
      customer: "Acme",
      marketUnit: "MU-CHE",
      kind: "project",
      isBillable: true,
      status: "active",
      tags: [],
    };
    const orphan: Project = {
      projectNumber: "PRJ-ORPHAN",
      name: "Orphan",
      customer: "Old Co.",
      marketUnit: "MU-CHE",
      kind: "project",
      isBillable: true,
      status: "active",
      tags: [],
    };
    const gfsRows: GfsHours[] = [
      { employeeLocalNumber: "P1", period: "2026-02", projectNumber: "PRJ-KEEP", projectType: "DEL", hours: 100 },
      { employeeLocalNumber: "GHOST", period: "2026-02", projectNumber: "PRJ-ORPHAN", projectType: "DEL", hours: 80 },
    ];
    useAppStore.setState({
      projects: [survivor, orphan],
      employees: [emp("P1"), emp("GHOST", { localNumber: "GHOST" })],
      gfsHours: gfsRows,
      projectDemand: [],
      transfers: [],
      contractOfMandate: [],
    });

    const newEmployees = [emp("P1"), emp("P2", { localNumber: "P2" })];
    const newSnapshots = [snap("P1", "2026-02"), snap("P2", "2026-02")];
    const newJoiners: Joiner[] = [];
    const newLeavers: Leaver[] = [];

    const result = useAppStore.getState().replacePeopleAndPruneProjects({
      employees: newEmployees,
      snapshots: newSnapshots,
      joiners: newJoiners,
      leavers: newLeavers,
      fileName: "people.xlsx",
    });

    expect(result.employeesAfter).toBe(2);
    expect(result.gfsHoursAfter).toBe(1);
    expect(result.projectsAfter).toBe(1);
    expect(result.removedProjectNumbers).toEqual(["PRJ-ORPHAN"]);

    const s = useAppStore.getState();
    expect(s.employees.map((e) => e.localNumber).sort()).toEqual(["P1", "P2"]);
    expect(s.gfsHours).toHaveLength(1);
    expect(s.gfsHours[0].employeeLocalNumber).toBe("P1");
    expect(s.projects.map((p) => p.projectNumber)).toEqual(["PRJ-KEEP"]);
    expect(s.snapshots).toEqual(newSnapshots);
    expect(s.audit[0].entityType).toBe("import");
  });

  it("keeps a project that is referenced only by projectDemand even if no gfsHours rows survive", () => {
    const proj: Project = {
      projectNumber: "PRJ-DEMAND",
      name: "Demand-only",
      customer: "Acme",
      marketUnit: "MU-CHE",
      kind: "opportunity",
      isBillable: true,
      status: "active",
      tags: [],
    };
    useAppStore.setState({
      projects: [proj],
      employees: [emp("OLD", { localNumber: "OLD" })],
      gfsHours: [
        { employeeLocalNumber: "OLD", period: "2026-02", projectNumber: "PRJ-DEMAND", projectType: "DEL", hours: 100 },
      ],
      projectDemand: [{ projectNumber: "PRJ-DEMAND", period: "2026-04", fteDemand: 2 }],
    });

    const result = useAppStore.getState().replacePeopleAndPruneProjects({
      employees: [emp("NEW", { localNumber: "NEW" })],
      snapshots: [snap("NEW", "2026-02")],
      joiners: [],
      leavers: [],
      fileName: "people.xlsx",
    });

    expect(result.removedProjectNumbers).toEqual([]);
    expect(useAppStore.getState().projects).toHaveLength(1);
    expect(useAppStore.getState().gfsHours).toHaveLength(0);
  });
});
