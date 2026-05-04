// Shared parsing helpers for the legacy CCA workbook parser (`excelParser.ts`)
// and the HR Database parser (`hrDbParser.ts`). See hr_database_import.md §18.5.

import * as XLSX from "xlsx";
import type { Period } from "../types";

/** Coerce an arbitrary cell value into `YYYY-MM` (`Period`) or null. */
export function asPeriod(v: unknown): Period | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return `${d.y}-${String(d.m).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  if (!s) return null;
  const m = /^(\d{4})-(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}`;
  const m2 = /^(\d{1,2})[./-](\d{4})$/.exec(s);
  if (m2) return `${m2[2]}-${m2[1].padStart(2, "0")}`;
  const d = new Date(s);
  if (Number.isFinite(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  return null;
}

/** Coerce an arbitrary cell value into `YYYY-MM-DD` ISO date string or null. */
export function asDate(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  if (!s) return null;
  const d = new Date(s);
  if (Number.isFinite(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

/** Trimmed string; null/undefined → "". */
export function str(v: unknown): string {
  return v === null || v === undefined ? "" : String(v).trim();
}

/** Coerce to finite number; non-numeric → 0. */
export function num(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Normalise a column-header string for case- and whitespace-insensitive
 * matching. Lowercase, alphanumeric only.
 *
 * `headerKey("Employee Number")` === `headerKey("employee_number")` === `"employeenumber"`.
 */
export function headerKey(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Parse a Polish "Part time" / percentage value into a 0..1 fraction.
 *
 *  - `1`, `1.0`, `"1"` → `1`
 *  - `100`, `"100"`, `"100%"` → `1`
 *  - `0.8`, `"0.8"` → `0.8`
 *  - `80`, `"80"`, `"80%"` → `0.8`
 *  - `1.5` (no `%`) → `1.5` — caller (R11) decides it's out of bounds.
 *  - empty / non-numeric → `null`
 *
 * Heuristic: if the value carries a literal `%` it is divided by 100.
 * Otherwise, only values >= 2 are treated as percents (so `80 → 0.8`,
 * `100 → 1`, but `1.5` stays at `1.5` and trips the R11 bound check).
 */
export function parsePercent(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return null;
    return v >= 2 ? v / 100 : v;
  }
  const raw = String(v).trim();
  if (!raw) return null;
  const hasPct = raw.endsWith("%");
  const cleaned = (hasPct ? raw.slice(0, -1) : raw).replace(",", ".").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  if (hasPct) return n / 100;
  return n >= 2 ? n / 100 : n;
}

/** Heuristic: HR engagement / PU value → application PU code. */
export function inferPuCode(engagement: string): string {
  const s = engagement.toUpperCase();
  if (s.includes("SE1") || s.includes("PL01NC03")) return "PL01NC03";
  if (s.includes("SE2") || s.includes("PL01NC04")) return "PL01NC04";
  if (s.includes("SE3") || s.includes("PL01NC05")) return "PL01NC05";
  if (s.includes("SE4") || s.includes("PL01NC06")) return "PL01NC06";
  if (s.includes("SE5") || s.includes("PL01NC07")) return "PL01NC07";
  if (s.includes("CLOUD") || s.includes("PL01NC08")) return "PL01NC08";
  if (s.includes("COMPLEX")) return "PL01NC09";
  if (s.includes("EEC") || s.includes("PL01NC10")) return "PL01NC10";
  if (s.includes("HEAD")) return "PL01NC01";
  return "PL01NC01";
}

/** Heuristic: HR location string → application location code. */
export function inferLocCode(loc: string): string {
  const s = loc.toUpperCase();
  if (s.includes("WROCŁ") || s.includes("WROC")) return "WRO";
  if (s.includes("POZN")) return "POZ";
  if (s.includes("GDAŃ") || s.includes("GDAN")) return "GDN";
  if (s.includes("WARS")) return "WAW";
  if (s.includes("KRAK") || s.includes("CRAC")) return "KRK";
  if (s.includes("REMOTE")) return "REMOTE";
  return "REMOTE";
}
