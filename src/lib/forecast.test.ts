import { describe, expect, it } from "vitest";
import type { ForecastCell, ForecastCycle, ForecastMetric, Period, ProductionUnit } from "../types";
import { leafPuCodes, sePuCodes, productionUnits } from "./demoData";
import {
  cellValue,
  effectiveCells,
  effectiveValue,
  ForecastIndex,
  indexBudget,
  mape,
  rollUp,
  variance,
} from "./forecast";

function makeCell(
  cycleId: string,
  puCode: string,
  metric: ForecastMetric,
  period: Period,
  value: number,
  grade?: string,
): ForecastCell {
  return {
    cycleId,
    puCode,
    metric,
    period,
    value,
    ...(grade ? { grade } : {}),
    enteredBy: "test",
    enteredAt: "2026-01-01T00:00:00Z",
    source: "manual",
  };
}

const CYCLE = "fc-2026-04";
const PREV = "fc-2026-03";
const P: Period = "2026-04";

describe("rollUp and cellValue", () => {
  it("sums leaf PU cells for a metric × period, ignoring grade/mu rows", () => {
    const cells: ForecastCell[] = [
      makeCell(CYCLE, "PL01NC03", "FTE", P, 10),
      makeCell(CYCLE, "PL01NC04", "FTE", P, 20),
      makeCell(CYCLE, "PL01NC05", "FTE", P, 5, "SE2"),
      makeCell(CYCLE, "PL01NC03", "FTE", "2026-05", 99),
      makeCell(CYCLE, "PL01NC03", "BFTE", P, 88),
    ];
    expect(rollUp(cells, CYCLE, "FTE", P, ["PL01NC03", "PL01NC04"])).toBe(30);
  });

  it("cellValue returns 0 when a cell is missing — never undefined / NaN", () => {
    expect(cellValue([], CYCLE, "PL01NC03", "FTE", P)).toBe(0);
  });
});

describe("effectiveValue virtual roll-ups", () => {
  const allPus: ProductionUnit[] = productionUnits;

  it("CCA_SE_TOTAL sums the five SE leaves", () => {
    const cells = sePuCodes.map((pu) => makeCell(CYCLE, pu, "FTE", P, 7));
    expect(effectiveValue(cells, allPus, CYCLE, "CCA_SE_TOTAL", "FTE", P)).toBe(35);
  });

  it("CCA_TOTAL sums every leaf PU for additive metrics", () => {
    const cells = leafPuCodes.map((pu) => makeCell(CYCLE, pu, "HC_END", P, 3));
    expect(effectiveValue(cells, allPus, CYCLE, "CCA_TOTAL", "HC_END", P)).toBe(3 * leafPuCodes.length);
  });

  it("CCA_TOTAL for ARVE_PCT is FTE-weighted, not a flat mean", () => {
    const big = leafPuCodes[0];
    const small = leafPuCodes[1];
    const cells: ForecastCell[] = [
      makeCell(CYCLE, big, "FTE", P, 90),
      makeCell(CYCLE, big, "ARVE_PCT", P, 0.9),
      makeCell(CYCLE, small, "FTE", P, 10),
      makeCell(CYCLE, small, "ARVE_PCT", P, 0.5),
    ];
    // weighted: (90*0.9 + 10*0.5) / 100 = 0.86
    expect(effectiveValue(cells, allPus, CYCLE, "CCA_TOTAL", "ARVE_PCT", P)).toBeCloseTo(0.86, 4);
  });

  it("weighted roll-up returns 0 when total FTE weight is 0", () => {
    const cells = leafPuCodes.map((pu) => makeCell(CYCLE, pu, "ARVE_PCT", P, 0.8));
    expect(effectiveValue(cells, allPus, CYCLE, "CCA_TOTAL", "ARVE_PCT", P)).toBe(0);
  });

  it("regular (non-virtual) PU delegates to cellValue", () => {
    const cells = [makeCell(CYCLE, "PL01NC08", "FTE", P, 42)];
    expect(effectiveValue(cells, allPus, CYCLE, "PL01NC08", "FTE", P)).toBe(42);
  });
});

describe("ForecastIndex", () => {
  it("separates aggregate from per-grade cells and gives O(1) lookup", () => {
    const cells = [
      makeCell(CYCLE, "PL01NC08", "FTE", P, 50),
      makeCell(CYCLE, "PL01NC08", "FTE", P, 30, "SE2"),
      makeCell(CYCLE, "PL01NC08", "FTE", P, 20, "SE3"),
    ];
    const idx = new ForecastIndex(cells);
    expect(idx.get(CYCLE, "PL01NC08", "FTE", P)).toBe(50);
    expect(idx.getByGrade(CYCLE, "PL01NC08", "FTE", P, "SE2")).toBe(30);
    const breakdown = idx.gradeBreakdown(CYCLE, "PL01NC08", "FTE", P);
    expect(breakdown?.get("SE2")).toBe(30);
    expect(breakdown?.get("SE3")).toBe(20);
  });

  it("returns 0 for missing keys and null for empty grade breakdown", () => {
    const idx = new ForecastIndex([]);
    expect(idx.get(CYCLE, "PL01NC08", "FTE", P)).toBe(0);
    expect(idx.gradeBreakdown(CYCLE, "PL01NC08", "FTE", P)).toBeNull();
  });
});

describe("variance and mape", () => {
  it("variance computes delta and deltaPct, guarding divide-by-zero", () => {
    const cells = [
      makeCell(CYCLE, "PL01NC08", "FTE", P, 110),
      makeCell(PREV, "PL01NC08", "FTE", P, 100),
    ];
    const v = variance(cells, CYCLE, PREV, "PL01NC08", "FTE", P, productionUnits);
    expect(v.current).toBe(110);
    expect(v.previous).toBe(100);
    expect(v.delta).toBe(10);
    expect(v.deltaPct).toBeCloseTo(0.1, 6);

    const vZero = variance([], CYCLE, PREV, "PL01NC08", "FTE", P, productionUnits);
    expect(vZero.deltaPct).toBe(0);
  });

  it("mape ignores actual=0 buckets and returns mean |F-A|/A", () => {
    expect(mape([11, 20, 30], [10, 20, 30])).toBeCloseTo((0.1 + 0 + 0) / 3, 6);
    expect(mape([5, 10], [0, 10])).toBeCloseTo(0, 6);
    expect(mape([], [])).toBe(0);
    expect(mape([1, 2], [1])).toBe(0);
  });
});

describe("indexBudget", () => {
  it("keys by puCode::metric::period and returns 0 via helper on miss", () => {
    const map = indexBudget([
      { year: 2026, puCode: "PL01NC08", metric: "FTE", period: P, value: 42 },
    ]);
    expect(map.get("PL01NC08::FTE::2026-04")).toBe(42);
    expect(map.get("PL01NC99::FTE::2026-04")).toBeUndefined();
  });
});

describe("effectiveCells locked-snapshot precedence", () => {
  const cycles: ForecastCycle[] = [
    { id: "fc-a", label: "FC A", periodOpened: P, status: "locked", openedBy: "test" },
    { id: "fc-b", label: "FC B", periodOpened: P, status: "editing", openedBy: "test" },
  ];

  it("replaces live rows for locked cycles with the frozen snapshot", () => {
    const live = [
      makeCell("fc-a", "PL01NC08", "FTE", P, 999), // this must be dropped
      makeCell("fc-b", "PL01NC08", "FTE", P, 10),
    ];
    const snapshots = {
      "fc-a": [makeCell("fc-a", "PL01NC08", "FTE", P, 100)],
    };
    const out = effectiveCells(live, snapshots, cycles);
    const aValue = out.find((c) => c.cycleId === "fc-a" && c.puCode === "PL01NC08")?.value;
    const bValue = out.find((c) => c.cycleId === "fc-b" && c.puCode === "PL01NC08")?.value;
    expect(aValue).toBe(100);
    expect(bValue).toBe(10);
  });

  it("returns live unchanged when no cycle is frozen", () => {
    const live = [makeCell("fc-b", "PL01NC08", "FTE", P, 10)];
    expect(effectiveCells(live, {}, cycles)).toBe(live);
  });
});
