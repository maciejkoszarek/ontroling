import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAppStore } from "../store";
import { ArrowLeft, ArrowRightLeft, Briefcase, ChevronLeft, ChevronRight, MapPin, Pencil, Plus, TrendingUp, User, UserMinus, X } from "lucide-react";
import { cn, formatPct, formatNumber, activeCycleYear } from "../lib/utils";
import { puLabel, puDisplay, rollingPeriods, DEMO_ANCHOR_PERIOD } from "../lib/demoData";
import { HOURS_PER_WORKING_DAY } from "../lib/workingDays";
import { buildDaysByPeriod, buildHoursByPeriod } from "../lib/workingCalendar";
import ReactECharts from "echarts-for-react";
import { AddLeaverModal, AssignProjectModal, EditPersonModal, PromoteModal, TransferModal } from "../components/forms/PeopleForms";
import EmployeeChangeHistory from "../components/people/EmployeeChangeHistory";

function EditableHourCell({
  hours,
  unit,
  isCurrentMonth,
  isFuture,
  fullHoursForMonth,
  onCommit,
}: {
  hours: number;
  unit: "hours" | "fte";
  isCurrentMonth?: boolean;
  isFuture?: boolean;
  fullHoursForMonth: number;
  onCommit: (raw: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const fte = fullHoursForMonth > 0 ? hours / fullHoursForMonth : 0;
  const display =
    hours === 0
      ? ""
      : unit === "hours"
      ? formatNumber(hours, 0)
      : formatNumber(fte, 2);

  function startEdit() {
    if (editing) return;
    setDraft(
      hours === 0 ? "" : unit === "hours" ? String(hours) : fte.toFixed(2),
    );
    setEditing(true);
  }

  function commit() {
    onCommit(draft);
    setEditing(false);
  }

  const bg = isCurrentMonth ? "bg-brand/10" : isFuture ? "bg-brand/[0.03]" : "";

  if (editing) {
    return (
      <td className={cn("table-td p-0", bg)}>
        <div className="relative ring-2 ring-brand ring-inset bg-bg-card">
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") setEditing(false);
            }}
            className="w-full text-right tabular-nums px-2 py-1.5 bg-transparent focus:outline-none text-sm"
            placeholder={unit === "hours" ? "hours" : "FTE"}
          />
          <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[9px] font-mono text-brand pointer-events-none bg-bg-card px-1">
            {unit === "hours" ? "h" : "fte"}
          </span>
        </div>
      </td>
    );
  }

  return (
    <td
      className={cn(
        "table-td text-right tabular-nums p-0",
        bg,
      )}
      title={hours > 0 ? `${formatNumber(hours, 0)} h · ${formatNumber(fte, 2)} FTE — click to edit` : "Click to add hours"}
    >
      <button
        type="button"
        onClick={startEdit}
        className={cn(
          "relative w-full h-full px-2 py-1.5 text-right transition group/cell",
          "hover:bg-brand/10 hover:ring-1 hover:ring-brand/60 hover:ring-inset",
          "focus:outline-none focus:ring-2 focus:ring-brand focus:ring-inset",
          hours > 0 && fte >= 0.9 && "text-brand font-medium",
          hours === 0 && "text-fg-subtle",
        )}
      >
        {hours === 0 ? (
          <span className="inline-flex items-center justify-end gap-1">
            <span className="group-hover/cell:hidden">—</span>
            <Plus className="w-3 h-3 hidden group-hover/cell:inline text-brand" />
          </span>
        ) : (
          <span className="inline-flex items-center justify-end gap-1">
            <Pencil className="w-2.5 h-2.5 opacity-0 group-hover/cell:opacity-60 text-brand" />
            <span className="border-b border-dashed border-transparent group-hover/cell:border-brand/40 transition-colors">
              {display}
            </span>
          </span>
        )}
      </button>
    </td>
  );
}

export default function PersonDetail() {
  const { localNumber = "" } = useParams<{ localNumber: string }>();
  const employees = useAppStore((s) => s.employees);
  const snapshots = useAppStore((s) => s.snapshots);
  const gfsHours = useAppStore((s) => s.gfsHours);
  const projects = useAppStore((s) => s.projects);
  const locations = useAppStore((s) => s.locations);
  const unassign = useAppStore((s) => s.unassignEmployeeFromProject);
  const assign = useAppStore((s) => s.assignEmployeeToProject);
  const transfers = useAppStore((s) => s.transfers);
  const promotions = useAppStore((s) => s.promotions);
  const workingCalendar = useAppStore((s) => s.workingCalendar);
  const cycles = useAppStore((s) => s.cycles);
  const activeCycleId = useAppStore((s) => s.activeCycleId);
  const [modal, setModal] = useState<null | "transfer" | "leaver" | "assign" | "edit" | "promote">(null);
  const [showUnit, setShowUnit] = useState<"hours" | "fte">("hours");
  const [year, setYear] = useState<number>(() => activeCycleYear(cycles, activeCycleId));

  const employee = employees.find((e) => e.localNumber === localNumber);

  const personSnaps = useMemo(
    () => snapshots.filter((s) => s.employeeLocalNumber === localNumber).sort((a, b) => a.period.localeCompare(b.period)),
    [snapshots, localNumber],
  );

  const personHours = useMemo(
    () => gfsHours.filter((g) => g.employeeLocalNumber === localNumber && !g.projectNumber.startsWith("_") && g.hours > 0),
    [gfsHours, localNumber],
  );

  if (!employee) {
    return (
      <div className="card p-4">
        <Link to="/people" className="text-sm text-brand">← Back to people</Link>
        <p className="mt-2 text-sm">Person not found.</p>
      </div>
    );
  }

  const locName = locations.find((l) => l.code === employee.locationCode)?.displayName ?? employee.locationCode;
  const projByNumber = new Map(projects.map((p) => [p.projectNumber, p]));

  const arveSeries = rollingPeriods.map((p) => {
    const s = personSnaps.find((x) => x.period === p);
    return s ? Math.round(s.arve * 1000) / 10 : 0;
  });

  // Calendar-year view: 12 months of selected year
  const horizon = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
  const horizonSet = new Set(horizon);
  const workingDaysByPeriod = buildDaysByPeriod(workingCalendar, horizon);
  const fullHoursByPeriod = buildHoursByPeriod(workingCalendar, horizon);
  const yearFullHours = horizon.reduce((s, p) => s + (fullHoursByPeriod.get(p) ?? 0), 0);
  const yearWorkingDays = yearFullHours / HOURS_PER_WORKING_DAY;
  const projectMatrix = new Map<string, Map<string, number>>();
  const projTotals = new Map<string, number>();
  for (const g of personHours) {
    projTotals.set(g.projectNumber, (projTotals.get(g.projectNumber) ?? 0) + g.hours);
    if (!horizonSet.has(g.period)) continue;
    let row = projectMatrix.get(g.projectNumber);
    if (!row) {
      row = new Map<string, number>();
      projectMatrix.set(g.projectNumber, row);
    }
    row.set(g.period, (row.get(g.period) ?? 0) + g.hours);
  }

  const nowPeriod = DEMO_ANCHOR_PERIOD;
  const projectList = Array.from(projTotals.entries())
    .map(([pn, hours]) => {
      const proj = projByNumber.get(pn);
      const row = projectMatrix.get(pn);
      const nowHours = row?.get(nowPeriod) ?? 0;
      const horizonHours = horizon.reduce((s, p) => s + (row?.get(p) ?? 0), 0);
      const isActive = (proj?.status === "active") && horizonHours > 0;
      return { proj, pn, hours, nowHours, horizonHours, isActive };
    })
    .sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      if (a.nowHours !== b.nowHours) return b.nowHours - a.nowHours;
      return b.horizonHours - a.horizonHours;
    });

  function commitHours(pn: string, period: string, raw: string) {
    const n = Number(raw.replace(",", ".").replace(/[^\d.]/g, ""));
    const fullHours = fullHoursByPeriod.get(period) ?? 160;
    const hours = !Number.isFinite(n) ? 0 : showUnit === "fte" ? Math.round(n * fullHours) : Math.round(n);
    if (hours <= 0) {
      unassign({ localNumber, projectNumber: pn, period });
      return;
    }
    const existing = gfsHours.find(
      (g) => g.employeeLocalNumber === localNumber && g.projectNumber === pn && g.period === period,
    );
    const proj = projByNumber.get(pn);
    const projectType = existing?.projectType ?? (proj?.isBillable ? "External Services" : "Management Resource");
    assign({ localNumber, projectNumber: pn, period, hours, projectType });
  }

  const latestArve = personSnaps.length > 0 ? personSnaps[personSnaps.length - 1].arve : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm">
        <Link to="/people" className="inline-flex items-center gap-1 text-fg-muted hover:text-brand">
          <ArrowLeft className="w-4 h-4" /> People
        </Link>
      </div>

      <div className="card p-4 flex items-start gap-4 flex-wrap">
        <div className="rounded-full bg-brand/10 w-14 h-14 flex items-center justify-center">
          <User className="w-7 h-7 text-brand" />
        </div>
        <div className="flex-1 min-w-[240px]">
          <h1 className="text-xl font-semibold">{employee.displayName}</h1>
          <div className="flex items-center gap-3 mt-1 text-sm text-fg-muted flex-wrap">
            <span className="font-mono text-[11px]">{employee.localNumber}</span>
            <span>·</span>
            <span>{puDisplay(employee.puCode)} ({puLabel(employee.puCode)})</span>
            <span>·</span>
            <span>Grade {employee.gradeCode}</span>
            <span>·</span>
            <span><MapPin className="inline w-3 h-3 mr-0.5" />{locName}</span>
            <span>·</span>
            <span>Since {employee.startDate}</span>
          </div>
          {employee.skills.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {employee.skills.map((s) => <span key={s} className="chip">{s}</span>)}
            </div>
          )}
        </div>
        <div className="text-right">
          <div className="text-xs uppercase text-fg-muted tracking-wider">Latest ARVE</div>
          <div className={`text-2xl font-semibold mt-1 ${latestArve < 0.65 ? "text-danger" : latestArve < 0.8 ? "text-warning" : "text-success"}`}>
            {formatPct(latestArve, 0)}
          </div>
          <div className="mt-3 flex items-center gap-2 flex-wrap justify-end">
            <button className="btn" onClick={() => setModal("edit")}>
              <Pencil className="w-3.5 h-3.5" /> Edit
            </button>
            {!employee.endDate && (
              <button className="btn" onClick={() => setModal("promote")}>
                <TrendingUp className="w-3.5 h-3.5" /> Promote
              </button>
            )}
            <button className="btn" onClick={() => setModal("transfer")}>
              <ArrowRightLeft className="w-3.5 h-3.5" /> Transfer
            </button>
            <button className="btn" onClick={() => setModal("assign")}>
              <Briefcase className="w-3.5 h-3.5" /> Assign project
            </button>
            {!employee.endDate && (
              <button className="btn" onClick={() => setModal("leaver")}>
                <UserMinus className="w-3.5 h-3.5" /> Mark leaver
              </button>
            )}
          </div>
        </div>
      </div>

      <TransferModal open={modal === "transfer"} onClose={() => setModal(null)} preselectLocalNumber={localNumber} />
      <AddLeaverModal open={modal === "leaver"} onClose={() => setModal(null)} preselectLocalNumber={localNumber} />
      <AssignProjectModal open={modal === "assign"} onClose={() => setModal(null)} preselectLocalNumber={localNumber} />
      <EditPersonModal open={modal === "edit"} onClose={() => setModal(null)} preselectLocalNumber={localNumber} />
      <PromoteModal open={modal === "promote"} onClose={() => setModal(null)} preselectLocalNumber={localNumber} />

      {promotions.filter((p) => p.employeeLocalNumber === localNumber).length > 0 && (
        <div className="card p-4">
          <h2 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-brand" /> Promotion history
          </h2>
          <ul className="space-y-1 text-sm">
            {promotions
              .filter((p) => p.employeeLocalNumber === localNumber)
              .slice()
              .sort((a, b) => b.effectivePeriod.localeCompare(a.effectivePeriod))
              .map((p) => (
                <li key={p.id} className="flex items-center justify-between">
                  <span>
                    <span className="font-mono text-xs">{p.effectivePeriod}</span> — Grade {p.fromGradeCode} → <strong>{p.toGradeCode}</strong>
                    {p.reason && <span className="text-fg-muted"> · {p.reason}</span>}
                  </span>
                  <span className="text-[11px] text-fg-muted">{p.recordedAt.slice(0, 10)} · {p.recordedBy}</span>
                </li>
              ))}
          </ul>
        </div>
      )}

      {transfers.filter((t) => t.employeeLocalNumber === localNumber).length > 0 && (
        <div className="card p-4">
          <h2 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4 text-brand" /> PU transfer history
          </h2>
          <ul className="space-y-1 text-sm">
            {transfers
              .filter((t) => t.employeeLocalNumber === localNumber)
              .map((t) => (
                <li key={t.id} className="flex items-center justify-between">
                  <span>
                    <span className="font-mono text-xs">{t.effectivePeriod}</span> — {puLabel(t.fromPuCode)} → <strong>{puLabel(t.toPuCode)}</strong>
                    {t.reason && <span className="text-fg-muted"> · {t.reason}</span>}
                  </span>
                  <span className="text-[11px] text-fg-muted">{t.recordedAt.slice(0, 10)} · {t.recordedBy}</span>
                </li>
              ))}
          </ul>
        </div>
      )}

      <EmployeeChangeHistory localNumber={localNumber} />

      <div className="card p-4">
        <h2 className="text-sm font-semibold mb-2">ARVE trend</h2>
        <ReactECharts
          style={{ height: 220 }}
          option={{
            grid: { left: 40, right: 16, top: 16, bottom: 32 },
            tooltip: { trigger: "axis" },
            xAxis: { type: "category", data: rollingPeriods.map((p) => p.slice(5, 7) + "/" + p.slice(2, 4)) },
            yAxis: { type: "value", max: 110, axisLabel: { formatter: "{value}%" } },
            series: [
              {
                type: "line",
                data: arveSeries,
                smooth: true,
                itemStyle: { color: "#2563eb" },
                areaStyle: { opacity: 0.1 },
                markLine: { silent: true, data: [{ yAxis: 65, lineStyle: { color: "#dc2626", type: "dashed" } }, { yAxis: 80, lineStyle: { color: "#d97706", type: "dashed" } }] },
              },
            ],
          }}
        />
      </div>

      <div className="card p-0 overflow-x-auto">
        <div className="px-4 py-3 flex items-center justify-between flex-wrap gap-2 border-b border-border">
          <div>
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Briefcase className="w-4 h-4" />
              Project assignments
            </h2>
            <p className="text-xs text-fg-muted mt-0.5">
              Click any cell to edit. Active projects appear first. Empty value removes the assignment.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center border border-border rounded-md overflow-hidden text-xs">
              <button
                className="px-1.5 py-1 hover:bg-bg-muted"
                onClick={() => setYear((y) => y - 1)}
                title="Previous year"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="px-2.5 py-1 font-semibold tabular-nums min-w-[48px] text-center">{year}</span>
              <button
                className="px-1.5 py-1 hover:bg-bg-muted"
                onClick={() => setYear((y) => y + 1)}
                title="Next year"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="inline-flex items-center border border-border rounded-md overflow-hidden text-xs">
              <button
                className={cn("px-2 py-1", showUnit === "hours" ? "bg-brand text-white" : "hover:bg-bg-muted")}
                onClick={() => setShowUnit("hours")}
              >
                Hours
              </button>
              <button
                className={cn("px-2 py-1", showUnit === "fte" ? "bg-brand text-white" : "hover:bg-bg-muted")}
                onClick={() => setShowUnit("fte")}
              >
                FTE
              </button>
            </div>
            <button className="btn" onClick={() => setModal("assign")}>
              <Briefcase className="w-3.5 h-3.5" /> Add project
            </button>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="table-th">Project</th>
              <th className="table-th">MU</th>
              {horizon.map((p) => {
                const wd = workingDaysByPeriod.get(p) ?? 0;
                const fh = fullHoursByPeriod.get(p) ?? 0;
                return (
                  <th
                    key={p}
                    className={cn(
                      "table-th text-right whitespace-nowrap",
                      p === nowPeriod && "bg-brand/10 text-brand",
                    )}
                    title={`${p} — ${wd} working days (${fh} h at 1.0 FTE, Polish calendar)`}
                  >
                    <div>{p.slice(5, 7)}/{p.slice(2, 4)}</div>
                    <div className="text-[10px] font-normal text-fg-muted tabular-nums">{wd}d · {fh}h</div>
                  </th>
                );
              })}
              <th className="table-th text-right">
                <div>Total {year}</div>
                <div className="text-[10px] font-normal text-fg-muted tabular-nums">{yearWorkingDays}d · {yearFullHours}h</div>
              </th>
              <th className="table-th"></th>
            </tr>
          </thead>
          <tbody>
            {projectList.map((pr) => {
              const row = projectMatrix.get(pr.pn);
              const total = horizon.reduce((s, p) => s + (row?.get(p) ?? 0), 0);
              return (
                <tr key={pr.pn} className="hover:bg-bg-hover group">
                  <td className="table-td">
                    <div className="flex items-center gap-2">
                      <Link to={`/projects/${pr.pn}`} className="hover:text-brand font-medium">
                        {pr.proj?.name ?? pr.pn}
                      </Link>
                      {pr.isActive && (
                        <span className="chip !text-[10px] !px-1.5 !py-0 bg-success/10 text-success border-success/20">Active</span>
                      )}
                      {pr.proj?.status === "completed" && (
                        <span className="chip !text-[10px] !px-1.5 !py-0 text-fg-muted">Done</span>
                      )}
                    </div>
                    <div className="text-[11px] text-fg-muted">{pr.proj?.customer ?? ""} · <span className="font-mono">{pr.pn}</span></div>
                  </td>
                  <td className="table-td">{pr.proj?.marketUnit ?? ""}</td>
                  {horizon.map((p) => {
                    const h = row?.get(p) ?? 0;
                    return (
                      <EditableHourCell
                        key={p}
                        hours={h}
                        unit={showUnit}
                        isCurrentMonth={p === nowPeriod}
                        isFuture={p > nowPeriod}
                        fullHoursForMonth={fullHoursByPeriod.get(p) ?? 160}
                        onCommit={(raw) => commitHours(pr.pn, p, raw)}
                      />
                    );
                  })}
                  <td className="table-td text-right tabular-nums font-semibold">
                    {showUnit === "hours"
                      ? formatNumber(total, 0)
                      : formatNumber(yearFullHours > 0 ? total / yearFullHours : 0, 2)}
                  </td>
                  <td className="table-td text-right">
                    <button
                      className="btn-ghost opacity-0 group-hover:opacity-100 transition"
                      title="Remove all assignments for this project"
                      onClick={() => {
                        for (const p of horizon) {
                          if ((row?.get(p) ?? 0) > 0) unassign({ localNumber, projectNumber: pr.pn, period: p });
                        }
                      }}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
            {projectList.length === 0 && (
              <tr>
                <td colSpan={horizon.length + 4} className="table-td text-center text-fg-muted py-6">No project assignments recorded.</td>
              </tr>
            )}
          </tbody>
          {projectList.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-border bg-bg-muted/40 font-semibold">
                <td className="table-td" colSpan={2}>
                  <span className="uppercase text-[11px] tracking-wider text-fg-muted">Total</span>
                </td>
                {horizon.map((p) => {
                  const colTotal = projectList.reduce(
                    (s, pr) => s + (projectMatrix.get(pr.pn)?.get(p) ?? 0),
                    0,
                  );
                  const fullHours = fullHoursByPeriod.get(p) ?? 160;
                  const expected = Math.round(fullHours * employee.fteCapacity);
                  const tone =
                    colTotal === 0
                      ? ""
                      : colTotal > expected
                      ? "text-danger font-semibold"
                      : colTotal === expected
                      ? "text-success font-semibold"
                      : "text-warning";
                  const fteDisplay = fullHours > 0 ? colTotal / fullHours : 0;
                  return (
                    <td
                      key={p}
                      className={cn(
                        "table-td text-right tabular-nums",
                        p === nowPeriod && "bg-brand/10",
                        tone,
                      )}
                      title={`${formatNumber(colTotal, 0)} h · ${formatNumber(fteDisplay, 2)} FTE — full ${employee.fteCapacity} FTE for this month = ${expected} h`}
                    >
                      {colTotal === 0
                        ? "—"
                        : showUnit === "hours"
                        ? formatNumber(colTotal, 0)
                        : formatNumber(fteDisplay, 2)}
                    </td>
                  );
                })}
                <td className="table-td text-right tabular-nums">
                  {(() => {
                    const grand = projectList.reduce(
                      (s, pr) =>
                        s +
                        horizon.reduce(
                          (ss, p) => ss + (projectMatrix.get(pr.pn)?.get(p) ?? 0),
                          0,
                        ),
                      0,
                    );
                    return showUnit === "hours"
                      ? formatNumber(grand, 0)
                      : formatNumber(yearFullHours > 0 ? grand / yearFullHours : 0, 2);
                  })()}
                </td>
                <td className="table-td"></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
