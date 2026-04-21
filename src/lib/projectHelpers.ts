import type { Employee, EmployeeMonthSnapshot, GfsHours } from "../types";

export interface ProjectMonthAgg {
  projectNumber: string;
  period: string;
  totalHours: number;
  fte: number;
  arve: number;
  people: string[];
  peopleHours: Map<string, number>;
}

const HOURS_PER_FTE = 160;

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
): Map<string, ProjectMonthAgg> {
  const arve = buildArveLookup(snapshots);
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
    out.set(k, {
      projectNumber: a.projectNumber,
      period: a.period,
      totalHours: a.totalHours,
      fte: a.totalHours / HOURS_PER_FTE,
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

export function year2026Periods(): string[] {
  return ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12"];
}

export function employeeMap(employees: Employee[]): Map<string, Employee> {
  return new Map(employees.map((e) => [e.localNumber, e]));
}
