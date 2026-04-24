import type {
  BudgetCell,
  ForecastCell,
  ForecastCycle,
  ForecastMetric,
  Period,
} from "../types";
import { leafPuCodes, sePuCodes } from "./demoData";

/**
 * Merge live forecast cells with frozen locked-cycle snapshots. For any cycle
 * that is `locked` or `archived`, the snapshot entry (if present) replaces the
 * live cells for that cycleId — live writes after lock are ignored.
 */
export function effectiveCells(
  live: ForecastCell[],
  snapshots: Record<string, ForecastCell[]>,
  cycles: ForecastCycle[],
): ForecastCell[] {
  const frozen = new Set<string>();
  for (const c of cycles) {
    if ((c.status === "locked" || c.status === "archived") && snapshots[c.id]?.length) {
      frozen.add(c.id);
    }
  }
  if (frozen.size === 0) return live;
  const out: ForecastCell[] = [];
  for (const c of live) {
    if (!frozen.has(c.cycleId)) out.push(c);
  }
  for (const id of frozen) {
    for (const c of snapshots[id]) out.push(c);
  }
  return out;
}

// Forecast selection / aggregation helpers. All data operations are pure so they
// can be reused in both the UI layer and the (future) backend.

export function selectForecast(
  cells: ForecastCell[],
  cycleId: string,
  puCode: string,
  metric: ForecastMetric,
): Map<Period, ForecastCell> {
  const out = new Map<Period, ForecastCell>();
  for (const c of cells) {
    if (c.grade || c.mu) continue;
    if (c.cycleId === cycleId && c.puCode === puCode && c.metric === metric) {
      out.set(c.period, c);
    }
  }
  return out;
}

export function rollUp(
  cells: ForecastCell[],
  cycleId: string,
  metric: ForecastMetric,
  period: Period,
  puCodes: string[],
): number {
  let sum = 0;
  for (const c of cells) {
    if (c.grade || c.mu) continue;
    if (
      c.cycleId === cycleId &&
      c.metric === metric &&
      c.period === period &&
      puCodes.includes(c.puCode)
    ) {
      sum += c.value;
    }
  }
  return sum;
}

/**
 * Compute an effective value for a (cycle, puCode, period, metric). If the PU is
 * a virtual roll-up (CCA_TOTAL or CCA_SE_TOTAL), the function recursively
 * aggregates the children. For ARVE_PCT the roll-up is a weighted average by FTE.
 */
const PCT_METRICS: ForecastMetric[] = ["ARVE_PCT", "ARVI_PCT", "BENCH_PCT", "LND_PCT", "VACATION_PCT"];

/**
 * Metrics that must be non-negative (headcount counts and FTE volumes).
 * Counts and capacities never go below 0 in the domain model.
 */
const NON_NEGATIVE_METRICS: ReadonlySet<ForecastMetric> = new Set<ForecastMetric>([
  "HC_BEGIN",
  "HC_END",
  "JOINERS",
  "LEAVERS",
  "FTE",
  "BFTE",
  "F1",
  "F2",
  "F_TOTAL",
  "FTE_LOST",
  "OVERTIME_FTE",
  "UNPAID_LEAVE_FTE",
  "VACATION_FTE",
  "SICKNESS_FTE",
  "FTE_CSS",
  "ARVE_BASE",
  "BENCH_FTE",
  "LND_FTE",
  "RECRUITMENT_FTE",
  "MAN_FTE",
  "RESERVE_FTE",
  "BDC_SOLD_FTE",
  "BDC_PL_FTE",
  "INTERNAL_PROJECTS_FTE",
  "STUDENTS_HC",
]);

export interface ValidationResult {
  value: number;
  clamped: boolean;
  reason?: string;
}

/**
 * Clamp a forecast value to its domain range. Returns the clamped value and a
 * flag indicating whether a clamp was applied, so the caller can append a
 * `"validation-clamp"` audit entry. Never throws.
 *
 * - `ARVE_PCT` clamps to [0, 1.2] (I4, overtime cap).
 * - Other `_PCT` metrics in `PCT_METRICS` clamp to [0, 1] (I6).
 * - Headcount / FTE volumes clamp to [0, +∞) (cannot be negative).
 */
export function validateForecastCell(value: number, metric: ForecastMetric): ValidationResult {
  if (!Number.isFinite(value)) {
    return { value: 0, clamped: true, reason: `non-finite ${metric}` };
  }
  if (metric === "ARVE_PCT") {
    if (value < 0) return { value: 0, clamped: true, reason: "ARVE_PCT<0" };
    if (value > 1.2) return { value: 1.2, clamped: true, reason: "ARVE_PCT>1.2" };
    return { value, clamped: false };
  }
  if (PCT_METRICS.includes(metric)) {
    if (value < 0) return { value: 0, clamped: true, reason: `${metric}<0` };
    if (value > 1) return { value: 1, clamped: true, reason: `${metric}>1` };
    return { value, clamped: false };
  }
  if (NON_NEGATIVE_METRICS.has(metric) && value < 0) {
    return { value: 0, clamped: true, reason: `${metric}<0` };
  }
  return { value, clamped: false };
}

export interface ArithmeticViolation {
  puCode: string;
  period: Period;
  metric: ForecastMetric;
  expected: number;
  actual: number;
}

/**
 * Scan the provided cells for arithmetic identity drift (I1, I3, I5, I7, I8).
 * Returns a flat list of violations to be surfaced by the DQ page. This is
 * **reporting** — writes are never blocked on identity drift because per-component
 * forecasting is legitimate (e.g. editing F1 without F_TOTAL should not rewrite
 * the user's F_TOTAL override).
 */
export function checkArithmeticIdentities(cells: ForecastCell[]): ArithmeticViolation[] {
  const map = new Map<string, Map<ForecastMetric, number>>();
  for (const c of cells) {
    if (c.grade || c.mu) continue;
    const k = `${c.cycleId}::${c.puCode}::${c.period}`;
    let inner = map.get(k);
    if (!inner) {
      inner = new Map();
      map.set(k, inner);
    }
    inner.set(c.metric, c.value);
  }
  const out: ArithmeticViolation[] = [];
  const EPS = 0.01;
  for (const [k, inner] of map) {
    const [, puCode, period] = k.split("::") as [string, string, Period];
    const hcBeg = inner.get("HC_BEGIN");
    const joiners = inner.get("JOINERS");
    const leavers = inner.get("LEAVERS");
    const hcEnd = inner.get("HC_END");
    if (hcBeg !== undefined && joiners !== undefined && leavers !== undefined && hcEnd !== undefined) {
      const expected = hcBeg + joiners - leavers;
      if (Math.abs(expected - hcEnd) > EPS) {
        out.push({ puCode, period, metric: "HC_END", expected, actual: hcEnd });
      }
    }
    const f1 = inner.get("F1");
    const f2 = inner.get("F2");
    const fTotal = inner.get("F_TOTAL");
    if (f1 !== undefined && f2 !== undefined && fTotal !== undefined) {
      const expected = f1 + f2;
      if (Math.abs(expected - fTotal) > EPS) {
        out.push({ puCode, period, metric: "F_TOTAL", expected, actual: fTotal });
      }
    }
    const fte = inner.get("FTE");
    const bfte = inner.get("BFTE");
    if (fte !== undefined && bfte !== undefined && bfte > fte + EPS) {
      out.push({ puCode, period, metric: "BFTE", expected: fte, actual: bfte });
    }
    const ot = inner.get("OVERTIME_FTE");
    const unpaid = inner.get("UNPAID_LEAVE_FTE");
    const fteCss = inner.get("FTE_CSS");
    if (fte !== undefined && ot !== undefined && unpaid !== undefined && fteCss !== undefined) {
      const expected = fte + ot - unpaid;
      if (Math.abs(expected - fteCss) > EPS) {
        out.push({ puCode, period, metric: "FTE_CSS", expected, actual: fteCss });
      }
    }
    const vac = inner.get("VACATION_FTE");
    const arveBase = inner.get("ARVE_BASE");
    if (fteCss !== undefined && vac !== undefined && unpaid !== undefined && arveBase !== undefined) {
      const expected = fteCss - vac - unpaid;
      if (Math.abs(expected - arveBase) > EPS) {
        out.push({ puCode, period, metric: "ARVE_BASE", expected, actual: arveBase });
      }
    }
  }
  return out;
}

/**
 * Weighted mean of `values` with `weights`. Returns 0 when the sum of weights
 * is 0 (guards the FTE-weighted ARVE case where a PU has no FTE). Arrays must
 * be the same length; extra elements of either are ignored.
 */
export function weightedMean(values: number[], weights: number[]): number {
  const n = Math.min(values.length, weights.length);
  let totalW = 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    totalW += weights[i];
    sum += values[i] * weights[i];
  }
  if (totalW === 0) return 0;
  return sum / totalW;
}

function weightedRollup(
  cells: ForecastCell[],
  cycleId: string,
  metric: ForecastMetric,
  period: Period,
  puCodes: string[],
): number {
  const values = puCodes.map((pu) => cellValue(cells, cycleId, pu, metric, period));
  const weights = puCodes.map((pu) => cellValue(cells, cycleId, pu, "FTE", period));
  return weightedMean(values, weights);
}

export function effectiveValue(
  cells: ForecastCell[],
  cycleId: string,
  puCode: string,
  metric: ForecastMetric,
  period: Period,
): number {
  if (puCode === "CCA_TOTAL") {
    if (PCT_METRICS.includes(metric)) return weightedRollup(cells, cycleId, metric, period, leafPuCodes);
    return rollUp(cells, cycleId, metric, period, leafPuCodes);
  }
  if (puCode === "CCA_SE_TOTAL") {
    if (PCT_METRICS.includes(metric)) return weightedRollup(cells, cycleId, metric, period, sePuCodes);
    return rollUp(cells, cycleId, metric, period, sePuCodes);
  }
  return cellValue(cells, cycleId, puCode, metric, period);
}

export function cellValue(
  cells: ForecastCell[],
  cycleId: string,
  puCode: string,
  metric: ForecastMetric,
  period: Period,
): number {
  for (const c of cells) {
    if (c.grade || c.mu) continue;
    if (
      c.cycleId === cycleId &&
      c.puCode === puCode &&
      c.metric === metric &&
      c.period === period
    ) {
      return c.value;
    }
  }
  return 0;
}

// Index-based lookup for speed on large datasets
export class ForecastIndex {
  /** Aggregate (grade undefined) cells keyed by (cycle, pu, metric, period). */
  private map = new Map<string, ForecastCell>();
  /** Per-grade cells keyed by (cycle, pu, metric, period) → Map<grade, cell>. */
  private byGrade = new Map<string, Map<string, ForecastCell>>();

  constructor(cells: ForecastCell[]) {
    this.rebuild(cells);
  }

  rebuild(cells: ForecastCell[]) {
    this.map.clear();
    this.byGrade.clear();
    for (const c of cells) {
      const k = ForecastIndex.key(c.cycleId, c.puCode, c.metric, c.period);
      if (c.grade) {
        let inner = this.byGrade.get(k);
        if (!inner) {
          inner = new Map();
          this.byGrade.set(k, inner);
        }
        inner.set(c.grade, c);
      } else {
        this.map.set(k, c);
      }
    }
  }

  get(cycleId: string, puCode: string, metric: ForecastMetric, period: Period): number {
    return this.map.get(ForecastIndex.key(cycleId, puCode, metric, period))?.value ?? 0;
  }

  getCell(cycleId: string, puCode: string, metric: ForecastMetric, period: Period): ForecastCell | undefined {
    return this.map.get(ForecastIndex.key(cycleId, puCode, metric, period));
  }

  getByGrade(cycleId: string, puCode: string, metric: ForecastMetric, period: Period, grade: string): number {
    return this.byGrade.get(ForecastIndex.key(cycleId, puCode, metric, period))?.get(grade)?.value ?? 0;
  }

  /** Returns a map from grade → value, or null if no per-grade breakdown was seeded. */
  gradeBreakdown(cycleId: string, puCode: string, metric: ForecastMetric, period: Period): Map<string, number> | null {
    const inner = this.byGrade.get(ForecastIndex.key(cycleId, puCode, metric, period));
    if (!inner || inner.size === 0) return null;
    const out = new Map<string, number>();
    for (const [g, c] of inner) out.set(g, c.value);
    return out;
  }

  static key(cycleId: string, puCode: string, metric: ForecastMetric, period: Period): string {
    return `${cycleId}::${puCode}::${metric}::${period}`;
  }
}

/**
 * Aggregate per-grade values for a single (cycle, pu, metric) across every period.
 * Returns a Map<grade, Map<period, value>> — useful for grade-split trend charts.
 */
export function rollupByGrade(
  cells: ForecastCell[],
  cycleId: string,
  puCode: string,
  metric: ForecastMetric,
): Map<string, Map<Period, number>> {
  const out = new Map<string, Map<Period, number>>();
  for (const c of cells) {
    if (!c.grade) continue;
    if (c.cycleId !== cycleId || c.puCode !== puCode || c.metric !== metric) continue;
    let inner = out.get(c.grade);
    if (!inner) {
      inner = new Map();
      out.set(c.grade, inner);
    }
    inner.set(c.period, c.value);
  }
  return out;
}

export function variance(
  cells: ForecastCell[],
  currentCycleId: string,
  previousCycleId: string,
  puCode: string,
  metric: ForecastMetric,
  period: Period,
): { current: number; previous: number; delta: number; deltaPct: number } {
  const current = effectiveValue(cells, currentCycleId, puCode, metric, period);
  const previous = effectiveValue(cells, previousCycleId, puCode, metric, period);
  const delta = current - previous;
  const deltaPct = previous === 0 ? 0 : delta / previous;
  return { current, previous, delta, deltaPct };
}

/** Simple variance attribution — used by FC/FC drill-down. */
export function attributeVariance(deltaFte: number): Array<{ driver: string; contribution: number; narrative: string }> {
  // A v1 heuristic split — in production this would be derived from joiner/leaver/project deltas.
  const splits: Array<[string, number, string]> = [
    ["joiners", 0.55, "Planned joiners landed on time"],
    ["leavers", -0.12, "Attrition slightly above baseline"],
    ["movers", 0.05, "Net inbound movers from other PUs"],
    ["project_ramp", 0.30, "Project ramp-up on active engagements"],
    ["arve_drift", 0.12, "ARVE drift vs previous FC target"],
    ["other", 0.10, "Rounding & reclassifications"],
  ];
  return splits.map(([driver, share, narrative]) => ({
    driver,
    contribution: Math.round(deltaFte * share * 100) / 100,
    narrative,
  }));
}

/** Compute the budget lookup map. */
export function indexBudget(budget: BudgetCell[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const b of budget) out.set(`${b.puCode}::${b.metric}::${b.period}`, b.value);
  return out;
}

export function budgetValue(map: Map<string, number>, puCode: string, metric: ForecastMetric, period: Period): number {
  return map.get(`${puCode}::${metric}::${period}`) ?? 0;
}

export function mape(forecasts: number[], actuals: number[]): number {
  if (forecasts.length !== actuals.length || forecasts.length === 0) return 0;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < forecasts.length; i++) {
    if (actuals[i] === 0) continue;
    sum += Math.abs(forecasts[i] - actuals[i]) / actuals[i];
    n++;
  }
  return n === 0 ? 0 : sum / n;
}
