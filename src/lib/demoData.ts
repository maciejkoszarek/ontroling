// Deterministic seed data that mirrors the CCA_PracticeView workbook structure.
// Everything is generated from a small set of constants + pseudo-random noise so the
// numbers roll up coherently across the app.

import {
  type Anomaly,
  type BudgetCell,
  type Comment,
  type ContractOfMandate,
  type DQCheckResult,
  type Employee,
  type EmployeeMonthSnapshot,
  type ForecastCell,
  type ForecastCycle,
  type ForecastMetric,
  type GfsHours,
  type Grade,
  type Joiner,
  type Leaver,
  type Location,
  type MarketUnit,
  type PipelineOpportunity,
  type ProductionUnit,
  type Project,
  type ProjectDemandForecast,
  type Scenario,
} from "../types";
import { realEmployees, realGfsHours, realMarketUnits, realProjects } from "./realData";
import { periodAdd, periodRange, seededRandom, uid } from "./utils";

// ---------- dimensions ----------

export const productionUnits: ProductionUnit[] = [
  { code: "PL01NC01", shortName: "CCA_Head", displayName: "CCA Head", sbu: "GDC PL ABL", bu: "CCA", sortOrder: 10, active: true },
  { code: "PL01NC08", shortName: "CCA_Cloud_Native", displayName: "Cloud Native", sbu: "GDC PL ABL", bu: "CCA", sortOrder: 20, active: true },
  { code: "PL01NC09", shortName: "CCA_Complex_Transformation", displayName: "Complex Transformation", sbu: "GDC PL ABL", bu: "CCA", sortOrder: 30, active: true },
  { code: "PL01NC03", shortName: "CCA_SE1", displayName: "CCA Developers 1", sbu: "GDC PL ABL", bu: "CCA", sortOrder: 40, active: true, parentCode: "CCA_SE_TOTAL" },
  { code: "PL01NC04", shortName: "CCA_SE2", displayName: "CCA Developers 2", sbu: "GDC PL ABL", bu: "CCA", sortOrder: 50, active: true, parentCode: "CCA_SE_TOTAL" },
  { code: "PL01NC05", shortName: "CCA_SE3", displayName: "CCA Developers 3", sbu: "GDC PL ABL", bu: "CCA", sortOrder: 60, active: true, parentCode: "CCA_SE_TOTAL" },
  { code: "PL01NC06", shortName: "CCA_SE4", displayName: "CCA Developers 4", sbu: "GDC PL ABL", bu: "CCA", sortOrder: 70, active: true, parentCode: "CCA_SE_TOTAL" },
  { code: "PL01NC07", shortName: "CCA_SE5", displayName: "CCA Developers 5", sbu: "GDC PL ABL", bu: "CCA", sortOrder: 80, active: true, parentCode: "CCA_SE_TOTAL" },
  { code: "CCA_SE_TOTAL", shortName: "CCA_SE_Total", displayName: "SE Total (roll-up)", sbu: "GDC PL ABL", bu: "CCA", sortOrder: 85, active: true, isVirtual: true },
  { code: "PL01NC10", shortName: "CCA_EEC", displayName: "Engineering Excellence Center", sbu: "GDC PL ABL", bu: "CCA", sortOrder: 90, active: true },
  { code: "CCA_TOTAL", shortName: "CCA_Total", displayName: "CCA Total", sbu: "GDC PL ABL", bu: "CCA", sortOrder: 100, active: true, isVirtual: true },
];

export const leafPuCodes = productionUnits.filter((p) => !p.isVirtual).map((p) => p.code);
export const sePuCodes = ["PL01NC03", "PL01NC04", "PL01NC05", "PL01NC06", "PL01NC07"];

export const marketUnits: MarketUnit[] = realMarketUnits;

export const locations: Location[] = [
  { code: "WRO", displayName: "Wrocław – Business Garden K", country: "PL" },
  { code: "POZ", displayName: "Poznań – Business Garden", country: "PL" },
  { code: "GDN", displayName: "Gdańsk – Olivia", country: "PL" },
  { code: "WAW", displayName: "Warszawa – Business Garden", country: "PL" },
  { code: "KRK", displayName: "Kraków – High5", country: "PL" },
  { code: "REMOTE", displayName: "Remote PL", country: "PL" },
];

export const grades: Grade[] = [
  { code: "A5", family: "intern", sortOrder: 5, isContractor: false },
  { code: "B1", family: "dev", sortOrder: 10, isContractor: false },
  { code: "B2", family: "dev", sortOrder: 20, isContractor: false },
  { code: "C1", family: "senior", sortOrder: 30, isContractor: false },
  { code: "C2", family: "senior", sortOrder: 40, isContractor: false },
  { code: "D1", family: "management", sortOrder: 50, isContractor: false },
  { code: "NG", family: "dev", sortOrder: 60, isContractor: false },
  { code: "Z", family: "contractor", sortOrder: 70, isContractor: true },
];

// ---------- periods ----------

export const startPeriod = "2024-01";
export const endPeriod = "2027-12";
export const allPeriods = periodRange(startPeriod, endPeriod);

// DEMO_ANCHOR_PERIOD is the "as of" point for the seeded demo dataset — snapshots exist
// up to and including this period, forecasts cover the 12 months after it. It is NOT
// "today". For "today" use `DEMO_ANCHOR_PERIOD()` from `./utils`.
export const DEMO_ANCHOR_PERIOD = "2026-03";
export const DEMO_NEXT_PERIOD = periodAdd(DEMO_ANCHOR_PERIOD, 1); // "2026-04"

// rolling 24 months around the demo anchor (12 months of actuals + 12 months forecast)
export const rollingFrom = periodAdd(DEMO_ANCHOR_PERIOD, -11);
export const rollingTo = periodAdd(DEMO_ANCHOR_PERIOD, 12);
export const rollingPeriods = periodRange(rollingFrom, rollingTo);

export function isActualPeriod(p: string): boolean {
  return p <= DEMO_ANCHOR_PERIOD;
}

// ---------- vacation phasing (from ADMIN sheet) ----------

export const vacationPhasing: Record<string, number> = {
  "01": 0.04, "02": 0.04, "03": 0.05,
  "04": 0.06, "05": 0.08, "06": 0.10,
  "07": 0.15, "08": 0.15, "09": 0.10,
  "10": 0.07, "11": 0.08, "12": 0.08,
};

export function vacationPhasingFor(period: string): number {
  return vacationPhasing[period.slice(5, 7)] ?? 0.08;
}

// ---------- cycles ----------

export const forecastCycles: ForecastCycle[] = [
  {
    id: "fc-2026-04",
    label: "FC April 2026",
    periodOpened: "2026-04",
    status: "editing",
    openedBy: "Maciej Koszarek",
    openedAt: "2026-04-02T08:00:00Z",
    prevCycleId: "fc-2026-03",
  },
  {
    id: "fc-2026-03",
    label: "FC March 2026",
    periodOpened: "2026-03",
    status: "locked",
    openedBy: "Maciej Koszarek",
    openedAt: "2026-03-02T08:00:00Z",
    lockedBy: "Maciej Koszarek",
    lockedAt: "2026-03-14T12:00:00Z",
    prevCycleId: "fc-2026-02",
  },
  {
    id: "fc-2026-02",
    label: "FC February 2026",
    periodOpened: "2026-02",
    status: "locked",
    openedBy: "Maciej Koszarek",
    openedAt: "2026-02-02T08:00:00Z",
    lockedBy: "Maciej Koszarek",
    lockedAt: "2026-02-13T12:00:00Z",
    prevCycleId: "fc-2026-01",
  },
  {
    id: "fc-2026-01",
    label: "FC January 2026",
    periodOpened: "2026-01",
    status: "archived",
    openedBy: "Maciej Koszarek",
    openedAt: "2026-01-02T08:00:00Z",
    lockedBy: "Maciej Koszarek",
    lockedAt: "2026-01-15T12:00:00Z",
    archivedBy: "Maciej Koszarek",
    archivedAt: "2026-02-01T00:00:00Z",
  },
];

// ---------- employees ----------

const firstNames = [
  "Jan", "Piotr", "Anna", "Maria", "Tomasz", "Katarzyna", "Michał", "Agnieszka", "Paweł", "Ewa",
  "Marcin", "Magdalena", "Łukasz", "Joanna", "Krzysztof", "Karolina", "Adam", "Natalia", "Grzegorz", "Aleksandra",
  "Bartosz", "Kinga", "Dawid", "Monika", "Rafał", "Beata", "Mateusz", "Urszula", "Kamil", "Iwona",
];
const lastNames = [
  "Kowalski", "Nowak", "Wiśniewski", "Wójcik", "Kowalczyk", "Kamiński", "Lewandowski", "Zieliński",
  "Szymański", "Woźniak", "Dąbrowski", "Kozłowski", "Mazur", "Kwiatkowski", "Krawczyk", "Piotrowski",
  "Grabowski", "Nowakowski", "Pawłowski", "Michalski", "Król", "Jankowski", "Wojciechowski", "Kubiak",
  "Wieczorek", "Jabłoński", "Wróbel", "Majewski", "Olszewski", "Stępień",
];

// Real employees sourced from ForecastProjectsCCACoreApps_2026.xlsx
export const employees: Employee[] = realEmployees;

// Headcount distribution per PU derived from real data.
const hcPerPu: Record<string, number> = employees.reduce<Record<string, number>>((acc, e) => {
  acc[e.puCode] = (acc[e.puCode] ?? 0) + 1;
  return acc;
}, {});

function pick<T>(rnd: () => number, arr: T[]): T {
  return arr[Math.floor(rnd() * arr.length)];
}

// ---------- employee month snapshots ----------

export function generateSnapshots(emps: Employee[]): EmployeeMonthSnapshot[] {
  const rnd = seededRandom("cca-snap-v1");
  const out: EmployeeMonthSnapshot[] = [];
  for (const e of emps) {
    const empStart = e.startDate.slice(0, 7);
    for (const p of rollingPeriods) {
      if (p < empStart) continue;
      if (p > DEMO_ANCHOR_PERIOD) continue; // snapshots only for actuals
      const arve = 0.55 + rnd() * 0.45; // 0.55 .. 1.0
      const bfte = Math.max(0, Math.min(1, arve)) * 0.95;
      out.push({
        employeeLocalNumber: e.localNumber,
        period: p,
        puCode: e.puCode,
        gradeCode: e.gradeCode,
        fteAssigned: 1.0,
        bfte,
        arve,
        projectHours: arve * 150,
        vacationHours: vacationPhasingFor(p) * 160,
        learningHours: rnd() * 10,
        managementHours: e.gradeCode === "D1" ? 40 : rnd() * 8,
        isJoiner: p === empStart,
        isLeaver: false,
        isMover: false,
      });
    }
  }
  return out;
}

export const snapshots = generateSnapshots(employees);

// ---------- joiners & leavers ----------

export function generateJoiners(emps: Employee[]): Joiner[] {
  const rnd = seededRandom("cca-join-v1");
  const out: Joiner[] = [];
  // actual joiners from employee start dates in rolling period
  for (const e of emps) {
    const period = e.startDate.slice(0, 7);
    if (period >= rollingFrom && period <= DEMO_ANCHOR_PERIOD) {
      out.push({
        id: uid("j-"),
        employeeLocalNumber: e.localNumber,
        firstName: e.firstName,
        lastName: e.lastName,
        puCode: e.puCode,
        gradeCode: e.gradeCode,
        locationCode: e.locationCode,
        role: e.gradeCode === "D1" ? "Manager" : e.gradeCode.startsWith("C") ? "Senior Engineer" : "Engineer",
        startDate: e.startDate,
        source: pick(rnd, ["ATS", "ATS", "HR", "referral"]) as Joiner["source"],
        status: "actual",
      });
    }
  }
  // planned joiners in the next 6 months
  for (const pu of leafPuCodes) {
    const base = (hcPerPu[pu] ?? 0) * 0.04;
    for (let m = 1; m <= 6; m++) {
      const count = Math.max(0, Math.round(base + rnd() * 2 - 0.5));
      const period = periodAdd(DEMO_ANCHOR_PERIOD, m);
      for (let i = 0; i < count; i++) {
        out.push({
          id: uid("j-"),
          firstName: pick(rnd, firstNames),
          lastName: pick(rnd, lastNames),
          puCode: pu,
          gradeCode: pick(rnd, ["A5", "B1", "B2", "C1"]),
          locationCode: pick(rnd, locations).code,
          role: "Engineer",
          startDate: `${period}-01`,
          source: "pipeline",
          status: "planned",
        });
      }
    }
  }
  return out;
}

export const joiners = generateJoiners(employees);

export function generateLeavers(emps: Employee[]): Leaver[] {
  const rnd = seededRandom("cca-leav-v1");
  const out: Leaver[] = [];
  // simulate ~6% annual attrition across rolling window
  const count = Math.round(emps.length * 0.06);
  for (let i = 0; i < count; i++) {
    const e = emps[Math.floor(rnd() * emps.length)];
    const monthsAgo = Math.floor(rnd() * 14);
    const endDate = periodAdd(DEMO_ANCHOR_PERIOD, -monthsAgo) + "-15";
    out.push({
      id: uid("l-"),
      employeeLocalNumber: e.localNumber,
      firstName: e.firstName,
      lastName: e.lastName,
      puCode: e.puCode,
      gradeCode: e.gradeCode,
      startDate: e.startDate,
      endDate,
      reason: pick(rnd, ["voluntary", "voluntary", "voluntary", "involuntary", "contract_end"]) as Leaver["reason"],
      engagement: e.engagement,
    });
  }
  return out;
}

export const leavers = generateLeavers(employees);

// ---------- contract of mandate (Z-grade contractors) ----------

export function generateContractOfMandate(): ContractOfMandate[] {
  const rnd = seededRandom("cca-uz-v1");
  const out: ContractOfMandate[] = [];
  const uzCount = 18;
  for (let i = 0; i < uzCount; i++) {
    const localNumber = `UZ-${String(4000 + i)}`;
    const pu = pick(rnd, leafPuCodes);
    const loc = pick(rnd, locations).code;
    for (const p of rollingPeriods) {
      if (p > DEMO_ANCHOR_PERIOD) continue;
      out.push({ employeeLocalNumber: localNumber, period: p, puCode: pu, locationCode: loc, active: rnd() > 0.15 });
    }
  }
  return out;
}

export const contractOfMandate = generateContractOfMandate();

// ---------- projects & GFS hours ----------
// Projects and assignments sourced from ForecastProjectsCCACoreApps_2026.xlsx.
// Vacation hours synthesized from ADMIN vacation phasing since the source workbook
// does not include time-off data.

export function classifyProject(name: string): { kind: Project["kind"]; name: string } {
  const oppsMatch = name.match(/^(.*?)[\s\-–—]*\bopps?\.?\s*$/i);
  if (oppsMatch) return { kind: "opportunity", name: oppsMatch[1].trim().replace(/[\s\-–—]+$/, "") };
  const ambMatch = name.match(/^(.*?)[\s\-–—]*\bamb(?:ition)?\.?\s*$/i);
  if (ambMatch) return { kind: "ambition", name: ambMatch[1].trim().replace(/[\s\-–—]+$/, "") };
  return { kind: "project", name };
}

export const projects: Project[] = realProjects.map((p) => {
  const classified = classifyProject(p.name);
  return { ...p, name: classified.name, kind: classified.kind };
});

export const gfsHours: GfsHours[] = (() => {
  const out: GfsHours[] = [...realGfsHours];
  // Augment real billable/non-billable hours with synthesized vacation phasing so
  // bFTE / ARVE math continues to reconcile.
  const employeePeriods = new Set<string>();
  for (const g of realGfsHours) {
    employeePeriods.add(`${g.employeeLocalNumber}::${g.period}`);
  }
  for (const key of employeePeriods) {
    const [emp, period] = key.split("::");
    const vacHours = Math.round(160 * vacationPhasingFor(period));
    if (vacHours > 0) {
      out.push({
        employeeLocalNumber: emp,
        period,
        projectNumber: "_VACATION_",
        projectType: "Vacation",
        hours: vacHours,
      });
    }
  }
  return out;
})();

// ---------- PU month aggregates ----------

export interface PuMonthAggregate {
  puCode: string;
  period: string;
  hc: number;
  fte: number;
  bfte: number;
  arve: number;
  joiners: number;
  leavers: number;
}

export function aggregateSnapshots(snaps: EmployeeMonthSnapshot[]): PuMonthAggregate[] {
  const byKey = new Map<string, PuMonthAggregate>();
  for (const s of snaps) {
    const k = `${s.puCode}::${s.period}`;
    let agg = byKey.get(k);
    if (!agg) {
      agg = { puCode: s.puCode, period: s.period, hc: 0, fte: 0, bfte: 0, arve: 0, joiners: 0, leavers: 0 };
      byKey.set(k, agg);
    }
    agg.hc += 1;
    agg.fte += s.fteAssigned;
    agg.bfte += s.bfte;
    agg.arve += s.arve;
    if (s.isJoiner) agg.joiners += 1;
    if (s.isLeaver) agg.leavers += 1;
  }
  // avg ARVE = sum/hc
  for (const agg of byKey.values()) agg.arve = agg.hc === 0 ? 0 : agg.arve / agg.hc;
  return Array.from(byKey.values());
}

export const puAggregates = aggregateSnapshots(snapshots);

function aggLookup(map: Map<string, PuMonthAggregate>, puCode: string, period: string): PuMonthAggregate | undefined {
  return map.get(`${puCode}::${period}`);
}

export const puAggMap: Map<string, PuMonthAggregate> = new Map(puAggregates.map((a) => [`${a.puCode}::${a.period}`, a]));

// ---------- forecast cells ----------

function baselineForecastValue(
  puCode: string,
  period: string,
  metric: ForecastMetric,
  rnd: () => number,
): number {
  const base = aggLookup(puAggMap, puCode, DEMO_ANCHOR_PERIOD);
  const baseHc = base?.hc ?? hcPerPu[puCode] ?? 0;
  const baseFte = base?.fte ?? baseHc;
  const baseBfte = base?.bfte ?? baseFte * 0.85;
  const baseArve = base?.arve ?? 0.8;
  const monthsAhead = Math.max(0, periodToIndex(period) - periodToIndex(DEMO_ANCHOR_PERIOD));
  const growth = 1 + monthsAhead * 0.004 + (rnd() - 0.5) * 0.01;
  const fteNow = baseFte * growth;
  const vacShare = vacationPhasingFor(period);
  switch (metric) {
    case "HC_BEGIN":
      return baseHc * growth;
    case "HC_END":
      return baseHc * growth + (rnd() > 0.5 ? 1 : -1);
    case "JOINERS":
      return Math.max(0, Math.round(baseHc * 0.03 + rnd() * 2 - 1));
    case "LEAVERS":
      return Math.max(0, Math.round(baseHc * 0.005 + rnd() * 1));
    case "FTE":
      return fteNow;
    case "BFTE":
      return baseBfte * growth * (1 - vacShare * 0.5);
    case "F1":
      return fteNow * 0.55;
    case "F2":
      return fteNow * 0.30;
    case "F_TOTAL":
      return fteNow * 0.85;
    case "ARVE_PCT":
      return Math.max(0.5, Math.min(1.05, baseArve + (rnd() - 0.5) * 0.08));
    // Overlays
    case "FTE_LOST":
      return fteNow * (0.005 + rnd() * 0.005);
    case "OVERTIME_FTE":
      return fteNow * (0.01 + rnd() * 0.01);
    case "UNPAID_LEAVE_FTE":
      return fteNow * (0.003 + rnd() * 0.004);
    case "VACATION_FTE":
      return fteNow * vacShare;
    case "SICKNESS_FTE":
      return fteNow * (0.02 + rnd() * 0.015);
    case "FTE_CSS":
      return fteNow * (0.97 + (rnd() - 0.5) * 0.01);
    case "ARVE_BASE":
      return fteNow * (0.97 - vacShare) * (1 + (rnd() - 0.5) * 0.01);
    // IDC breakdown — proportions of FTE_CSS
    case "BENCH_FTE":
      return fteNow * (0.05 + rnd() * 0.04); // 5–9% bench
    case "LND_FTE":
      return fteNow * (0.02 + rnd() * 0.015); // L&D ~2–3.5%
    case "RECRUITMENT_FTE":
      return fteNow * (0.005 + rnd() * 0.008);
    case "MAN_FTE":
      return fteNow * (0.03 + rnd() * 0.02); // management reserve
    case "RESERVE_FTE":
      return fteNow * (0.005 + rnd() * 0.01);
    case "BDC_SOLD_FTE":
      return fteNow * (0.04 + rnd() * 0.03);
    case "BDC_PL_FTE":
      return fteNow * (0.02 + rnd() * 0.02);
    case "INTERNAL_PROJECTS_FTE":
      return fteNow * (0.01 + rnd() * 0.015);
    case "STUDENTS_HC":
      return Math.max(0, Math.round(baseHc * (0.04 + rnd() * 0.03))); // ~4–7% of HC
    case "BENCH_PCT":
      return 0.05 + rnd() * 0.04;
    case "LND_PCT":
      return 0.02 + rnd() * 0.015;
    case "VACATION_PCT":
      return vacShare;
    case "ARVI_PCT":
      return Math.max(0.55, Math.min(1, baseArve * 0.96 + (rnd() - 0.5) * 0.05));
  }
}

function periodToIndex(p: string): number {
  const [y, m] = p.split("-").map(Number);
  return y * 12 + (m - 1);
}

/**
 * Grade-level split used for seeding. Shares sum to ~1; ARVE biases reflect typical
 * utilization patterns (interns low, seniors/managers lower than mid-level devs,
 * contractors billed near 100%).
 */
const gradeMix: Array<{ grade: string; share: number; arve: number }> = [
  { grade: "A5", share: 0.05, arve: 0.70 },
  { grade: "B1", share: 0.20, arve: 0.90 },
  { grade: "B2", share: 0.20, arve: 0.88 },
  { grade: "C1", share: 0.22, arve: 0.82 },
  { grade: "C2", share: 0.15, arve: 0.75 },
  { grade: "D1", share: 0.05, arve: 0.55 },
  { grade: "NG", share: 0.08, arve: 0.85 },
  { grade: "Z", share: 0.05, arve: 0.95 },
];

export function generateForecastCells(): ForecastCell[] {
  const rnd = seededRandom("cca-forecast-v1");
  const out: ForecastCell[] = [];
  const metrics: ForecastMetric[] = [
    "HC_BEGIN", "HC_END", "JOINERS", "LEAVERS",
    "FTE", "BFTE", "F1", "F2", "F_TOTAL", "ARVE_PCT",
    "FTE_LOST", "OVERTIME_FTE", "UNPAID_LEAVE_FTE", "VACATION_FTE", "SICKNESS_FTE",
    "FTE_CSS", "ARVE_BASE",
    "BENCH_FTE", "LND_FTE", "RECRUITMENT_FTE", "MAN_FTE", "RESERVE_FTE",
    "BDC_SOLD_FTE", "BDC_PL_FTE", "INTERNAL_PROJECTS_FTE",
    "STUDENTS_HC",
    "BENCH_PCT", "LND_PCT", "VACATION_PCT", "ARVI_PCT",
  ];
  const gradeMetrics: ForecastMetric[] = ["HC_END", "FTE", "BFTE", "ARVE_PCT"];
  for (const cycle of forecastCycles) {
    for (const pu of leafPuCodes) {
      for (const p of rollingPeriods) {
        const ageMonths = periodToIndex(DEMO_ANCHOR_PERIOD) - periodToIndex(cycle.periodOpened);
        const noise = 1 + ageMonths * 0.01 * (rnd() - 0.5);
        const aggregates: Partial<Record<ForecastMetric, number>> = {};
        for (const metric of metrics) {
          const v = baselineForecastValue(pu, p, metric, rnd);
          const value = Math.round(v * noise * 100) / 100;
          aggregates[metric] = value;
          out.push({
            cycleId: cycle.id,
            puCode: pu,
            period: p,
            metric,
            value,
            source: "seed",
            enteredBy: "system",
            enteredAt: "2026-04-01T00:00:00Z",
          });
        }
        for (const metric of gradeMetrics) {
          const agg = aggregates[metric] ?? 0;
          for (const g of gradeMix) {
            const jitter = 1 + (rnd() - 0.5) * 0.06;
            const value =
              metric === "ARVE_PCT"
                ? Math.max(0.45, Math.min(1.05, g.arve * jitter))
                : Math.round(agg * g.share * jitter * 100) / 100;
            out.push({
              cycleId: cycle.id,
              puCode: pu,
              period: p,
              metric,
              grade: g.grade,
              value: Math.round(value * 100) / 100,
              source: "seed",
              enteredBy: "system",
              enteredAt: "2026-04-01T00:00:00Z",
            });
          }
        }
      }
    }
  }
  return out;
}

export const forecastCells = generateForecastCells();

// ---------- budget ----------

export function generateBudget(): BudgetCell[] {
  const rnd = seededRandom("cca-budget-v1");
  const out: BudgetCell[] = [];
  const metrics: ForecastMetric[] = ["FTE", "BFTE", "HC_END", "F_TOTAL"];
  for (const pu of leafPuCodes) {
    for (const p of rollingPeriods) {
      if (!p.startsWith("2026") && !p.startsWith("2027")) continue;
      const year = Number(p.slice(0, 4));
      for (const metric of metrics) {
        const v = baselineForecastValue(pu, p, metric, rnd) * (1 + (rnd() - 0.5) * 0.03);
        out.push({ year, puCode: pu, period: p, metric, value: Math.round(v * 100) / 100 });
      }
    }
  }
  return out;
}

export const budget = generateBudget();

// ---------- pipeline & demand ----------

export function generatePipeline(): PipelineOpportunity[] {
  const rnd = seededRandom("cca-pipe-v1");
  const out: PipelineOpportunity[] = [];
  const oppNames = [
    "ABB Cloud Foundation Phase 2",
    "BMW — North America Expansion",
    "Vodafone — RAN OSS",
    "Allianz — Data Platform",
    "UBS — Wealth Platform",
    "PGE — Customer Digital",
    "Carrefour — Marketplace",
    "DT — BSS Modernization v2",
    "Siemens — IoT Cloud",
    "Orlen — ESG Reporting",
    "Audi — Over-the-Air Updates",
    "VW — Fleet Management",
  ];
  const mus = marketUnits.filter((m) => !["OTHER", "GDC", "IDC"].includes(m.code)).map((m) => m.code);
  for (let i = 0; i < oppNames.length; i++) {
    const mu = pick(rnd, mus);
    const startOffset = 1 + Math.floor(rnd() * 6);
    const p = periodAdd(DEMO_ANCHOR_PERIOD, startOffset);
    const prob = 0.2 + rnd() * 0.7;
    const fte = 4 + Math.floor(rnd() * 20);
    out.push({
      id: uid("opp-"),
      name: oppNames[i],
      marketUnit: mu,
      period: p,
      fteDemand: fte,
      winProbability: Math.round(prob * 100) / 100,
      weightedFte: Math.round(fte * prob * 10) / 10,
      owner: "Sales",
      status: pick(rnd, ["lead", "qualified", "qualified", "proposal", "proposal"]) as PipelineOpportunity["status"],
    });
  }
  return out;
}

export const pipeline = generatePipeline();

export function generateProjectDemand(): ProjectDemandForecast[] {
  // Aggregate real GFS hours by project × period and convert to FTE demand.
  // For future months beyond the source data, hold the latest observed demand flat.
  const HOURS_PER_FTE = 160;
  const byKey = new Map<string, number>();
  for (const g of realGfsHours) {
    if (g.projectNumber.startsWith("_")) continue;
    const k = `${g.projectNumber}::${g.period}`;
    byKey.set(k, (byKey.get(k) ?? 0) + g.hours);
  }
  const out: ProjectDemandForecast[] = [];
  const latestByProject = new Map<string, { period: string; fte: number }>();
  for (const [k, hours] of byKey.entries()) {
    const [projectNumber, period] = k.split("::");
    const fte = Math.round((hours / HOURS_PER_FTE) * 10) / 10;
    out.push({ projectNumber, period, fteDemand: fte });
    const latest = latestByProject.get(projectNumber);
    if (!latest || period > latest.period) {
      latestByProject.set(projectNumber, { period, fte });
    }
  }
  // Extend forward into rolling forecast window where no data exists.
  const seen = new Set(Array.from(byKey.keys()));
  for (const proj of projects) {
    const latest = latestByProject.get(proj.projectNumber);
    if (!latest) continue;
    for (const p of rollingPeriods) {
      if (p <= latest.period) continue;
      if (seen.has(`${proj.projectNumber}::${p}`)) continue;
      out.push({ projectNumber: proj.projectNumber, period: p, fteDemand: latest.fte });
    }
  }
  return out;
}

export const projectDemand = generateProjectDemand();

// ---------- comments ----------

export const comments: Comment[] = [
  {
    id: "c1",
    entityType: "pu",
    entityId: "PL01NC04",
    period: DEMO_ANCHOR_PERIOD,
    body: "**SE2** up +4 FTE vs previous FC — 2 new joiners confirmed for ABB and Daimler ramps.",
    author: "Maciej Koszarek",
    mentions: [],
    createdAt: "2026-04-03T09:12:00Z",
  },
  {
    id: "c2",
    entityType: "pu",
    entityId: "PL01NC08",
    period: DEMO_ANCHOR_PERIOD,
    body: "Cloud Native ARVE drifting — 3 people on bench since February. Need to align with Sales on the ABB pipeline case.",
    author: "Maciej Koszarek",
    mentions: ["sales"],
    createdAt: "2026-04-03T10:30:00Z",
  },
  {
    id: "c3",
    entityType: "pu",
    entityId: "PL01NC09",
    period: DEMO_ANCHOR_PERIOD,
    body: "Complex Transformation: 2 leavers in May, backfill already in Joiners_DB pipeline.",
    author: "PU Lead – Complex Transformation",
    mentions: [],
    createdAt: "2026-04-02T16:40:00Z",
  },
  {
    id: "c4",
    entityType: "cycle",
    entityId: "fc-2026-04",
    period: DEMO_ANCHOR_PERIOD,
    body: "Cycle **FC April 2026** opened. Please submit PU-level forecasts by **April 12**.",
    author: "Maciej Koszarek",
    mentions: ["all-pu-leads"],
    createdAt: "2026-04-01T08:00:00Z",
  },
];

// ---------- anomalies ----------

export const anomalies: Anomaly[] = [
  {
    id: uid("a-"),
    period: DEMO_ANCHOR_PERIOD,
    scope: "pu",
    scopeId: "PL01NC08",
    kind: "arve_drift",
    severity: "warning",
    message: "Cloud Native ARVE −6.2pp vs. trailing 3m baseline",
  },
  {
    id: uid("a-"),
    period: DEMO_ANCHOR_PERIOD,
    scope: "pu",
    scopeId: "PL01NC06",
    kind: "hc_jump",
    severity: "info",
    message: "SE4 HC +8 vs. last month — onboarding wave for VW ramp-up",
  },
  {
    id: uid("a-"),
    period: DEMO_ANCHOR_PERIOD,
    scope: "pu",
    scopeId: "PL01NC09",
    kind: "bfte_gap",
    severity: "warning",
    message: "Complex Transformation bFTE 4.2 below supply — check project staffing",
  },
];

// ---------- data-quality checks ----------

export const dqChecks: DQCheckResult[] = [
  {
    id: "dq-1",
    name: "HR FTE balance",
    description: "Sum of HR FTE per PU equals previous month ± joiners − leavers (±1 FTE).",
    severity: "critical",
    status: "pass",
  },
  {
    id: "dq-2",
    name: "GFS hours cap",
    description: "Σ GFS hours per employee ≤ working_days × 8 × 1.2.",
    severity: "critical",
    status: "pass",
  },
  {
    id: "dq-3",
    name: "GFS ↔ HR employee match",
    description: "Every employee in GFS_DB exists in HR_DB for the same month.",
    severity: "warning",
    status: "fail",
    failingRows: [
      { employee: "P0029142", month: DEMO_ANCHOR_PERIOD, reason: "in GFS, not in HR" },
      { employee: "P0029188", month: DEMO_ANCHOR_PERIOD, reason: "in GFS, not in HR" },
    ],
  },
  {
    id: "dq-4",
    name: "PU uniqueness",
    description: "No employee in two PUs in the same month.",
    severity: "critical",
    status: "pass",
  },
  {
    id: "dq-5",
    name: "Joiners match",
    description: "Joiners list and HR_DB joiners agree.",
    severity: "warning",
    status: "pass",
  },
  {
    id: "dq-6",
    name: "Leavers match",
    description: "Leavers list and HR_DB termination dates agree.",
    severity: "warning",
    status: "pass",
  },
  {
    id: "dq-7",
    name: "Engagement → PU parse",
    description: "HR_DB Engagement field parses to a known PU code.",
    severity: "info",
    status: "pass",
  },
];

// ---------- scenarios ----------

export const scenarios: Scenario[] = [
  {
    id: "sc-hiring-push",
    name: "+15 Java devs (SE1 + SE2)",
    description: "Accelerate SE1 & SE2 hiring by 15 FTE over Q2 to cover ABB + Daimler ramps.",
    baseCycleId: "fc-2026-04",
    owner: "Maciej Koszarek",
    status: "draft",
    createdAt: "2026-04-05T09:00:00Z",
    changes: [
      { id: uid("sc-"), type: "add_joiner", payload: { puCode: "PL01NC03", count: 7, grade: "B2" }, effectivePeriod: "2026-05" },
      { id: uid("sc-"), type: "add_joiner", payload: { puCode: "PL01NC04", count: 8, grade: "B2" }, effectivePeriod: "2026-06" },
    ],
  },
  {
    id: "sc-cost-freeze",
    name: "Headcount freeze (except backfill)",
    description: "Replace leavers 1-for-1, cancel all other hiring until margin > 22%.",
    baseCycleId: "fc-2026-04",
    owner: "Finance partner",
    status: "shared",
    createdAt: "2026-04-04T15:00:00Z",
    changes: [
      { id: uid("sc-"), type: "headcount_delta", payload: { puCode: "CCA_TOTAL", delta: -12 }, effectivePeriod: "2026-06" },
    ],
  },
];

// ---------- export aggregated / convenience ----------

export const puByCode: Map<string, ProductionUnit> = new Map(productionUnits.map((p) => [p.code, p]));
export const muByCode: Map<string, MarketUnit> = new Map(marketUnits.map((m) => [m.code, m]));
export const locByCode: Map<string, Location> = new Map(locations.map((l) => [l.code, l]));
export const projByNumber: Map<string, Project> = new Map(projects.map((p) => [p.projectNumber, p]));

export function puLabel(code: string): string {
  return puByCode.get(code)?.shortName ?? code;
}
export function puDisplay(code: string): string {
  return puByCode.get(code)?.displayName ?? code;
}
