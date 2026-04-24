import { clsx, type ClassValue } from "clsx";
import type { ForecastCycle, Period } from "../types";

export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

export function formatNumber(value: number | null | undefined, fractionDigits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

export function formatInt(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return Math.round(value).toLocaleString();
}

export function formatPct(value: number | null | undefined, fractionDigits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${(value * 100).toLocaleString(undefined, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })}%`;
}

export function formatMoney(value: number | null | undefined, currency = "EUR"): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return value.toLocaleString(undefined, { style: "currency", currency, maximumFractionDigits: 0 });
}

export function formatDelta(value: number | null | undefined, fractionDigits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toLocaleString(undefined, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })}`;
}

export function periodAdd(period: Period, months: number): Period {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(Date.UTC(y, (m - 1) + months, 1));
  const yy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${yy}-${mm}`;
}

export function periodRange(from: Period, to: Period): Period[] {
  const out: Period[] = [];
  let cur = from;
  while (cur <= to) {
    out.push(cur);
    cur = periodAdd(cur, 1);
  }
  return out;
}

export function periodLabel(period: Period, mode: "long" | "short" | "year-short" = "short"): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  if (mode === "long") return d.toLocaleString(undefined, { month: "long", year: "numeric" });
  if (mode === "year-short") return `${d.toLocaleString(undefined, { month: "short" })} ${String(y).slice(2)}`;
  return d.toLocaleString(undefined, { month: "short", year: "2-digit" });
}

export function monthShort(period: Period): string {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString(undefined, { month: "short" });
}

export function currentPeriod(): Period {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Year of the active cycle's opened period, or current UTC year as a safe fallback. */
export function activeCycleYear(
  cycles: ReadonlyArray<ForecastCycle>,
  activeCycleId: string,
): number {
  const p = cycles.find((c) => c.id === activeCycleId)?.periodOpened;
  const y = Number(p?.slice(0, 4));
  return Number.isFinite(y) && y > 0 ? y : new Date().getUTCFullYear();
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/** Deterministic pseudo-random based on a seed string */
export function seededRandom(seed: string): () => number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function sum(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}

export function avg(values: number[]): number {
  return values.length === 0 ? 0 : sum(values) / values.length;
}

export function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] ?? "").toUpperCase() + (parts.at(-1)?.[0] ?? "").toUpperCase();
}

export function uid(prefix = ""): string {
  return `${prefix}${Math.random().toString(36).slice(2, 10)}`;
}
