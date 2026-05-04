import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAppStore } from "../store";
import { aggregateProjects, getCommitProbability, yearPeriods, employeeMap } from "../lib/projectHelpers";
import { hoursForPeriod, indexWorkingCalendar } from "../lib/workingCalendar";
import { cn, formatNumber, formatPct, activeCycleYear } from "../lib/utils";
import { ArrowLeft, ArrowDown, ArrowUp, Briefcase, Building2, ChevronDown, ChevronRight, Sparkles, Users, UserPlus, Pencil } from "lucide-react";
import ReactECharts from "echarts-for-react";
import KpiCard from "../components/KpiCard";
import { DEMO_ANCHOR_PERIOD, puLabel } from "../lib/demoData";
import { AddPlaceholderModal, AssignProjectModal } from "../components/forms/PeopleForms";
import { ProjectFormModal } from "../components/forms/ProjectForms";

export default function ProjectDetail() {
  const { projectNumber = "" } = useParams<{ projectNumber: string }>();
  const projects = useAppStore((s) => s.projects);
  const mus = useAppStore((s) => s.marketUnits);
  const gfsHours = useAppStore((s) => s.gfsHours);
  const snapshots = useAppStore((s) => s.snapshots);
  const employees = useAppStore((s) => s.employees);
  const cycles = useAppStore((s) => s.cycles);
  const activeCycleId = useAppStore((s) => s.activeCycleId);
  const workingCalendar = useAppStore((s) => s.workingCalendar);

  const unassign = useAppStore((s) => s.unassignEmployeeFromProject);
  const assign = useAppStore((s) => s.assignEmployeeToProject);
  const updateProject = useAppStore((s) => s.updateProject);
  const project = projects.find((p) => p.projectNumber === projectNumber);
  const activePeriod = cycles.find((c) => c.id === activeCycleId)?.periodOpened;
  const year = activeCycleYear(cycles, activeCycleId);
  const yy = String(year).slice(-2);
  const periods = useMemo(() => yearPeriods(year), [year]);
  const calIdx = useMemo(() => indexWorkingCalendar(workingCalendar), [workingCalendar]);
  const aggMap = useMemo(
    () => aggregateProjects(gfsHours, snapshots, workingCalendar),
    [gfsHours, snapshots, workingCalendar],
  );
  const empMap = useMemo(() => employeeMap(employees), [employees]);
  const yearFullHours = useMemo(
    () => periods.reduce((s, p) => s + hoursForPeriod(calIdx, p), 0),
    [periods, calIdx],
  );
  const avgMonthlyHours = yearFullHours / 12 || 160;
  const [selectedPeriod, setSelectedPeriod] = useState(activePeriod ?? DEMO_ANCHOR_PERIOD);
  const [assignOpen, setAssignOpen] = useState(false);
  const [placeholderOpen, setPlaceholderOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [showUnit, setShowUnit] = useState<"hours" | "fte">("hours");
  const [editingCell, setEditingCell] = useState<{ localNumber: string; period: string } | null>(null);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [groupBy, setGroupBy] = useState<"none" | "pu" | "grade" | "puGrade">("none");
  const [puFilter, setPuFilter] = useState("all");
  const [gradeFilter, setGradeFilter] = useState("all");
  const [nameSearch, setNameSearch] = useState("");
  const [sortKey, setSortKey] = useState<"name" | "pu" | "grade" | "total" | "months" | `m${number}`>("total");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [probabilityDraft, setProbabilityDraft] = useState<string>("");
  useEffect(() => {
    if (editingCell) inputRef.current?.focus();
  }, [editingCell]);
  useEffect(() => {
    if (project) setProbabilityDraft(getCommitProbability(project).toFixed(2));
  }, [project]);

  const beginEdit = (localNumber: string, period: string, hours: number) => {
    setEditingCell({ localNumber, period });
    const fullHours = hoursForPeriod(calIdx, period);
    const v = showUnit === "hours" ? hours : fullHours > 0 ? hours / fullHours : 0;
    setDraft(v > 0 ? (showUnit === "hours" ? String(Math.round(v)) : v.toFixed(2)) : "");
  };
  const commitEdit = () => {
    if (!editingCell || !project) return;
    const raw = draft.trim().replace(",", ".");
    const num = raw === "" ? 0 : Number(raw);
    if (!Number.isFinite(num) || num < 0) {
      setEditingCell(null);
      return;
    }
    const fullHours = hoursForPeriod(calIdx, editingCell.period);
    const hours = showUnit === "hours" ? num : num * fullHours;
    if (hours <= 0) {
      unassign({ localNumber: editingCell.localNumber, projectNumber: project.projectNumber, period: editingCell.period });
    } else {
      assign({
        localNumber: editingCell.localNumber,
        projectNumber: project.projectNumber,
        period: editingCell.period,
        hours,
        projectType: project.isBillable ? "DEL" : "INT",
      });
    }
    setEditingCell(null);
  };
  const cancelEdit = () => setEditingCell(null);

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
      .filter((r) => r.e);
  }, [aggMap, project, empMap, periods]);

  const distinctPus = useMemo(() => {
    const set = new Set<string>();
    for (const r of personMatrix) if (r.e) set.add(r.e.puCode);
    return [...set].sort((a, b) => puLabel(a).localeCompare(puLabel(b)));
  }, [personMatrix]);
  const distinctGrades = useMemo(() => {
    const set = new Set<string>();
    for (const r of personMatrix) if (r.e) set.add(r.e.gradeCode);
    return [...set].sort();
  }, [personMatrix]);

  const filteredMatrix = useMemo(() => {
    const q = nameSearch.trim().toLowerCase();
    return personMatrix.filter((r) => {
      const e = r.e!;
      if (puFilter !== "all" && e.puCode !== puFilter) return false;
      if (gradeFilter !== "all" && e.gradeCode !== gradeFilter) return false;
      if (q && !e.displayName.toLowerCase().includes(q) && !e.localNumber.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [personMatrix, puFilter, gradeFilter, nameSearch]);

  const sortedMatrix = useMemo(() => {
    const rows = [...filteredMatrix];
    const dir = sortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      const ae = a.e!, be = b.e!;
      let cmp = 0;
      if (sortKey === "name") cmp = ae.displayName.localeCompare(be.displayName);
      else if (sortKey === "pu") cmp = puLabel(ae.puCode).localeCompare(puLabel(be.puCode));
      else if (sortKey === "grade") cmp = ae.gradeCode.localeCompare(be.gradeCode);
      else if (sortKey === "total") cmp = a.total - b.total;
      else if (sortKey === "months") cmp = a.activeMonths - b.activeMonths;
      else if (sortKey.startsWith("m")) {
        const idx = Number(sortKey.slice(1));
        const p = periods[idx];
        cmp = (a.byPeriod.get(p) ?? 0) - (b.byPeriod.get(p) ?? 0);
      }
      if (cmp === 0) cmp = b.total - a.total;
      return cmp * dir;
    });
    return rows;
  }, [filteredMatrix, sortKey, sortDir, periods]);

  type Group = {
    key: string;
    label: string;
    rows: typeof sortedMatrix;
    subBy: Map<string, number>;
    subTotal: number;
    subPeople: number;
  };
  const groups: Group[] = useMemo(() => {
    const keyOf = (e: NonNullable<typeof sortedMatrix[number]["e"]>) => {
      if (groupBy === "pu") return e.puCode;
      if (groupBy === "grade") return e.gradeCode;
      if (groupBy === "puGrade") return `${e.puCode}::${e.gradeCode}`;
      return "_all";
    };
    const labelOf = (k: string) => {
      if (groupBy === "pu") return puLabel(k);
      if (groupBy === "grade") return `Grade ${k}`;
      if (groupBy === "puGrade") {
        const [pu, g] = k.split("::");
        return `${puLabel(pu)} · ${g}`;
      }
      return "All people";
    };
    const map = new Map<string, typeof sortedMatrix>();
    for (const r of sortedMatrix) {
      const k = keyOf(r.e!);
      let arr = map.get(k);
      if (!arr) { arr = []; map.set(k, arr); }
      arr.push(r);
    }
    const out: Group[] = [];
    for (const [k, rows] of map.entries()) {
      const subBy = new Map<string, number>();
      let subTotal = 0;
      for (const r of rows) {
        for (const p of periods) subBy.set(p, (subBy.get(p) ?? 0) + (r.byPeriod.get(p) ?? 0));
        subTotal += r.total;
      }
      out.push({ key: k, label: labelOf(k), rows, subBy, subTotal, subPeople: rows.length });
    }
    out.sort((a, b) => a.label.localeCompare(b.label));
    return out;
  }, [sortedMatrix, groupBy, periods]);

  const grandBy = useMemo(() => {
    const m = new Map<string, number>();
    let total = 0;
    for (const g of groups) {
      for (const p of periods) m.set(p, (m.get(p) ?? 0) + (g.subBy.get(p) ?? 0));
      total += g.subTotal;
    }
    return { byPeriod: m, total, people: groups.reduce((s, g) => s + g.subPeople, 0) };
  }, [groups, periods]);

  const toggleSort = (k: typeof sortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir(k === "name" || k === "pu" || k === "grade" ? "asc" : "desc"); }
  };
  const sortIcon = (k: typeof sortKey) =>
    sortKey === k ? (sortDir === "asc" ? <ArrowUp className="inline w-3 h-3 ml-1" /> : <ArrowDown className="inline w-3 h-3 ml-1" />) : null;
  const toggleGroup = (k: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };
  const fmtCell = (hours: number) => showUnit === "hours" ? formatNumber(hours, 0) : formatNumber(hours / avgMonthlyHours, 2);

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
    xAxis: { type: "category", data: periods.map((p) => `${p.slice(5, 7)}/${yy}`) },
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
            <span
              className={
                project.kind === "project"
                  ? "pill-brand"
                  : project.kind === "opportunity"
                    ? "pill-warning"
                    : "chip"
              }
              title={
                project.kind === "project"
                  ? "Confirmed engagement"
                  : project.kind === "opportunity"
                    ? "Sales pipeline, not yet signed"
                    : "Aspirational / target account"
              }
            >
              {project.kind}
            </span>
            {project.kind === "project" ? (
              <span className="chip tabular-nums" title="Committed — commit probability fixed at 1.00">
                × 1.00 (committed)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 chip tabular-nums" title="Commit probability — weight applied to FTE demand. Blur to save.">
                <span>×</span>
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  className="w-14 text-right bg-transparent outline-none border-b border-border focus:border-brand"
                  value={probabilityDraft}
                  onChange={(e) => setProbabilityDraft(e.target.value)}
                  onBlur={() => {
                    const n = Number(probabilityDraft.replace(",", "."));
                    if (!Number.isFinite(n)) {
                      setProbabilityDraft(getCommitProbability(project).toFixed(2));
                      return;
                    }
                    if (n !== getCommitProbability(project)) {
                      updateProject(project.projectNumber, { commitProbability: n });
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
                    else if (e.key === "Escape") {
                      setProbabilityDraft(getCommitProbability(project).toFixed(2));
                      (e.currentTarget as HTMLInputElement).blur();
                    }
                  }}
                />
              </span>
            )}
            <span className={project.isBillable ? "pill-success" : "chip"}>
              {project.isBillable ? "billable" : "overhead"}
            </span>
            <span
              className={
                project.status === "active"
                  ? "pill-brand"
                  : project.status === "completed"
                    ? "chip"
                    : "chip opacity-70"
              }
            >
              {project.status}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn" onClick={() => setEditOpen(true)}>
            <Pencil className="w-4 h-4" /> Edit
          </button>
          {(project.kind === "ambition" || project.kind === "opportunity") && (
            <button
              className="btn"
              onClick={() => setPlaceholderOpen(true)}
              title="Add a placeholder person for unstaffed forecast demand"
            >
              <Sparkles className="w-4 h-4" /> Add forecast role
            </button>
          )}
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

      <AddPlaceholderModal
        open={placeholderOpen}
        onClose={() => setPlaceholderOpen(false)}
        projectNumber={project.projectNumber}
      />

      <ProjectFormModal open={editOpen} onClose={() => setEditOpen(false)} editing={project} />

      {project.description && (
        <div className="card p-4">
          <h2 className="text-sm font-semibold mb-1.5">Description</h2>
          <p className="text-sm text-fg-muted whitespace-pre-wrap">{project.description}</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label={`FTE · ${selectedPeriod}`} value={totalFteCurrent} fractionDigits={1} />
        <KpiCard label={`Hours · ${selectedPeriod}`} value={totalHoursCurrent} fractionDigits={0} />
        <KpiCard label={`Project ARVE · ${selectedPeriod}`} value={arveCurrent * 100} fractionDigits={1} unit="%" tone={arveCurrent < 0.65 ? "danger" : arveCurrent < 0.8 ? "warning" : "success"} />
        <KpiCard label={`People assigned · ${selectedPeriod}`} value={peopleCountCurrent} fractionDigits={0} />
      </div>

      <div className="card p-4">
        <h2 className="text-sm font-semibold mb-2">FTE demand & ARVE — {year}</h2>
        <ReactECharts style={{ height: 320 }} option={chartOption} />
      </div>

      <div className="card p-0 overflow-x-auto">
        <div className="px-4 py-3 flex items-center justify-between flex-wrap gap-2 border-b border-border">
          <h2 className="text-sm font-semibold">Monthly totals — {year}</h2>
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
                  {p.slice(5, 7)}/{yy}
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
            People on project — {year}
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
            <p className="text-xs text-fg-muted">Click any cell to edit; clear the value or enter 0 to unassign.</p>
          </div>
        </div>
        <div className="px-4 py-2 flex flex-wrap items-center gap-2 border-b border-border bg-bg-muted/40">
          <input
            className="input !w-52 text-xs"
            placeholder="Search by name or ID…"
            value={nameSearch}
            onChange={(e) => setNameSearch(e.target.value)}
          />
          <label className="text-xs text-fg-muted">PU</label>
          <select className="input !w-auto text-xs" value={puFilter} onChange={(e) => setPuFilter(e.target.value)}>
            <option value="all">All PUs</option>
            {distinctPus.map((pu) => <option key={pu} value={pu}>{puLabel(pu)}</option>)}
          </select>
          <label className="text-xs text-fg-muted">Grade</label>
          <select className="input !w-auto text-xs" value={gradeFilter} onChange={(e) => setGradeFilter(e.target.value)}>
            <option value="all">All grades</option>
            {distinctGrades.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          <label className="text-xs text-fg-muted">Group by</label>
          <select className="input !w-auto text-xs" value={groupBy} onChange={(e) => setGroupBy(e.target.value as typeof groupBy)}>
            <option value="none">None</option>
            <option value="pu">PU</option>
            <option value="grade">Grade</option>
            <option value="puGrade">PU + Grade</option>
          </select>
          <span className="text-xs text-fg-muted ml-auto">
            {grandBy.people} / {personMatrix.length} people
            {(puFilter !== "all" || gradeFilter !== "all" || nameSearch.trim()) && (
              <button className="ml-2 underline hover:text-brand" onClick={() => { setPuFilter("all"); setGradeFilter("all"); setNameSearch(""); }}>
                clear
              </button>
            )}
          </span>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr>
              <th
                className="table-th text-left sticky left-0 bg-bg-card z-10 cursor-pointer hover:bg-brand/5"
                style={{ minWidth: 240 }}
                onClick={() => toggleSort("name")}
              >
                Person{sortIcon("name")}
              </th>
              <th className="table-th text-left cursor-pointer hover:bg-brand/5" onClick={() => toggleSort("pu")}>
                PU{sortIcon("pu")}
                <span className="mx-1 text-fg-subtle">·</span>
                <span onClick={(e) => { e.stopPropagation(); toggleSort("grade"); }} className="hover:text-brand">Grade{sortIcon("grade")}</span>
              </th>
              {periods.map((p, i) => (
                <th
                  key={p}
                  className={cn(
                    "table-th text-right cursor-pointer hover:bg-brand/5",
                    p === selectedPeriod && "bg-brand/10 text-brand",
                  )}
                  onClick={() => { setSelectedPeriod(p); toggleSort(`m${i}` as typeof sortKey); }}
                  style={{ minWidth: 48 }}
                  title={`${p} — click to sort`}
                >
                  {p.slice(5, 7)}{sortIcon(`m${i}` as typeof sortKey)}
                </th>
              ))}
              <th className="table-th text-right cursor-pointer hover:bg-brand/5" onClick={() => toggleSort("total")} title={`Total across ${year}`}>
                Total{sortIcon("total")}
              </th>
              <th className="table-th text-right cursor-pointer hover:bg-brand/5" onClick={() => toggleSort("months")} title="Months with staffing">
                Months{sortIcon("months")}
              </th>
            </tr>
          </thead>
          <tbody>
            {groups.map((grp) => {
              const isCollapsed = collapsed.has(grp.key);
              const showHeader = groupBy !== "none";
              return (
                <React.Fragment key={grp.key}>
                  {showHeader && (
                    <tr className="bg-bg-muted/60 font-medium cursor-pointer hover:bg-bg-muted" onClick={() => toggleGroup(grp.key)}>
                      <td className="table-td sticky left-0 bg-bg-muted/60 z-10" colSpan={2}>
                        <span className="inline-flex items-center gap-1">
                          {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          {grp.label}
                          <span className="chip ml-1">{grp.subPeople}</span>
                        </span>
                      </td>
                      {periods.map((p) => (
                        <td key={p} className={cn("table-td text-right tabular-nums", p === selectedPeriod && "bg-brand/5")}>
                          {grp.subBy.get(p) ? fmtCell(grp.subBy.get(p) ?? 0) : <span className="text-fg-subtle">—</span>}
                        </td>
                      ))}
                      <td className="table-td text-right tabular-nums">{fmtCell(grp.subTotal)}</td>
                      <td className="table-td text-right tabular-nums text-fg-muted">
                        {periods.filter((p) => (grp.subBy.get(p) ?? 0) > 0).length}
                      </td>
                    </tr>
                  )}
                  {!isCollapsed && grp.rows.map((r) => {
                    const e = r.e!;
                    return (
                      <tr key={r.localNumber} className="hover:bg-bg-hover group">
                        <td className="table-td sticky left-0 bg-bg-card z-10 group-hover:bg-bg-hover">
                          <div className="flex items-center gap-1.5">
                            <Link to={`/people/${e.localNumber}`} className="font-medium hover:text-brand">
                              {e.displayName}
                            </Link>
                            {e.isPlaceholder && (
                              <span
                                className="chip !text-[10px] inline-flex items-center gap-1 border-dashed"
                                title="Forecast placeholder — not an onboarded person"
                              >
                                <Sparkles className="w-3 h-3" /> forecast
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-fg-muted font-mono">{e.localNumber}</div>
                        </td>
                        <td className="table-td text-fg-muted">
                          <span>{puLabel(e.puCode)}</span>
                          <span className="mx-1 text-fg-subtle">·</span>
                          <span>{e.gradeCode}</span>
                        </td>
                        {periods.map((p) => {
                          const hours = r.byPeriod.get(p) ?? 0;
                          const fteFullHours = hoursForPeriod(calIdx, p);
                          const fte = fteFullHours > 0 ? hours / fteFullHours : 0;
                          const isSelected = p === selectedPeriod;
                          const isEditing = editingCell?.localNumber === e.localNumber && editingCell?.period === p;
                          const display = hours === 0
                            ? <span className="text-fg-subtle">—</span>
                            : showUnit === "hours" ? formatNumber(hours, 0) : formatNumber(fte, 2);
                          return (
                            <td
                              key={p}
                              className={cn(
                                "table-td text-right tabular-nums relative cursor-pointer hover:bg-brand/10",
                                isSelected && "bg-brand/5",
                                hours > 0 && fte >= 0.9 && "text-brand font-medium",
                                isEditing && "bg-brand/10 p-0",
                              )}
                              title={hours > 0
                                ? `${formatNumber(hours, 0)} h · ${formatNumber(fte, 2)} FTE · click to edit`
                                : "click to assign"}
                              onClick={() => {
                                setSelectedPeriod(p);
                                if (!isEditing) beginEdit(e.localNumber, p, hours);
                              }}
                            >
                              {isEditing ? (
                                <input
                                  ref={inputRef}
                                  className="w-full text-right tabular-nums bg-transparent outline-none px-2 py-1 border border-brand rounded"
                                  value={draft}
                                  onChange={(ev) => setDraft(ev.target.value)}
                                  onBlur={commitEdit}
                                  onClick={(ev) => ev.stopPropagation()}
                                  onKeyDown={(ev) => {
                                    if (ev.key === "Enter") { ev.preventDefault(); commitEdit(); }
                                    else if (ev.key === "Escape") { ev.preventDefault(); cancelEdit(); }
                                  }}
                                  inputMode="decimal"
                                  placeholder={showUnit === "hours" ? "h" : "FTE"}
                                />
                              ) : display}
                            </td>
                          );
                        })}
                        <td className="table-td text-right tabular-nums font-medium">
                          {showUnit === "hours" ? formatNumber(r.total, 0) : formatNumber(r.total / avgMonthlyHours, 2)}
                        </td>
                        <td className="table-td text-right tabular-nums text-fg-muted">{r.activeMonths}</td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              );
            })}
            {groups.length > 0 && (
              <tr className="bg-bg-muted font-semibold border-t-2 border-border">
                <td className="table-td sticky left-0 bg-bg-muted z-10" colSpan={2}>
                  Grand total <span className="chip ml-1">{grandBy.people}</span>
                </td>
                {periods.map((p) => (
                  <td key={p} className={cn("table-td text-right tabular-nums", p === selectedPeriod && "bg-brand/10")}>
                    {grandBy.byPeriod.get(p) ? fmtCell(grandBy.byPeriod.get(p) ?? 0) : <span className="text-fg-subtle">—</span>}
                  </td>
                ))}
                <td className="table-td text-right tabular-nums">{fmtCell(grandBy.total)}</td>
                <td className="table-td text-right tabular-nums text-fg-muted">
                  {periods.filter((p) => (grandBy.byPeriod.get(p) ?? 0) > 0).length}
                </td>
              </tr>
            )}
            {groups.length === 0 && (
              <tr>
                <td colSpan={periods.length + 4} className="table-td text-center text-fg-muted py-6">
                  No staffing recorded for {year}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
