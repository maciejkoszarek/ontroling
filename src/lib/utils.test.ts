import { describe, expect, it } from "vitest";
import {
  avg,
  clamp,
  formatDelta,
  formatNumber,
  formatPct,
  initials,
  periodAdd,
  periodRange,
  seededRandom,
  sum,
} from "./utils";

describe("number formatters", () => {
  it("formatNumber returns em-dash for nullish / NaN and fixed digits otherwise", () => {
    expect(formatNumber(null)).toBe("—");
    expect(formatNumber(undefined)).toBe("—");
    expect(formatNumber(Number.NaN)).toBe("—");
    expect(formatNumber(1234.5, 1)).toMatch(/1[,\s]234\.5/);
  });

  it("formatPct multiplies by 100 and appends %", () => {
    expect(formatPct(0.125, 1)).toMatch(/12\.5\s?%/);
    expect(formatPct(null)).toBe("—");
  });

  it("formatDelta uses +/− signs, not ASCII minus", () => {
    expect(formatDelta(5.25, 1)).toMatch(/^\+5\.[23]/);
    expect(formatDelta(-5.25, 1)).toMatch(/^−5\.[23]/);
    expect(formatDelta(0)).toMatch(/0\.0/);
  });
});

describe("period arithmetic", () => {
  it("periodAdd handles year rollover both directions", () => {
    expect(periodAdd("2026-01", -1)).toBe("2025-12");
    expect(periodAdd("2025-12", 1)).toBe("2026-01");
    expect(periodAdd("2026-03", 12)).toBe("2027-03");
  });

  it("periodRange is inclusive at both ends and strictly monotonic", () => {
    const r = periodRange("2026-01", "2026-04");
    expect(r).toEqual(["2026-01", "2026-02", "2026-03", "2026-04"]);
    expect(periodRange("2026-05", "2026-05")).toEqual(["2026-05"]);
  });
});

describe("math helpers", () => {
  it("sum and avg", () => {
    expect(sum([1, 2, 3])).toBe(6);
    expect(avg([])).toBe(0);
    expect(avg([2, 4, 6])).toBe(4);
  });

  it("clamp bounds both sides", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });

  it("seededRandom is deterministic and in [0, 1)", () => {
    const a = seededRandom("same-seed");
    const b = seededRandom("same-seed");
    const aVals = Array.from({ length: 5 }, () => a());
    const bVals = Array.from({ length: 5 }, () => b());
    expect(aVals).toEqual(bVals);
    for (const v of aVals) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(seededRandom("different")()).not.toBe(a());
  });
});

describe("initials", () => {
  it("uses first and last token of a name", () => {
    expect(initials("Anna Kowalska")).toBe("AK");
    expect(initials("Jan Maria Nowak")).toBe("JN");
    expect(initials("Cher")).toBe("CC");
  });
});
