import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAppStore } from "../store";
import { cn, formatNumber, activeCycleYear } from "../lib/utils";
import { ArrowDown, ArrowUp, Briefcase, ChevronDown, ChevronRight, Lightbulb, Pencil, Plus, Search, Target } from "lucide-react";
import { aggregateProjects, yearPeriods } from "../lib/projectHelpers";
import { ProjectFormModal } from "../components/forms/ProjectForms";
import type { Project, ProjectKind } from "../types";

type GroupBy = "none" | "mu" | "billable" | "status" | "customer" | "kind";
type SortKey = "name" | "number" | "mu" | "customer" | "kind" | "billable" | "status" | "total" | `m${number}`;
type SortDir = "asc" | "desc";
type KindFilter = "all" | ProjectKind;

const KIND_LABEL: Record<ProjectKind, string> = {
  project: "Project",
  opportunity: "Opportunity",
  ambition: "Ambition",
};
const KIND_PLURAL: Record<ProjectKind, string> = {
  project: "Projects",
  opportunity: "Opportunities",
  ambition: "Ambitions",
};
const KIND_CLASS: Record<ProjectKind, string> = {
  project: "pill-brand",
  opportunity: "pill-warning",
  ambition: "chip",
};
const KIND_ICON: Record<ProjectKind, React.ComponentType<{ className?: string }>> = {
  project: Briefcase,
  opportunity: Target,
  ambition: Lightbulb,
};

export default function Projects() {
  const projects = useAppStore((s) => s.projects);
  const mus = useAppStore((s) => s.marketUnits);
  const gfsHours = useAppStore((s) => s.gfsHours);
  const snapshots = useAppStore((s) => s.snapshots);
  const cycles = useAppStore((s) => s.cycles);
  const activeCycleId = useAppStore((s) => s.activeCycleId);
  const workingCalendar = useAppStore((s) => s.workingCalendar);
  const year = activeCycleYear(cycles, activeCycleId);
  const yy = String(year).slice(-2);
  const activePeriod = cycles.find((c) => c.id === activeCycleId)?.periodOpened;

  const [q, setQ] = useState("");
  const [mu, setMu] = useState<string>("");
  const [customer, setCustomer] = useState<string>("");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [billable, setBillable] = useState<"all" | "billable" | "overhead">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "completed" | "unknown">("all");
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [sortKey, setSortKey] = useState<SortKey>("total");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Project | undefined>(undefined);

  const periods = useMemo(() => yearPeriods(year), [year]);
  const aggMap = useMemo(
    () => aggregateProjects(gfsHours, snapshots, workingCalendar),
    [gfsHours, snapshots, workingCalendar],
  );
  const muLabel = (code: string) => mus.find((m) => m.code === code)?.displayName ?? code;

  const customers = useMemo(() => {
    const s = new Set<string>();
    for (const p of projects) if (p.customer) s.add(p.customer);
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [projects]);

  type Row = {
    p: Project;
    monthly: number[];
    total: number;
  };

  const rows: Row[] = useMemo(() => {
    return projects.map((p) => {
      const monthly = periods.map((period) => aggMap.get(`${p.projectNumber}::${period}`)?.fte ?? 0);
      const total = monthly.reduce((s, v) => s + v, 0);
      return { p, monthly, total };
    });
  }, [projects, aggMap, periods]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return rows.filter(({ p }) => {
      if (query && !p.name.toLowerCase().includes(query) && !p.projectNumber.includes(query) && !p.customer.toLowerCase().includes(query)) return false;
      if (mu && p.marketUnit !== mu) return false;
      if (customer && p.customer !== customer) return false;
      if (kindFilter !== "all" && p.kind !== kindFilter) return false;
      if (billable === "billable" && !p.isBillable) return false;
      if (billable === "overhead" && p.isBillable) return false;
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      return true;
    });
  }, [rows, q, mu, customer, kindFilter, billable, statusFilter]);

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const copy = [...filtered];
    copy.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = a.p.name.localeCompare(b.p.name);
      else if (sortKey === "number") cmp = a.p.projectNumber.localeCompare(b.p.projectNumber);
      else if (sortKey === "mu") cmp = muLabel(a.p.marketUnit).localeCompare(muLabel(b.p.marketUnit));
      else if (sortKey === "customer") cmp = a.p.customer.localeCompare(b.p.customer);
      else if (sortKey === "kind") cmp = a.p.kind.localeCompare(b.p.kind);
      else if (sortKey === "billable") cmp = Number(b.p.isBillable) - Number(a.p.isBillable); // billable first in asc
      else if (sortKey === "status") cmp = a.p.status.localeCompare(b.p.status);
      else if (sortKey === "total") cmp = a.total - b.total;
      else if (sortKey.startsWith("m")) {
        const idx = Number(sortKey.slice(1));
        cmp = (a.monthly[idx] ?? 0) - (b.monthly[idx] ?? 0);
      }
      if (cmp === 0) cmp = a.p.name.localeCompare(b.p.name);
      return cmp * dir;
    });
    return copy;
    // muLabel is stable within render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sortKey, sortDir, mus]);

  type Group = {
    key: string;
    label: string;
    rows: Row[];
    subMonthly: number[];
    subTotal: number;
  };
  const groups: Group[] = useMemo(() => {
    const keyOf = (p: Project): string => {
      if (groupBy === "mu") return p.marketUnit;
      if (groupBy === "billable") return p.isBillable ? "billable" : "overhead";
      if (groupBy === "status") return p.status;
      if (groupBy === "customer") return p.customer || "—";
      if (groupBy === "kind") return p.kind;
      return "_all";
    };
    const labelOf = (k: string): string => {
      if (groupBy === "mu") return muLabel(k);
      if (groupBy === "billable") return k === "billable" ? "Billable" : "Overhead";
      if (groupBy === "status") return k.charAt(0).toUpperCase() + k.slice(1);
      if (groupBy === "customer") return k;
      if (groupBy === "kind") return KIND_PLURAL[k as ProjectKind] ?? k;
      return "All projects";
    };
    const map = new Map<string, Row[]>();
    for (const r of sorted) {
      const k = keyOf(r.p);
      const arr = map.get(k) ?? [];
      arr.push(r);
      map.set(k, arr);
    }
    const out: Group[] = [];
    for (const [k, groupRows] of map.entries()) {
      const subMonthly = periods.map((_, i) => groupRows.reduce((s, r) => s + (r.monthly[i] ?? 0), 0));
      const subTotal = groupRows.reduce((s, r) => s + r.total, 0);
      out.push({ key: k, label: labelOf(k), rows: groupRows, subMonthly, subTotal });
    }
    out.sort((a, b) => a.label.localeCompare(b.label));
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorted, groupBy, mus, periods]);

  const grand = useMemo(() => {
    const monthly = periods.map((_, i) => groups.reduce((s, g) => s + (g.subMonthly[i] ?? 0), 0));
    const total = groups.reduce((s, g) => s + g.subTotal, 0);
    const count = groups.reduce((s, g) => s + g.rows.length, 0);
    return { monthly, total, count };
  }, [groups, periods]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(k === "name" || k === "number" || k === "mu" || k === "customer" || k === "kind" || k === "status" ? "asc" : "desc");
    }
  }
  const sortIcon = (k: SortKey) =>
    sortKey === k ? (sortDir === "asc" ? <ArrowUp className="inline w-3 h-3 ml-1" /> : <ArrowDown className="inline w-3 h-3 ml-1" />) : null;
  function toggleGroup(k: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  const clearFilters = () => {
    setQ("");
    setMu("");
    setCustomer("");
    setKindFilter("all");
    setBillable("all");
    setStatusFilter("all");
  };
  const hasFilter = !!q || !!mu || !!customer || kindFilter !== "all" || billable !== "all" || statusFilter !== "all";

  function openNew() {
    setEditing(undefined);
    setFormOpen(true);
  }
  function openEdit(p: Project) {
    setEditing(p);
    setFormOpen(true);
  }

  const totalColCount = 6 + periods.length + 1; // Project, Kind, MU, Customer, Billable, Status, 12 months, actions

  const kindCounts = useMemo(() => {
    const counts: Record<ProjectKind, number> = { project: 0, opportunity: 0, ambition: 0 };
    for (const p of projects) counts[p.kind] = (counts[p.kind] ?? 0) + 1;
    return counts;
  }, [projects]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Projects</h1>
          <p className="text-sm text-fg-muted">Projects, opportunities, and ambitions — FTE demand aggregated from staffing for full year {year}. Click a row to see assigned people and ARVE.</p>
        </div>
        <button className="btn-primary flex items-center gap-1.5" onClick={openNew}>
          <Plus className="w-4 h-4" /> New project
        </button>
      </div>

      <div className="flex items-center gap-1 flex-wrap">
        {(["all", "project", "opportunity", "ambition"] as const).map((k) => {
          const count = k === "all" ? projects.length : kindCounts[k];
          const label = k === "all" ? "All" : KIND_PLURAL[k];
          return (
            <button
              key={k}
              className={kindFilter === k ? "pill-brand" : "chip"}
              onClick={() => setKindFilter(k)}
              title={label}
            >
              {label} <span className="ml-1 opacity-70 tabular-nums">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="card p-3 flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-fg-muted" />
          <input
            className="bg-transparent text-sm focus:outline-none flex-1"
            placeholder="Search name, number, or customer…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select className="input !w-auto" value={mu} onChange={(e) => setMu(e.target.value)}>
          <option value="">All MUs</option>
          {mus.map((m) => (
            <option key={m.code} value={m.code}>{m.displayName}</option>
          ))}
        </select>
        <select className="input !w-auto" value={customer} onChange={(e) => setCustomer(e.target.value)}>
          <option value="">All customers</option>
          {customers.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <div className="flex items-center gap-1">
          {(["all", "billable", "overhead"] as const).map((o) => (
            <button key={o} className={billable === o ? "pill-brand" : "chip"} onClick={() => setBillable(o)}>
              {o}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          {(["all", "active", "completed", "unknown"] as const).map((o) => (
            <button
              key={o}
              className={statusFilter === o ? "pill-brand" : "chip"}
              onClick={() => setStatusFilter(o)}
            >
              {o}
            </button>
          ))}
        </div>
        <label className="text-xs text-fg-muted ml-1">Group by</label>
        <select
          className="input !w-auto"
          value={groupBy}
          onChange={(e) => setGroupBy(e.target.value as GroupBy)}
        >
          <option value="none">None</option>
          <option value="kind">Kind</option>
          <option value="mu">MU</option>
          <option value="customer">Customer</option>
          <option value="billable">Billable</option>
          <option value="status">Status</option>
        </select>
        <span className="text-xs text-fg-muted ml-auto">
          {grand.count} / {projects.length} projects
          {hasFilter && (
            <button className="ml-2 underline hover:text-brand" onClick={clearFilters}>
              clear
            </button>
          )}
        </span>
      </div>

      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th
                className="table-th sticky left-0 bg-bg z-10 min-w-[260px] cursor-pointer hover:bg-brand/5"
                onClick={() => toggleSort("name")}
                title="Sort by project name"
              >
                Project{sortIcon("name")}
              </th>
              <th className="table-th cursor-pointer hover:bg-brand/5" onClick={() => toggleSort("kind")}>
                Kind{sortIcon("kind")}
              </th>
              <th className="table-th cursor-pointer hover:bg-brand/5" onClick={() => toggleSort("mu")}>
                MU{sortIcon("mu")}
              </th>
              <th className="table-th cursor-pointer hover:bg-brand/5" onClick={() => toggleSort("customer")}>
                Customer{sortIcon("customer")}
              </th>
              <th className="table-th cursor-pointer hover:bg-brand/5" onClick={() => toggleSort("billable")}>
                Billable{sortIcon("billable")}
              </th>
              <th className="table-th cursor-pointer hover:bg-brand/5" onClick={() => toggleSort("status")}>
                Status{sortIcon("status")}
              </th>
              {periods.map((p, i) => (
                <th
                  key={p}
                  className={cn(
                    "table-th text-right whitespace-nowrap cursor-pointer hover:bg-brand/5",
                    p === activePeriod && "bg-brand/10 text-brand",
                  )}
                  title={`Sort by ${p}${p === activePeriod ? " · current period" : ""}`}
                  onClick={() => toggleSort(`m${i}` as SortKey)}
                >
                  {p.slice(5, 7)}/{yy}{sortIcon(`m${i}` as SortKey)}
                </th>
              ))}
              <th
                className="table-th text-right cursor-pointer hover:bg-brand/5"
                onClick={() => toggleSort("total")}
                title="Sort by year total"
              >
                Total{sortIcon("total")}
              </th>
              <th className="table-th"></th>
            </tr>
          </thead>
          <tbody>
            {groups.map((grp) => {
              const showHeader = groupBy !== "none";
              const isCollapsed = collapsed.has(grp.key);
              return (
                <React.Fragment key={grp.key}>
                  {showHeader && (
                    <tr
                      className="bg-bg-muted/60 font-medium cursor-pointer hover:bg-bg-muted"
                      onClick={() => toggleGroup(grp.key)}
                    >
                      <td className="table-td sticky left-0 bg-bg-muted/60 z-10" colSpan={6}>
                        <span className="inline-flex items-center gap-1">
                          {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          {grp.label}
                          <span className="chip ml-1">{grp.rows.length}</span>
                        </span>
                      </td>
                      {periods.map((p, i) => (
                        <td
                          key={p}
                          className={cn(
                            "table-td text-right tabular-nums",
                            p === activePeriod && "bg-brand/5",
                          )}
                        >
                          {grp.subMonthly[i] > 0 ? formatNumber(grp.subMonthly[i], 1) : <span className="text-fg-subtle">—</span>}
                        </td>
                      ))}
                      <td className="table-td text-right tabular-nums font-semibold">
                        {grp.subTotal > 0 ? formatNumber(grp.subTotal, 1) : <span className="text-fg-subtle">—</span>}
                      </td>
                      <td className="table-td"></td>
                    </tr>
                  )}
                  {!isCollapsed && grp.rows.map(({ p, monthly, total }) => {
                    const KindIcon = KIND_ICON[p.kind];
                    return (
                    <tr key={p.projectNumber} className="hover:bg-bg-hover group">
                      <td className="table-td sticky left-0 bg-bg group-hover:bg-bg-hover z-10">
                        <Link to={`/projects/${p.projectNumber}`} className="flex items-center gap-2">
                          <KindIcon className="w-3.5 h-3.5 text-fg-muted" />
                          <div>
                            <div className="font-medium hover:text-brand">{p.name}</div>
                            <div className="text-[11px] text-fg-muted">{p.projectNumber}</div>
                          </div>
                        </Link>
                      </td>
                      <td className="table-td">
                        <span className={KIND_CLASS[p.kind]}>{KIND_LABEL[p.kind]}</span>
                      </td>
                      <td className="table-td">{muLabel(p.marketUnit)}</td>
                      <td className="table-td">{p.customer}</td>
                      <td className="table-td">
                        <span className={p.isBillable ? "pill-success" : "chip"}>
                          {p.isBillable ? "billable" : "overhead"}
                        </span>
                      </td>
                      <td className="table-td">
                        <span
                          className={
                            p.status === "active"
                              ? "pill-brand"
                              : p.status === "completed"
                                ? "chip"
                                : "chip opacity-70"
                          }
                        >
                          {p.status}
                        </span>
                      </td>
                      {periods.map((period, i) => {
                        const fte = monthly[i] ?? 0;
                        return (
                          <td
                            key={period}
                            className={cn(
                              "table-td text-right tabular-nums",
                              period === activePeriod && "bg-brand/5",
                            )}
                          >
                            {fte > 0 ? formatNumber(fte, 1) : <span className="text-fg-subtle">—</span>}
                          </td>
                        );
                      })}
                      <td className="table-td text-right tabular-nums font-medium">
                        {total > 0 ? formatNumber(total, 1) : <span className="text-fg-subtle">—</span>}
                      </td>
                      <td className="table-td">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            className="btn-ghost"
                            onClick={() => openEdit(p)}
                            title="Edit project"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <Link to={`/projects/${p.projectNumber}`} className="text-fg-muted hover:text-brand">
                            <ChevronRight className="w-4 h-4" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </React.Fragment>
              );
            })}
            {groups.length > 0 && (
              <tr className="bg-bg-muted font-semibold border-t-2 border-border">
                <td className="table-td sticky left-0 bg-bg-muted z-10" colSpan={6}>
                  Grand total <span className="chip ml-1">{grand.count}</span>
                </td>
                {periods.map((p, i) => (
                  <td
                    key={p}
                    className={cn(
                      "table-td text-right tabular-nums",
                      p === activePeriod && "bg-brand/10",
                    )}
                  >
                    {grand.monthly[i] > 0 ? formatNumber(grand.monthly[i], 1) : <span className="text-fg-subtle">—</span>}
                  </td>
                ))}
                <td className="table-td text-right tabular-nums">
                  {grand.total > 0 ? formatNumber(grand.total, 1) : <span className="text-fg-subtle">—</span>}
                </td>
                <td className="table-td"></td>
              </tr>
            )}
            {groups.length === 0 && (
              <tr>
                <td colSpan={totalColCount} className="table-td text-center text-fg-muted py-6">
                  No projects match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ProjectFormModal open={formOpen} onClose={() => setFormOpen(false)} editing={editing} />
    </div>
  );
}
