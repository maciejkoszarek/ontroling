import type { Period, WorkingCalendarEntry } from "../types";
import { fullFteHoursInMonth, workingDaysInMonth, HOURS_PER_WORKING_DAY } from "./workingDays";

export { HOURS_PER_WORKING_DAY };

export function defaultEntryForPeriod(period: Period): WorkingCalendarEntry {
  const y = Number(period.slice(0, 4));
  const m = Number(period.slice(5, 7));
  const days = workingDaysInMonth(y, m);
  return { period, workingDays: days, workingHours: days * HOURS_PER_WORKING_DAY };
}

export function seedWorkingCalendar(fromYear: number, toYear: number): WorkingCalendarEntry[] {
  const out: WorkingCalendarEntry[] = [];
  for (let y = fromYear; y <= toYear; y++) {
    for (let m = 1; m <= 12; m++) {
      const period = `${y}-${String(m).padStart(2, "0")}`;
      out.push(defaultEntryForPeriod(period));
    }
  }
  return out;
}

export function indexWorkingCalendar(entries: ReadonlyArray<WorkingCalendarEntry>): Map<Period, WorkingCalendarEntry> {
  const m = new Map<Period, WorkingCalendarEntry>();
  for (const e of entries) m.set(e.period, e);
  return m;
}

export function hoursForPeriod(
  entries: ReadonlyArray<WorkingCalendarEntry> | Map<Period, WorkingCalendarEntry>,
  period: Period,
): number {
  const e = entries instanceof Map ? entries.get(period) : entries.find((x) => x.period === period);
  return e ? e.workingHours : fullFteHoursInMonth(period);
}

export function daysForPeriod(
  entries: ReadonlyArray<WorkingCalendarEntry> | Map<Period, WorkingCalendarEntry>,
  period: Period,
): number {
  const e = entries instanceof Map ? entries.get(period) : entries.find((x) => x.period === period);
  return e ? e.workingDays : workingDaysInMonth(Number(period.slice(0, 4)), Number(period.slice(5, 7)));
}

export function buildHoursByPeriod(
  entries: ReadonlyArray<WorkingCalendarEntry>,
  periods: ReadonlyArray<Period>,
): Map<Period, number> {
  const idx = indexWorkingCalendar(entries);
  const out = new Map<Period, number>();
  for (const p of periods) out.set(p, hoursForPeriod(idx, p));
  return out;
}

export function buildDaysByPeriod(
  entries: ReadonlyArray<WorkingCalendarEntry>,
  periods: ReadonlyArray<Period>,
): Map<Period, number> {
  const idx = indexWorkingCalendar(entries);
  const out = new Map<Period, number>();
  for (const p of periods) out.set(p, daysForPeriod(idx, p));
  return out;
}

export function yearPeriods(year: number): Period[] {
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
}
