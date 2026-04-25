import type { Employee, EmployeeMonthSnapshot, GfsHours, Period, Project, ProjectKind, WorkingCalendarEntry } from "../types";
import { hoursForPeriod, indexWorkingCalendar } from "./workingCalendar";

/**
 * Default commit probability per project kind. `project` is always committed
 * (1.0); `opportunity` / `ambition` are editable pipeline estimates. I30.
 */
export const DEFAULT_COMMIT_PROBABILITY: Record<ProjectKind, number> = {
  project: 1.0,
  opportunity: 0.5,
  ambition: 0.3,
};

/**
 * Resolve the effective commit probability for a project. Kind `project` is
 * always 1.0 regardless of a stored value (committed engagements). For
 * `opportunity` / `ambition`, a stored value wins; otherwise fall back to the
 * kind default. I30.
 */
export function getCommitProbability(p: Project): number {
  if (p.kind === "project") return 1.0;
  return p.commitProbability ?? DEFAULT_COMMIT_PROBABILITY[p.kind];
}

/** Weighted FTE demand: `fteDemand × getCommitProbability(p)`. */
export function weightedDemand(fteDemand: number, p: Project): number {
  return fteDemand * getCommitProbability(p);
}

export interface ProjectMonthAgg {
  projectNumber: string;
  period: string;
  totalHours: number;
  fte: number;
  arve: number;
  people: string[];
  peopleHours: Map<string, number>;
}

export function buildArveLookup(snapshots: EmployeeMonthSnapshot[]) {
  const byKey = new Map<string, number>();
  const empSum = new Map<string, number>();
  const empCount = new Map<string, number>();
  for (const s of snapshots) {
    byKey.set(`${s.employeeLocalNumber}::${s.period}`, s.arve);
    empSum.set(s.employeeLocalNumber, (empSum.get(s.employeeLocalNumber) ?? 0) + s.arve);
    empCount.set(s.employeeLocalNumber, (empCount.get(s.employeeLocalNumber) ?? 0) + 1);
  }
  return {
    get(employeeLocalNumber: string, period: string): number {
      const exact = byKey.get(`${employeeLocalNumber}::${period}`);
      if (exact !== undefined) return exact;
      const c = empCount.get(employeeLocalNumber) ?? 0;
      if (c === 0) return 0.8;
      return (empSum.get(employeeLocalNumber) ?? 0) / c;
    },
  };
}

export function aggregateProjects(
  gfsHours: GfsHours[],
  snapshots: EmployeeMonthSnapshot[],
  workingCalendar: ReadonlyArray<WorkingCalendarEntry> = [],
): Map<string, ProjectMonthAgg> {
  const arve = buildArveLookup(snapshots);
  const calIdx = indexWorkingCalendar(workingCalendar);
  const scratch = new Map<string, ProjectMonthAgg & { arveNum: number; arveDen: number }>();
  for (const g of gfsHours) {
    if (g.projectNumber.startsWith("_")) continue;
    if (g.hours <= 0) continue;
    const k = `${g.projectNumber}::${g.period}`;
    let a = scratch.get(k);
    if (!a) {
      a = {
        projectNumber: g.projectNumber,
        period: g.period,
        totalHours: 0,
        fte: 0,
        arve: 0,
        people: [],
        peopleHours: new Map<string, number>(),
        arveNum: 0,
        arveDen: 0,
      };
      scratch.set(k, a);
    }
    a.totalHours += g.hours;
    a.peopleHours.set(g.employeeLocalNumber, (a.peopleHours.get(g.employeeLocalNumber) ?? 0) + g.hours);
    const empArve = arve.get(g.employeeLocalNumber, g.period);
    a.arveNum += empArve * g.hours;
    a.arveDen += g.hours;
  }
  const out = new Map<string, ProjectMonthAgg>();
  for (const [k, a] of scratch.entries()) {
    const fullHours = hoursForPeriod(calIdx, a.period);
    out.set(k, {
      projectNumber: a.projectNumber,
      period: a.period,
      totalHours: a.totalHours,
      fte: fullHours > 0 ? a.totalHours / fullHours : 0,
      arve: a.arveDen > 0 ? a.arveNum / a.arveDen : 0,
      people: Array.from(a.peopleHours.keys()),
      peopleHours: a.peopleHours,
    });
  }
  return out;
}

export function projectKey(projectNumber: string, period: string): string {
  return `${projectNumber}::${period}`;
}

export interface EmployeeProjectAssignment {
  employeeLocalNumber: string;
  period: string;
  projectNumber: string;
  hours: number;
}

export function assignmentsByEmployee(gfsHours: GfsHours[]): Map<string, EmployeeProjectAssignment[]> {
  const m = new Map<string, EmployeeProjectAssignment[]>();
  for (const g of gfsHours) {
    if (g.projectNumber.startsWith("_")) continue;
    if (g.hours <= 0) continue;
    const list = m.get(g.employeeLocalNumber) ?? [];
    list.push({
      employeeLocalNumber: g.employeeLocalNumber,
      period: g.period,
      projectNumber: g.projectNumber,
      hours: g.hours,
    });
    m.set(g.employeeLocalNumber, list);
  }
  return m;
}

export function employeeProjectsForPeriod(
  employeeLocalNumber: string,
  period: string,
  gfsHours: GfsHours[],
): EmployeeProjectAssignment[] {
  return gfsHours
    .filter((g) => g.employeeLocalNumber === employeeLocalNumber && g.period === period && !g.projectNumber.startsWith("_") && g.hours > 0)
    .map((g) => ({
      employeeLocalNumber: g.employeeLocalNumber,
      period: g.period,
      projectNumber: g.projectNumber,
      hours: g.hours,
    }));
}

export function trailingArve(employeeLocalNumber: string, endPeriod: string, snapshots: EmployeeMonthSnapshot[], months = 3): number {
  const rows = snapshots
    .filter((s) => s.employeeLocalNumber === employeeLocalNumber && s.period <= endPeriod)
    .slice(-months);
  if (rows.length === 0) return 0;
  return rows.reduce((a, b) => a + b.arve, 0) / rows.length;
}

export function yearPeriods(year: number): Period[] {
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
}

export function employeeMap(employees: Employee[]): Map<string, Employee> {
  return new Map(employees.map((e) => [e.localNumber, e]));
}
