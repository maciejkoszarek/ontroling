import { describe, expect, it } from "vitest";
import type { ForecastCell, ForecastMetric, Period } from "../types";
import { forecastCells as seedForecastCells } from "./demoData";
import { checkArithmeticIdentities, validateForecastCell } from "./forecast";

const CYCLE = "fc-2026-04";
const PU = "PL01NC08";
const P: Period = "2026-04";

function makeCell(metric: ForecastMetric, value: number): ForecastCell {
  return {
    cycleId: CYCLE,
    puCode: PU,
    period: P,
    metric,
    value,
    source: "manual",
    enteredBy: "test",
    enteredAt: "2026-04-01T00:00:00Z",
  };
}

describe("validateForecastCell — I4 ARVE_PCT range [0, 1.2]", () => {
  it("clamps values above 1.2 down to 1.2 (overtime cap)", () => {
    const r = validateForecastCell(1.5, "ARVE_PCT");
    expect(r.value).toBe(1.2);
    expect(r.clamped).toBe(true);
    expect(r.reason).toMatch(/ARVE_PCT>1\.2/);
  });

  it("clamps values below 0 up to 0", () => {
    const r = validateForecastCell(-0.1, "ARVE_PCT");
    expect(r.value).toBe(0);
    expect(r.clamped).toBe(true);
    expect(r.reason).toMatch(/ARVE_PCT<0/);
  });

  it("leaves values inside [0, 1.2] alone — including the 1.0 crossover and 1.2 boundary", () => {
    for (const v of [0, 0.5, 1.0, 1.1, 1.2]) {
      const r = validateForecastCell(v, "ARVE_PCT");
      expect(r.value).toBe(v);
      expect(r.clamped).toBe(false);
    }
  });
});

describe("validateForecastCell — I6 other _PCT metrics in [0, 1]", () => {
  const OTHER_PCT: ForecastMetric[] = ["ARVI_PCT", "BENCH_PCT", "LND_PCT", "VACATION_PCT"];

  for (const metric of OTHER_PCT) {
    it(`${metric}: value > 1 clamps to 1`, () => {
      const r = validateForecastCell(1.15, metric);
      expect(r.value).toBe(1);
      expect(r.clamped).toBe(true);
    });

    it(`${metric}: value < 0 clamps to 0`, () => {
      const r = validateForecastCell(-0.05, metric);
      expect(r.value).toBe(0);
      expect(r.clamped).toBe(true);
    });

    it(`${metric}: 0.5 is untouched`, () => {
      const r = validateForecastCell(0.5, metric);
      expect(r.value).toBe(0.5);
      expect(r.clamped).toBe(false);
    });
  }
});

describe("validateForecastCell — non-negative headcount / FTE metrics", () => {
  const CASES: Array<[ForecastMetric, number, number]> = [
    ["HC_BEGIN", -3, 0],
    ["HC_END", -1, 0],
    ["JOINERS", -2, 0],
    ["LEAVERS", -4, 0],
    ["FTE", -1.5, 0],
    ["BFTE", -0.2, 0],
    ["F1", -10, 0],
    ["F2", -1, 0],
    ["F_TOTAL", -5, 0],
    ["FTE_LOST", -0.5, 0],
    ["OVERTIME_FTE", -1, 0],
    ["UNPAID_LEAVE_FTE", -0.3, 0],
    ["VACATION_FTE", -0.2, 0],
    ["SICKNESS_FTE", -0.1, 0],
    ["FTE_CSS", -2, 0],
    ["ARVE_BASE", -1, 0],
    ["BENCH_FTE", -1, 0],
    ["LND_FTE", -0.5, 0],
    ["RECRUITMENT_FTE", -0.25, 0],
    ["MAN_FTE", -0.75, 0],
    ["RESERVE_FTE", -0.5, 0],
    ["BDC_SOLD_FTE", -1, 0],
    ["BDC_PL_FTE", -0.9, 0],
    ["INTERNAL_PROJECTS_FTE", -0.2, 0],
    ["STUDENTS_HC", -5, 0],
  ];
  it.each(CASES)("%s: negative %p clamps to %p", (metric, input, expected) => {
    const r = validateForecastCell(input, metric);
    expect(r.value).toBe(expected);
    expect(r.clamped).toBe(true);
  });

  it("leaves non-negative metrics untouched when ≥ 0", () => {
    expect(validateForecastCell(42, "FTE")).toEqual({ value: 42, clamped: false });
    expect(validateForecastCell(0, "HC_BEGIN")).toEqual({ value: 0, clamped: false });
  });

  it("coerces NaN / Infinity to 0 with clamped=true", () => {
    expect(validateForecastCell(Number.NaN, "FTE").value).toBe(0);
    expect(validateForecastCell(Number.NaN, "FTE").clamped).toBe(true);
    expect(validateForecastCell(Number.POSITIVE_INFINITY, "FTE").value).toBe(0);
    expect(validateForecastCell(Number.POSITIVE_INFINITY, "FTE").clamped).toBe(true);
  });
});

describe("checkArithmeticIdentities — one violation per identity family", () => {
  it("flags HC_END ≠ HC_BEGIN + JOINERS − LEAVERS (I1)", () => {
    const cells = [
      makeCell("HC_BEGIN", 100),
      makeCell("JOINERS", 10),
      makeCell("LEAVERS", 4),
      makeCell("HC_END", 120), // should be 106
    ];
    const out = checkArithmeticIdentities(cells);
    const hit = out.find((v) => v.metric === "HC_END");
    expect(hit).toBeDefined();
    expect(hit?.expected).toBe(106);
    expect(hit?.actual).toBe(120);
  });

  it("flags F_TOTAL ≠ F1 + F2 (I3)", () => {
    const cells = [makeCell("F1", 30), makeCell("F2", 12), makeCell("F_TOTAL", 50)];
    const out = checkArithmeticIdentities(cells);
    const hit = out.find((v) => v.metric === "F_TOTAL");
    expect(hit).toBeDefined();
    expect(hit?.expected).toBe(42);
    expect(hit?.actual).toBe(50);
  });

  it("flags BFTE > FTE (I5)", () => {
    const cells = [makeCell("FTE", 10), makeCell("BFTE", 11)];
    const out = checkArithmeticIdentities(cells);
    const hit = out.find((v) => v.metric === "BFTE");
    expect(hit).toBeDefined();
    expect(hit?.actual).toBe(11);
    expect(hit?.expected).toBe(10);
  });

  it("flags FTE_CSS ≠ FTE + OVERTIME_FTE − UNPAID_LEAVE_FTE (I7)", () => {
    const cells = [
      makeCell("FTE", 20),
      makeCell("OVERTIME_FTE", 2),
      makeCell("UNPAID_LEAVE_FTE", 1),
      makeCell("FTE_CSS", 25), // should be 21
    ];
    const out = checkArithmeticIdentities(cells);
    const hit = out.find((v) => v.metric === "FTE_CSS");
    expect(hit).toBeDefined();
    expect(hit?.expected).toBe(21);
    expect(hit?.actual).toBe(25);
  });

  it("flags ARVE_BASE ≠ FTE_CSS − VACATION_FTE − UNPAID_LEAVE_FTE (I8)", () => {
    const cells = [
      makeCell("FTE", 20),
      makeCell("OVERTIME_FTE", 2),
      makeCell("UNPAID_LEAVE_FTE", 1),
      makeCell("FTE_CSS", 21),
      makeCell("VACATION_FTE", 3),
      makeCell("ARVE_BASE", 12), // should be 21 − 3 − 1 = 17
    ];
    const out = checkArithmeticIdentities(cells);
    const hit = out.find((v) => v.metric === "ARVE_BASE");
    expect(hit).toBeDefined();
    expect(hit?.expected).toBe(17);
    expect(hit?.actual).toBe(12);
  });

  it("returns an empty list when all identities hold within EPS", () => {
    const cells = [
      makeCell("HC_BEGIN", 100),
      makeCell("JOINERS", 10),
      makeCell("LEAVERS", 4),
      makeCell("HC_END", 106),
      makeCell("F1", 30),
      makeCell("F2", 12),
      makeCell("F_TOTAL", 42),
      makeCell("FTE", 20),
      makeCell("BFTE", 18),
      makeCell("OVERTIME_FTE", 2),
      makeCell("UNPAID_LEAVE_FTE", 1),
      makeCell("FTE_CSS", 21),
      makeCell("VACATION_FTE", 3),
      makeCell("ARVE_BASE", 17),
    ];
    expect(checkArithmeticIdentities(cells)).toEqual([]);
  });
});

describe("seed forecast cells satisfy every arithmetic identity", () => {
  it("generateForecastCells() produces a dataset with zero arithmetic violations", () => {
    // If this ever fails, the seeder drifted away from the derived-metric pipeline
    // in demoData.ts — a correctness regression we must not let ship.
    const violations = checkArithmeticIdentities(seedForecastCells);
    expect(violations).toEqual([]);
  });
});
