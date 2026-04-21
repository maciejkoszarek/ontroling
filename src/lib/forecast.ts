import type {
  BudgetCell,
  ForecastCell,
  ForecastCycle,
  ForecastMetric,
  Period,
  ProductionUnit,
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

function weightedRollup(
  cells: ForecastCell[],
  cycleId: string,
  metric: ForecastMetric,
  period: Period,
  puCodes: string[],
): number {
  const nums = puCodes.map((pu) => ({
    v: cellValue(cells, cycleId, pu, metric, period),
    w: cellValue(cells, cycleId, pu, "FTE", period),
  }));
  const totalW = nums.reduce((a, x) => a + x.w, 0);
  if (totalW === 0) return 0;
  return nums.reduce((a, x) => a + x.v * x.w, 0) / totalW;
}

export function effectiveValue(
  cells: ForecastCell[],
  allPus: ProductionUnit[],
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
  allPus: ProductionUnit[],
): { current: number; previous: number; delta: number; deltaPct: number } {
  const current = effectiveValue(cells, allPus, currentCycleId, puCode, metric, period);
  const previous = effectiveValue(cells, allPus, previousCycleId, puCode, metric, period);
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
