import { describe, expect, it } from "vitest";
import {
  buildDaysByPeriod,
  buildHoursByPeriod,
  daysForPeriod,
  defaultEntryForPeriod,
  hoursForPeriod,
  indexWorkingCalendar,
  seedWorkingCalendar,
  yearPeriods,
  HOURS_PER_WORKING_DAY,
} from "./workingCalendar";

describe("workingCalendar", () => {
  it("defaultEntryForPeriod derives days + hours from the Polish business calendar", () => {
    const entry = defaultEntryForPeriod("2026-04");
    expect(entry.period).toBe("2026-04");
    expect(entry.workingDays).toBeGreaterThan(15);
    expect(entry.workingDays).toBeLessThanOrEqual(22);
    expect(entry.workingHours).toBe(entry.workingDays * HOURS_PER_WORKING_DAY);
  });

  it("seedWorkingCalendar covers every month in the inclusive year range", () => {
    const seeded = seedWorkingCalendar(2025, 2026);
    expect(seeded).toHaveLength(24);
    expect(seeded[0].period).toBe("2025-01");
    expect(seeded[seeded.length - 1].period).toBe("2026-12");
  });

  it("indexWorkingCalendar builds a period → entry map with the last entry winning on duplicates", () => {
    const idx = indexWorkingCalendar([
      { period: "2026-04", workingDays: 20, workingHours: 160 },
      { period: "2026-04", workingDays: 19, workingHours: 152 },
      { period: "2026-05", workingDays: 21, workingHours: 168 },
    ]);
    expect(idx.size).toBe(2);
    expect(idx.get("2026-04")?.workingDays).toBe(19);
    expect(idx.get("2026-05")?.workingDays).toBe(21);
  });

  it("hoursForPeriod returns the user-overridden value when present, otherwise falls back to the calendar default", () => {
    const entries = [{ period: "2026-04", workingDays: 18, workingHours: 140 }];
    expect(hoursForPeriod(entries, "2026-04")).toBe(140);
    // No override for July — fallback to full-FTE default (≥ 100 hours for any month).
    expect(hoursForPeriod(entries, "2026-07")).toBeGreaterThan(100);
  });

  it("daysForPeriod returns the user-overridden value when present, otherwise falls back", () => {
    const entries = [{ period: "2026-04", workingDays: 18, workingHours: 140 }];
    expect(daysForPeriod(entries, "2026-04")).toBe(18);
    expect(daysForPeriod(entries, "2026-07")).toBeGreaterThan(15);
  });

  it("buildHoursByPeriod / buildDaysByPeriod build aligned maps over the requested periods", () => {
    const periods = ["2026-04", "2026-05", "2026-06"];
    const entries = [
      { period: "2026-04", workingDays: 18, workingHours: 140 },
      { period: "2026-05", workingDays: 21, workingHours: 168 },
    ];
    const hoursMap = buildHoursByPeriod(entries, periods);
    const daysMap = buildDaysByPeriod(entries, periods);
    expect(hoursMap.get("2026-04")).toBe(140);
    expect(daysMap.get("2026-05")).toBe(21);
    // '2026-06' uses the calendar default (not crashed, not undefined).
    expect(hoursMap.get("2026-06")).toBeGreaterThan(100);
    expect(daysMap.get("2026-06")).toBeGreaterThan(15);
  });

  it("yearPeriods returns 12 contiguous YYYY-MM strings in January→December order", () => {
    const periods = yearPeriods(2026);
    expect(periods).toHaveLength(12);
    expect(periods[0]).toBe("2026-01");
    expect(periods[11]).toBe("2026-12");
  });
});
