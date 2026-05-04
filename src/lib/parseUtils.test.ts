import { describe, expect, it } from "vitest";
import { asDate, asPeriod, headerKey, parsePercent, str, num } from "./parseUtils";

describe("parseUtils", () => {
  describe("asPeriod", () => {
    it("accepts 'YYYY-MM' and 'YYYY-M' literally", () => {
      expect(asPeriod("2026-04")).toBe("2026-04");
      expect(asPeriod("2026-4")).toBe("2026-04");
    });

    it("accepts 'M/YYYY' / 'M-YYYY'", () => {
      expect(asPeriod("4/2026")).toBe("2026-04");
      expect(asPeriod("4-2026")).toBe("2026-04");
    });

    it("returns null for non-date / empty input", () => {
      expect(asPeriod("not-a-date")).toBeNull();
      expect(asPeriod("")).toBeNull();
      expect(asPeriod(null)).toBeNull();
      expect(asPeriod(undefined)).toBeNull();
    });

    it("accepts an Excel serial number", () => {
      // 45748 ≈ 2025-04-01 under the Excel 1900 system. Format must be YYYY-MM.
      const out = asPeriod(45748);
      expect(out).toMatch(/^\d{4}-\d{2}$/);
    });
  });

  describe("asDate", () => {
    it("parses ISO and slashed dates", () => {
      expect(asDate("2026-04-15")).toBe("2026-04-15");
      // Date constructor's behaviour with "2026/04/15" is locale-dependent but
      // should at least round-trip through `.toISOString()`.
      const slash = asDate("2026/04/15");
      expect(slash).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("returns null for empty / unparseable", () => {
      expect(asDate("")).toBeNull();
      expect(asDate(null)).toBeNull();
      expect(asDate("not a date")).toBeNull();
    });
  });

  describe("headerKey", () => {
    it("normalises whitespace, punctuation, and case", () => {
      expect(headerKey("Employee Number")).toBe("employeenumber");
      expect(headerKey("Employee_Number")).toBe("employeenumber");
      expect(headerKey("  EMPLOYEE  number ")).toBe("employeenumber");
      expect(headerKey("Direct supervisor's email")).toBe("directsupervisorsemail");
      expect(headerKey("e-mail")).toBe("email");
    });
  });

  describe("parsePercent", () => {
    it("normalises common HR forms to a 0..1 fraction", () => {
      expect(parsePercent(1)).toBe(1);
      expect(parsePercent(1.0)).toBe(1);
      expect(parsePercent("1")).toBe(1);
      expect(parsePercent(100)).toBe(1);
      expect(parsePercent("100")).toBe(1);
      expect(parsePercent("100%")).toBe(1);
      expect(parsePercent(0.8)).toBeCloseTo(0.8);
      expect(parsePercent("0.8")).toBeCloseTo(0.8);
      expect(parsePercent(80)).toBeCloseTo(0.8);
      expect(parsePercent("80")).toBeCloseTo(0.8);
      expect(parsePercent("80%")).toBeCloseTo(0.8);
    });

    it("returns null for empty / non-numeric", () => {
      expect(parsePercent("")).toBeNull();
      expect(parsePercent(null)).toBeNull();
      expect(parsePercent("abc")).toBeNull();
    });

    it("only auto-percents values >= 2; small fractional overflows stay literal", () => {
      // Integer-percents like 150 are still treated as a percent.
      expect(parsePercent(150)).toBeCloseTo(1.5);
      expect(parsePercent("150%")).toBeCloseTo(1.5);
      // 1.5 (no %) stays as 1.5 — the parser's R11 rule will reject the row.
      expect(parsePercent(1.5)).toBeCloseTo(1.5);
      expect(parsePercent("1.5")).toBeCloseTo(1.5);
    });
  });

  describe("str / num", () => {
    it("str trims and falls back to ''", () => {
      expect(str("  hello ")).toBe("hello");
      expect(str(null)).toBe("");
      expect(str(undefined)).toBe("");
      expect(str(42)).toBe("42");
    });

    it("num coerces or returns 0", () => {
      expect(num("2.5")).toBe(2.5);
      expect(num("")).toBe(0);
      expect(num(null)).toBe(0);
      expect(num("abc")).toBe(0);
    });
  });
});
