import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAppStore } from "../store";
import { formatNumber } from "../lib/utils";
import { Briefcase, Search, ChevronRight, Plus, Pencil } from "lucide-react";
import { aggregateProjects, year2026Periods } from "../lib/projectHelpers";
import { ProjectFormModal } from "../components/forms/ProjectForms";
import type { Project } from "../types";

export default function Projects() {
  const projects = useAppStore((s) => s.projects);
  const mus = useAppStore((s) => s.marketUnits);
  const gfsHours = useAppStore((s) => s.gfsHours);
  const snapshots = useAppStore((s) => s.snapshots);
  const [q, setQ] = useState("");
  const [mu, setMu] = useState<string>("");
  const [billable, setBillable] = useState<"all" | "billable" | "overhead">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "completed">("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Project | undefined>(undefined);

  const periods = year2026Periods();
  const aggMap = useMemo(() => aggregateProjects(gfsHours, snapshots), [gfsHours, snapshots]);

  const filtered = projects.filter((p) => {
    if (q && !p.name.toLowerCase().includes(q.toLowerCase()) && !p.projectNumber.includes(q)) return false;
    if (mu && p.marketUnit !== mu) return false;
    if (billable === "billable" && !p.isBillable) return false;
    if (billable === "overhead" && p.isBillable) return false;
    if (statusFilter === "active" && p.status !== "active") return false;
    if (statusFilter === "completed" && p.status !== "completed") return false;
    return true;
  });

  function openNew() {
    setEditing(undefined);
    setFormOpen(true);
  }

  function openEdit(p: Project) {
    setEditing(p);
    setFormOpen(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Projects</h1>
          <p className="text-sm text-fg-muted">FTE demand aggregated from staffing for full year 2026. Click a project to see assigned people and ARVE.</p>
        </div>
        <button className="btn-primary flex items-center gap-1.5" onClick={openNew}>
          <Plus className="w-4 h-4" /> New project
        </button>
      </div>

      <div className="card p-3 flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-fg-muted" />
          <input
            className="bg-transparent text-sm focus:outline-none flex-1"
            placeholder="Search by name or project number…"
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
        <div className="flex items-center gap-1">
          {(["all", "billable", "overhead"] as const).map((o) => (
            <button key={o} className={billable === o ? "pill-brand" : "chip"} onClick={() => setBillable(o)}>
              {o}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          {(["all", "active", "completed"] as const).map((o) => (
            <button
              key={o}
              className={statusFilter === o ? "pill-brand" : "chip"}
              onClick={() => setStatusFilter(o)}
            >
              {o}
            </button>
          ))}
        </div>
      </div>

      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="table-th sticky left-0 bg-bg z-10 min-w-[260px]">Project</th>
              <th className="table-th">MU</th>
              <th className="table-th">Billable</th>
              <th className="table-th">Status</th>
              {periods.map((p) => (
                <th key={p} className="table-th text-right whitespace-nowrap">{p.slice(5, 7)}/26</th>
              ))}
              <th className="table-th"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => {
              const muName = mus.find((m) => m.code === p.marketUnit)?.displayName ?? p.marketUnit;
              return (
                <tr key={p.projectNumber} className="hover:bg-bg-hover">
                  <td className="table-td sticky left-0 bg-bg hover:bg-bg-hover z-10">
                    <Link to={`/projects/${p.projectNumber}`} className="flex items-center gap-2 group">
                      <Briefcase className="w-3.5 h-3.5 text-fg-muted" />
                      <div>
                        <div className="font-medium group-hover:text-brand">{p.name}</div>
                        <div className="text-[11px] text-fg-muted">{p.projectNumber} · {p.customer}</div>
                      </div>
                    </Link>
                  </td>
                  <td className="table-td">{muName}</td>
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
                  {periods.map((period) => {
                    const agg = aggMap.get(`${p.projectNumber}::${period}`);
                    const fte = agg?.fte ?? 0;
                    return (
                      <td key={period} className="table-td text-right tabular-nums">
                        {fte > 0 ? formatNumber(fte, 1) : <span className="text-fg-subtle">—</span>}
                      </td>
                    );
                  })}
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
          </tbody>
        </table>
      </div>

      <ProjectFormModal open={formOpen} onClose={() => setFormOpen(false)} editing={editing} />
    </div>
  );
}
