import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAppStore } from "../store";
import { aggregateProjects, year2026Periods, employeeMap } from "../lib/projectHelpers";
import { cn, formatNumber, formatPct } from "../lib/utils";
import { ArrowLeft, Briefcase, Building2, Users, UserPlus, X } from "lucide-react";
import ReactECharts from "echarts-for-react";
import KpiCard from "../components/KpiCard";
import { currentPeriod, puLabel } from "../lib/demoData";
import { AssignProjectModal } from "../components/forms/PeopleForms";

const HOURS_PER_FTE = 160;
const PERIODS = year2026Periods();

export default function ProjectDetail() {
  const { projectNumber = "" } = useParams<{ projectNumber: string }>();
  const projects = useAppStore((s) => s.projects);
  const mus = useAppStore((s) => s.marketUnits);
  const gfsHours = useAppStore((s) => s.gfsHours);
  const snapshots = useAppStore((s) => s.snapshots);
  const employees = useAppStore((s) => s.employees);

  const unassign = useAppStore((s) => s.unassignEmployeeFromProject);
  const project = projects.find((p) => p.projectNumber === projectNumber);
  const periods = PERIODS;
  const aggMap = useMemo(() => aggregateProjects(gfsHours, snapshots), [gfsHours, snapshots]);
  const empMap = useMemo(() => employeeMap(employees), [employees]);
  const [selectedPeriod, setSelectedPeriod] = useState(currentPeriod);
  const [assignOpen, setAssignOpen] = useState(false);
  const [showUnit, setShowUnit] = useState<"hours" | "fte">("hours");

  const monthly = useMemo(() => {
    if (!project) return [];
    return periods.map((p) => {
      const agg = aggMap.get(`${project.projectNumber}::${p}`);
      const fte = agg?.fte ?? 0;
      return {
        period: p,
        hc: agg?.people.length ?? 0,
        fte,
        bfte: project.isBillable ? fte : 0,
        arve: agg?.arve ?? 0,
      };
    });
  }, [aggMap, project, periods]);

  const personMatrix = useMemo(() => {
    if (!project) return [];
    const all = new Map<string, Map<string, number>>();
    for (const p of periods) {
      const agg = aggMap.get(`${project.projectNumber}::${p}`);
      if (!agg) continue;
      for (const [ln, hours] of agg.peopleHours.entries()) {
        let inner = all.get(ln);
        if (!inner) {
          inner = new Map();
          all.set(ln, inner);
        }
        inner.set(p, hours);
      }
    }
    return Array.from(all.entries())
      .map(([ln, byPeriod]) => {
        const e = empMap.get(ln);
        const total = periods.reduce((s, p) => s + (byPeriod.get(p) ?? 0), 0);
        const activeMonths = periods.filter((p) => (byPeriod.get(p) ?? 0) > 0).length;
        return { localNumber: ln, e, byPeriod, total, activeMonths };
      })
      .filter((r) => r.e)
      .sort((a, b) => b.total - a.total);
  }, [aggMap, project, empMap, periods]);

  if (!project) {
    return (
      <div className="card p-4">
        <Link to="/projects" className="text-sm text-brand">← Back to projects</Link>
        <p className="mt-2 text-sm">Project not found.</p>
      </div>
    );
  }

  const muName = mus.find((m) => m.code === project.marketUnit)?.displayName ?? project.marketUnit;

  const fteSeries = periods.map((p) => aggMap.get(`${project.projectNumber}::${p}`)?.fte ?? 0);
  const arveSeries = periods.map((p) => {
    const a = aggMap.get(`${project.projectNumber}::${p}`)?.arve ?? 0;
    return Math.round(a * 1000) / 10; // 0..100+
  });

  const selectedAgg = aggMap.get(`${project.projectNumber}::${selectedPeriod}`);

  const totalFteCurrent = selectedAgg?.fte ?? 0;
  const totalHoursCurrent = selectedAgg?.totalHours ?? 0;
  const arveCurrent = selectedAgg?.arve ?? 0;
  const peopleCountCurrent = selectedAgg?.people.length ?? 0;

  const chartOption = {
    grid: { left: 48, right: 48, top: 24, bottom: 40 },
    tooltip: { trigger: "axis" },
    legend: { bottom: 0 },
    xAxis: { type: "category", data: periods.map((p) => p.slice(5, 7) + "/26") },
    yAxis: [
      { type: "value", name: "FTE", position: "left" },
      { type: "value", name: "ARVE %", position: "right", min: 0, max: 110, axisLabel: { formatter: "{value}%" } },
    ],
    series: [
      { name: "FTE demand", type: "bar", data: fteSeries, itemStyle: { color: "#2563eb" }, yAxisIndex: 0 },
      { name: "ARVE %", type: "line", data: arveSeries, smooth: true, itemStyle: { color: "#16a34a" }, yAxisIndex: 1 },
    ],
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm">
        <Link to="/projects" className="inline-flex items-center gap-1 text-fg-muted hover:text-brand">
          <ArrowLeft className="w-4 h-4" /> Projects
        </Link>
      </div>

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-brand" />
            {project.name}
          </h1>
          <div className="flex items-center gap-3 mt-1 text-sm text-fg-muted">
            <span><Building2 className="inline w-3.5 h-3.5 mr-1" />{project.customer}</span>
            <span>·</span>
            <span>{muName}</span>
            <span>·</span>
            <span className="font-mono text-[11px]">{project.projectNumber}</span>
            <span className={project.isBillable ? "pill-success" : "chip"}>
              {project.isBillable ? "billable" : "overhead"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-primary" onClick={() => setAssignOpen(true)}>
            <UserPlus className="w-4 h-4" /> Assign person
          </button>
          <label className="text-xs text-fg-muted">Month</label>
          <select className="input !w-auto" value={selectedPeriod} onChange={(e) => setSelectedPeriod(e.target.value)}>
            {periods.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
      </div>

      <AssignProjectModal
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        preselectProjectNumber={project.projectNumber}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label={`FTE · ${selectedPeriod}`} value={totalFteCurrent} fractionDigits={1} />
        <KpiCard label={`Hours · ${selectedPeriod}`} value={totalHoursCurrent} fractionDigits={0} />
        <KpiCard label={`Project ARVE · ${selectedPeriod}`} value={arveCurrent * 100} fractionDigits={1} unit="%" tone={arveCurrent < 0.65 ? "danger" : arveCurrent < 0.8 ? "warning" : "success"} />
        <KpiCard label={`People assigned · ${selectedPeriod}`} value={peopleCountCurrent} fractionDigits={0} />
      </div>

      <div className="card p-4">
        <h2 className="text-sm font-semibold mb-2">FTE demand & ARVE — 2026</h2>
        <ReactECharts style={{ height: 320 }} option={chartOption} />
      </div>

      <div className="card p-0 overflow-x-auto">
        <div className="px-4 py-3 flex items-center justify-between flex-wrap gap-2 border-b border-border">
          <h2 className="text-sm font-semibold">Monthly totals — 2026</h2>
          <p className="text-xs text-fg-muted">bFTE counts billable projects only; ARVE is hours-weighted.</p>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr>
              <th className="table-th text-left sticky left-0 bg-bg-card z-10" style={{ minWidth: 120 }}>Metric</th>
              {periods.map((p) => (
                <th
                  key={p}
                  className={cn(
                    "table-th text-right cursor-pointer hover:bg-brand/5",
                    p === selectedPeriod && "bg-brand/10 text-brand",
                  )}
                  onClick={() => setSelectedPeriod(p)}
                  title={`Focus KPIs on ${p}`}
                >
                  {p.slice(5, 7)}/26
                </th>
              ))}
              <th className="table-th text-right" title="Average across 12 months">Avg</th>
            </tr>
          </thead>
          <tbody>
            {[
              { key: "hc", label: "HC", hint: "Distinct people assigned in the month", format: "int" as const, tone: "default" as const },
              { key: "fte", label: "FTE", hint: "Total hours / 160", format: "dec" as const, tone: "default" as const },
              { key: "bfte", label: "bFTE", hint: "Billable FTE — equals FTE for billable projects, 0 for overhead/internal", format: "dec" as const, tone: "brand" as const },
              { key: "arve", label: "ARVE %", hint: "Weighted average ARVE of assigned people", format: "pct" as const, tone: "arve" as const },
            ].map((row) => {
              const vals = monthly.map((m) => m[row.key as "hc" | "fte" | "bfte" | "arve"]);
              const avg = vals.reduce((s, v) => s + v, 0) / (vals.length || 1);
              const fmt = (v: number) =>
                row.format === "int" ? formatNumber(v, 0)
                : row.format === "pct" ? formatPct(v, 1)
                : formatNumber(v, 1);
              return (
                <tr key={row.key} className="hover:bg-bg-hover">
                  <td className="table-td font-medium sticky left-0 bg-bg-card z-10" title={row.hint}>
                    {row.label}
                  </td>
                  {monthly.map((m) => {
                    const v = m[row.key as "hc" | "fte" | "bfte" | "arve"];
                    const arveTone = row.tone === "arve" ? (v < 0.65 ? "text-danger" : v < 0.8 ? "text-warning" : "text-success") : "";
                    return (
                      <td
                        key={m.period}
                        className={cn(
                          "table-td text-right tabular-nums",
                          m.period === selectedPeriod && "bg-brand/5",
                          row.tone === "brand" && "text-brand font-medium",
                          arveTone,
                        )}
                      >
                        {v === 0 && row.key !== "arve" ? <span className="text-fg-subtle">—</span> : fmt(v)}
                      </td>
                    );
                  })}
                  <td className={cn("table-td text-right tabular-nums font-medium", row.tone === "brand" && "text-brand")}>
                    {fmt(avg)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="card p-0 overflow-x-auto">
        <div className="px-4 py-3 flex items-center justify-between flex-wrap gap-2 border-b border-border">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Users className="w-4 h-4" />
            People on project — 2026
            <span className="chip">{personMatrix.length}</span>
          </h2>
          <div className="flex items-center gap-2">
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
            <p className="text-xs text-fg-muted">Click a cell in the selected month to unassign.</p>
          </div>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr>
              <th className="table-th text-left sticky left-0 bg-bg-card z-10" style={{ minWidth: 240 }}>Person</th>
              <th className="table-th text-left">PU · Grade</th>
              {periods.map((p) => (
                <th
                  key={p}
                  className={cn(
                    "table-th text-right cursor-pointer hover:bg-brand/5",
                    p === selectedPeriod && "bg-brand/10 text-brand",
                  )}
                  onClick={() => setSelectedPeriod(p)}
                  style={{ minWidth: 48 }}
                  title={p}
                >
                  {p.slice(5, 7)}
                </th>
              ))}
              <th className="table-th text-right" title="Total across 2026">Total</th>
              <th className="table-th text-right" title="Months with staffing">Months</th>
            </tr>
          </thead>
          <tbody>
            {personMatrix.map((r) => {
              const e = r.e!;
              return (
                <tr key={r.localNumber} className="hover:bg-bg-hover group">
                  <td className="table-td sticky left-0 bg-bg-card z-10 group-hover:bg-bg-hover">
                    <Link to={`/people/${e.localNumber}`} className="font-medium hover:text-brand">
                      {e.displayName}
                    </Link>
                    <div className="text-[10px] text-fg-muted font-mono">{e.localNumber}</div>
                  </td>
                  <td className="table-td text-fg-muted">
                    <span>{puLabel(e.puCode)}</span>
                    <span className="mx-1 text-fg-subtle">·</span>
                    <span>{e.gradeCode}</span>
                  </td>
                  {periods.map((p) => {
                    const hours = r.byPeriod.get(p) ?? 0;
                    const fte = hours / HOURS_PER_FTE;
                    const isSelected = p === selectedPeriod;
                    const display = hours === 0
                      ? <span className="text-fg-subtle">—</span>
                      : showUnit === "hours" ? formatNumber(hours, 0) : formatNumber(fte, 2);
                    const canUnassign = hours > 0 && isSelected;
                    return (
                      <td
                        key={p}
                        className={cn(
                          "table-td text-right tabular-nums relative",
                          isSelected && "bg-brand/5",
                          hours > 0 && fte >= 0.9 && "text-brand font-medium",
                          canUnassign && "cursor-pointer hover:bg-danger/10",
                        )}
                        title={hours > 0 ? `${formatNumber(hours, 0)} h · ${formatNumber(fte, 2)} FTE${canUnassign ? " · click to unassign" : ""}` : undefined}
                        onClick={canUnassign ? () => unassign({ localNumber: e.localNumber, projectNumber: project.projectNumber, period: p }) : undefined}
                      >
                        {canUnassign ? (
                          <span className="inline-flex items-center justify-end gap-1">
                            {display}
                            <X className="w-3 h-3 opacity-0 group-hover:opacity-60" />
                          </span>
                        ) : display}
                      </td>
                    );
                  })}
                  <td className="table-td text-right tabular-nums font-medium">
                    {showUnit === "hours" ? formatNumber(r.total, 0) : formatNumber(r.total / HOURS_PER_FTE, 2)}
                  </td>
                  <td className="table-td text-right tabular-nums text-fg-muted">{r.activeMonths}</td>
                </tr>
              );
            })}
            {personMatrix.length === 0 && (
              <tr>
                <td colSpan={periods.length + 4} className="table-td text-center text-fg-muted py-6">
                  No staffing recorded for 2026.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
