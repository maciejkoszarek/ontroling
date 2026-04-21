import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAppStore } from "../store";
import { ArrowLeft, ArrowRightLeft, Briefcase, MapPin, User, UserMinus, X } from "lucide-react";
import { formatPct, formatNumber } from "../lib/utils";
import { puLabel, puDisplay, rollingPeriods } from "../lib/demoData";
import ReactECharts from "echarts-for-react";
import { AddLeaverModal, AssignProjectModal, TransferModal } from "../components/forms/PeopleForms";

export default function PersonDetail() {
  const { localNumber = "" } = useParams<{ localNumber: string }>();
  const employees = useAppStore((s) => s.employees);
  const snapshots = useAppStore((s) => s.snapshots);
  const gfsHours = useAppStore((s) => s.gfsHours);
  const projects = useAppStore((s) => s.projects);
  const locations = useAppStore((s) => s.locations);
  const unassign = useAppStore((s) => s.unassignEmployeeFromProject);
  const transfers = useAppStore((s) => s.transfers);
  const [modal, setModal] = useState<null | "transfer" | "leaver" | "assign">(null);

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

  // Project history: projectNumber -> totalHours
  const projTotals = new Map<string, number>();
  for (const g of personHours) projTotals.set(g.projectNumber, (projTotals.get(g.projectNumber) ?? 0) + g.hours);
  const projectList = Array.from(projTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([pn, hours]) => ({ proj: projByNumber.get(pn), pn, hours }));

  // Per-month per-project hours matrix (last 12 months visible)
  const horizon = rollingPeriods.slice(-12);
  const projectMatrix = new Map<string, Map<string, number>>();
  for (const g of personHours) {
    if (!horizon.includes(g.period)) continue;
    let row = projectMatrix.get(g.projectNumber);
    if (!row) {
      row = new Map<string, number>();
      projectMatrix.set(g.projectNumber, row);
    }
    row.set(g.period, (row.get(g.period) ?? 0) + g.hours);
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
        <div className="px-4 py-3">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Briefcase className="w-4 h-4" />
            Project assignments
          </h2>
          <p className="text-xs text-fg-muted mt-0.5">Last 12 months of GFS_DB staffing (hours).</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="table-th">Project</th>
              <th className="table-th">MU</th>
              {horizon.map((p) => (
                <th key={p} className="table-th text-right whitespace-nowrap">{p.slice(5, 7)}/{p.slice(2, 4)}</th>
              ))}
              <th className="table-th text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {projectList.map((pr) => {
              const row = projectMatrix.get(pr.pn);
              return (
                <tr key={pr.pn} className="hover:bg-bg-hover group">
                  <td className="table-td">
                    <Link to={`/projects/${pr.pn}`} className="hover:text-brand font-medium">
                      {pr.proj?.name ?? pr.pn}
                    </Link>
                    <div className="text-[11px] text-fg-muted">{pr.proj?.customer ?? ""} · <span className="font-mono">{pr.pn}</span></div>
                  </td>
                  <td className="table-td">{pr.proj?.marketUnit ?? ""}</td>
                  {horizon.map((p) => {
                    const h = row?.get(p) ?? 0;
                    return (
                      <td
                        key={p}
                        className="table-td text-right tabular-nums group/cell"
                        title={h > 0 ? "Click to remove this month" : undefined}
                        onClick={() => {
                          if (h > 0) unassign({ localNumber, projectNumber: pr.pn, period: p });
                        }}
                      >
                        {h > 0 ? (
                          <span className="cursor-pointer group-hover/cell:text-danger">{formatNumber(h, 0)}</span>
                        ) : (
                          <span className="text-fg-subtle">—</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="table-td text-right tabular-nums font-semibold">
                    <span className="inline-flex items-center gap-2">
                      {formatNumber(pr.hours, 0)}
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
                    </span>
                  </td>
                </tr>
              );
            })}
            {projectList.length === 0 && (
              <tr>
                <td colSpan={horizon.length + 3} className="table-td text-center text-fg-muted py-6">No project assignments recorded.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
