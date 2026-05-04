import { useMemo, useState } from "react";
import { useAppStore } from "../store";
import { periodAdd, activeCycleYear } from "../lib/utils";
import { Plus, Check, X, Lock, Archive, PenLine, ClipboardCheck, CalendarDays, RotateCcw } from "lucide-react";
import type { CycleStatus, Role } from "../types";
import { defaultEntryForPeriod, indexWorkingCalendar, yearPeriods } from "../lib/workingCalendar";
import AdminDataBackup from "../components/AdminDataBackup";
import HrMappingEditor from "../components/admin/HrMappingEditor";

const ROLES: Array<{ value: Role; label: string }> = [
  { value: "controller", label: "Controller" },
  { value: "pu_lead", label: "PU lead" },
  { value: "finance", label: "Finance partner" },
  { value: "hr", label: "HR partner" },
  { value: "viewer", label: "Executive viewer" },
];

export default function Admin() {
  const cycles = useAppStore((s) => s.cycles);
  const openCycle = useAppStore((s) => s.openCycle);
  const startEditing = useAppStore((s) => s.startEditing);
  const startReconciling = useAppStore((s) => s.startReconciling);
  const lockCycle = useAppStore((s) => s.lockCycle);
  const archiveCycle = useAppStore((s) => s.archiveCycle);
  const lockedSnapshots = useAppStore((s) => s.lockedSnapshots);
  const role = useAppStore((s) => s.role);
  const setRole = useAppStore((s) => s.setRole);
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const density = useAppStore((s) => s.density);
  const setDensity = useAppStore((s) => s.setDensity);
  const pus = useAppStore((s) => s.productionUnits);
  const mus = useAppStore((s) => s.marketUnits);
  const workingCalendar = useAppStore((s) => s.workingCalendar);
  const setWorkingCalendarEntry = useAppStore((s) => s.setWorkingCalendarEntry);
  const resetWorkingCalendar = useAppStore((s) => s.resetWorkingCalendar);
  const activeCycleId = useAppStore((s) => s.activeCycleId);
  const defaultYear = activeCycleYear(cycles, activeCycleId);
  const [calendarYear, setCalendarYear] = useState<number>(defaultYear);
  const calendarIndex = useMemo(() => indexWorkingCalendar(workingCalendar), [workingCalendar]);
  const calendarRows = useMemo(() => {
    return yearPeriods(calendarYear).map((period) => {
      const entry = calendarIndex.get(period) ?? defaultEntryForPeriod(period);
      return { period, entry };
    });
  }, [calendarYear, calendarIndex]);
  const yearDays = calendarRows.reduce((s, r) => s + r.entry.workingDays, 0);
  const yearHours = calendarRows.reduce((s, r) => s + r.entry.workingHours, 0);

  const [openingLabel, setOpeningLabel] = useState("FC " + new Date().toLocaleString(undefined, { month: "long", year: "numeric" }));
  const [openingPeriod, setOpeningPeriod] = useState<string>(() => {
    const activeCycle = cycles.find((c) => c.status === "editing" || c.status === "open");
    return periodAdd(activeCycle?.periodOpened ?? "2026-04", 1);
  });

  const canTransition = role === "controller" || role === "pu_lead";
  const canLock = role === "controller";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Admin</h1>
        <p className="text-sm text-fg-muted">Cycle management, RBAC and configuration.</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="card p-4">
          <h2 className="text-sm font-semibold mb-3">Forecast cycles</h2>
          <div className="flex items-end gap-2 mb-3 flex-wrap">
            <div className="flex-1 min-w-[160px]">
              <label className="text-[11px] uppercase tracking-wider text-fg-muted">New cycle label</label>
              <input className="input mt-1" value={openingLabel} onChange={(e) => setOpeningLabel(e.target.value)} />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wider text-fg-muted">Period</label>
              <input className="input mt-1 !w-28" value={openingPeriod} onChange={(e) => setOpeningPeriod(e.target.value)} placeholder="2026-05" />
            </div>
            <button className="btn-primary" onClick={() => openCycle(openingLabel, openingPeriod)}>
              <Plus className="w-4 h-4" /> Open cycle
            </button>
          </div>
          <div className="divide-y divide-border">
            {cycles.map((c) => {
              const snapCount = lockedSnapshots[c.id]?.length ?? 0;
              return (
                <div key={c.id} className="flex items-center justify-between py-2 gap-2 flex-wrap">
                  <div>
                    <div className="text-sm font-medium">{c.label}</div>
                    <div className="text-[11px] text-fg-muted">
                      Opened {c.periodOpened} · by {c.openedBy}
                      {c.lockedAt && <> · locked {c.lockedAt.slice(0, 10)}</>}
                      {snapCount > 0 && <> · {snapCount} frozen cells</>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    <span className={cycleStatusChip(c.status)}>{c.status}</span>
                    {c.status === "open" && canTransition && (
                      <button className="btn" onClick={() => startEditing(c.id)} title="Controllers and PU leads">
                        <PenLine className="w-3.5 h-3.5" /> Start editing
                      </button>
                    )}
                    {c.status === "editing" && canTransition && (
                      <button className="btn" onClick={() => startReconciling(c.id)} title="Freeze writes, keep commentary open">
                        <ClipboardCheck className="w-3.5 h-3.5" /> Reconcile
                      </button>
                    )}
                    {(c.status === "reconciling" || c.status === "editing") && canLock && (
                      <button className="btn" onClick={() => lockCycle(c.id)} title="Snapshot cells and lock — controller only">
                        <Lock className="w-3.5 h-3.5" /> Lock
                      </button>
                    )}
                    {c.status === "locked" && canLock && (
                      <button className="btn" onClick={() => archiveCycle(c.id)}>
                        <Archive className="w-3.5 h-3.5" /> Archive
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-fg-muted mt-2">
            Flow: <strong>open</strong> → <strong>editing</strong> (writes allowed) → <strong>reconciling</strong> (writes blocked, commentary open) →
            <strong> locked</strong> (snapshot frozen) → <strong>archived</strong>. Lock / archive require Controller.
          </p>
        </div>

        <div className="card p-4 space-y-3">
          <h2 className="text-sm font-semibold">Your view</h2>
          <div className="flex items-center justify-between gap-2">
            <label className="text-sm text-fg-muted">Role (for demo)</label>
            <select className="input !w-auto" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-between gap-2">
            <label className="text-sm text-fg-muted">Theme</label>
            <div className="flex gap-1">
              <button className={theme === "light" ? "pill-brand" : "chip"} onClick={() => setTheme("light")}>Light</button>
              <button className={theme === "dark" ? "pill-brand" : "chip"} onClick={() => setTheme("dark")}>Dark</button>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <label className="text-sm text-fg-muted">Grid density</label>
            <div className="flex gap-1">
              <button className={density === "comfortable" ? "pill-brand" : "chip"} onClick={() => setDensity("comfortable")}>Comfortable</button>
              <button className={density === "compact" ? "pill-brand" : "chip"} onClick={() => setDensity("compact")}>Compact</button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="card p-4">
          <h2 className="text-sm font-semibold mb-3">Production Units</h2>
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="table-th">Short name</th>
                <th className="table-th">Display name</th>
                <th className="table-th">Code</th>
                <th className="table-th text-right">Active</th>
              </tr>
            </thead>
            <tbody>
              {pus.map((p) => (
                <tr key={p.code}>
                  <td className="table-td font-medium">{p.shortName}</td>
                  <td className="table-td">{p.displayName}</td>
                  <td className="table-td font-mono text-[11px]">{p.code}</td>
                  <td className="table-td text-right">{p.active ? <Check className="w-4 h-4 text-success inline" /> : <X className="w-4 h-4 text-danger inline" />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card p-4">
          <h2 className="text-sm font-semibold mb-3">Market Units</h2>
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="table-th">Code</th>
                <th className="table-th">Display</th>
                <th className="table-th">SBU</th>
              </tr>
            </thead>
            <tbody>
              {mus.map((m) => (
                <tr key={m.code}>
                  <td className="table-td font-mono text-[11px]">{m.code}</td>
                  <td className="table-td">{m.displayName}</td>
                  <td className="table-td text-fg-muted">{m.sbu}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div className="mb-2">
          <h2 className="text-sm font-semibold">HR Mapping</h2>
          <p className="text-[11px] text-fg-muted">
            Source HR-file values mapped to PracticeView&apos;s nice names. Used by the HR Database import.
          </p>
        </div>
        <HrMappingEditor />
      </div>

      <div className="card p-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <CalendarDays className="w-4 h-4" /> Working calendar
          </h2>
          <div className="flex items-center gap-2">
            <label className="text-xs text-fg-muted">Year</label>
            <input
              type="number"
              className="input !w-24"
              value={calendarYear}
              onChange={(e) => setCalendarYear(Number(e.target.value) || defaultYear)}
            />
            <button
              className="btn"
              onClick={() => {
                if (confirm(`Reset working calendar to defaults (2024–2028)? Any manual edits will be lost.`)) {
                  resetWorkingCalendar();
                }
              }}
              title="Recompute from Polish public holidays (8h/day)"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reset to defaults
            </button>
          </div>
        </div>
        <p className="text-xs text-fg-muted mb-2">
          Working days and hours per period. Used app-wide for FTE ↔ hours conversions (project staffing, ARVE,
          People views). Defaults are derived from Polish public holidays × 8h.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="table-th">Period</th>
                <th className="table-th text-right">Working days</th>
                <th className="table-th text-right">Working hours</th>
                <th className="table-th text-right">Hours / day</th>
                <th className="table-th text-right"></th>
              </tr>
            </thead>
            <tbody>
              {calendarRows.map(({ period, entry }) => {
                const dflt = defaultEntryForPeriod(period);
                const isCustom = entry.workingDays !== dflt.workingDays || entry.workingHours !== dflt.workingHours;
                const hoursPerDay = entry.workingDays > 0 ? entry.workingHours / entry.workingDays : 0;
                return (
                  <tr key={period} className="hover:bg-bg-hover">
                    <td className="table-td font-mono text-[12px]">{period}</td>
                    <td className="table-td text-right">
                      <input
                        type="number"
                        className="input !w-20 text-right"
                        value={entry.workingDays}
                        min={0}
                        max={31}
                        onChange={(e) =>
                          setWorkingCalendarEntry(period, { workingDays: Math.max(0, Number(e.target.value) || 0) })
                        }
                      />
                    </td>
                    <td className="table-td text-right">
                      <input
                        type="number"
                        className="input !w-24 text-right"
                        value={entry.workingHours}
                        min={0}
                        max={400}
                        onChange={(e) =>
                          setWorkingCalendarEntry(period, { workingHours: Math.max(0, Number(e.target.value) || 0) })
                        }
                      />
                    </td>
                    <td className="table-td text-right text-fg-muted tabular-nums">
                      {hoursPerDay > 0 ? hoursPerDay.toFixed(1) : "—"}
                    </td>
                    <td className="table-td text-right">
                      {isCustom && (
                        <button
                          className="btn-ghost text-[11px]"
                          onClick={() => setWorkingCalendarEntry(period, { workingDays: dflt.workingDays, workingHours: dflt.workingHours })}
                          title="Revert this period to default"
                        >
                          revert
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              <tr className="bg-bg-muted font-semibold border-t-2 border-border">
                <td className="table-td">Year {calendarYear}</td>
                <td className="table-td text-right tabular-nums">{yearDays}</td>
                <td className="table-td text-right tabular-nums">{yearHours}</td>
                <td className="table-td text-right text-fg-muted tabular-nums">
                  {yearDays > 0 ? (yearHours / yearDays).toFixed(1) : "—"}
                </td>
                <td className="table-td"></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <AdminDataBackup />

      <div className="card p-4">
        <h2 className="text-sm font-semibold mb-3">RBAC matrix</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="table-th">Capability</th>
                {ROLES.map((r) => (
                  <th key={r.value} className="table-th text-center">{r.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {RBAC_ROWS.map((row) => (
                <tr key={row.cap}>
                  <td className="table-td">{row.cap}</td>
                  {row.access.map((a, i) => (
                    <td key={i} className="table-td text-center">{a === "full" ? "✓" : a === "partial" ? "◐" : "—"}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function cycleStatusChip(status: CycleStatus): string {
  switch (status) {
    case "open":
      return "pill-brand";
    case "editing":
      return "pill-success";
    case "reconciling":
      return "pill-warning";
    case "locked":
      return "chip";
    case "archived":
      return "chip opacity-70";
    default:
      return "chip";
  }
}

const RBAC_ROWS: Array<{ cap: string; access: Array<"full" | "partial" | "none"> }> = [
  { cap: "View cockpit", access: ["full", "full", "full", "full", "full"] },
  { cap: "Edit forecast (own PU)", access: ["full", "full", "none", "none", "none"] },
  { cap: "Edit forecast (any PU)", access: ["full", "none", "none", "none", "none"] },
  { cap: "Approve cycle", access: ["full", "none", "none", "none", "none"] },
  { cap: "Run ingestion", access: ["full", "none", "none", "none", "none"] },
  { cap: "Edit HR mappings", access: ["full", "none", "none", "none", "none"] },
  { cap: "Import HR data", access: ["full", "none", "none", "full", "none"] },
  { cap: "Override staleness on HR import", access: ["full", "none", "none", "none", "none"] },
  { cap: "View employee PII", access: ["full", "partial", "full", "full", "none"] },
  { cap: "View costs", access: ["full", "none", "full", "none", "none"] },
  { cap: "Create scenario", access: ["full", "full", "full", "none", "none"] },
  { cap: "Promote scenario", access: ["full", "none", "none", "none", "none"] },
  { cap: "Generate review pack", access: ["full", "none", "full", "none", "none"] },
];
