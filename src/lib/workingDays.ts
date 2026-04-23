import type { Period } from "../types";

export const HOURS_PER_WORKING_DAY = 8;

function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function addDays(d: Date, days: number): Date {
  const n = new Date(d);
  n.setUTCDate(n.getUTCDate() + days);
  return n;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function polishHolidays(year: number): Set<string> {
  const set = new Set<string>();
  const fixed: Array<[number, number]> = [
    [1, 1],
    [1, 6],
    [5, 1],
    [5, 3],
    [8, 15],
    [11, 1],
    [11, 11],
    [12, 25],
    [12, 26],
  ];
  for (const [m, d] of fixed) set.add(isoDate(new Date(Date.UTC(year, m - 1, d))));
  // Christmas Eve (Wigilia) became a public holiday in Poland from 2025.
  if (year >= 2025) set.add(isoDate(new Date(Date.UTC(year, 11, 24))));
  const easter = easterSunday(year);
  set.add(isoDate(easter));
  set.add(isoDate(addDays(easter, 1)));
  set.add(isoDate(addDays(easter, 49)));
  set.add(isoDate(addDays(easter, 60)));
  return set;
}

export function workingDaysInMonth(year: number, month: number): number {
  const holidays = polishHolidays(year);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  let count = 0;
  for (let d = 1; d <= lastDay; d++) {
    const date = new Date(Date.UTC(year, month - 1, d));
    const dow = date.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    if (holidays.has(isoDate(date))) continue;
    count++;
  }
  return count;
}

export function fullFteHoursInMonth(period: Period): number {
  const y = Number(period.slice(0, 4));
  const m = Number(period.slice(5, 7));
  return workingDaysInMonth(y, m) * HOURS_PER_WORKING_DAY;
}
