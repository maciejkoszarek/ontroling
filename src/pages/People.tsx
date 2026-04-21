import { Fragment, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAppStore } from "../store";
import { cn, formatPct } from "../lib/utils";
import { ArrowRightLeft, Briefcase, ChevronDown, ChevronRight, ChevronUp, Search, UserMinus, UserPlus, Users } from "lucide-react";
import { currentPeriod, puLabel } from "../lib/demoData";
import { trailingArve, employeeProjectsForPeriod } from "../lib/projectHelpers";
import {
  AddPersonModal,
  AddJoinerModal,
  AddLeaverModal,
  TransferModal,
  AssignProjectModal,
} from "../components/forms/PeopleForms";

type SortCol = "name" | "localNumber" | "pu" | "grade" | "location" | "joined" | "left" | "arve" | "status" | "projects";
type GroupBy = "none" | "location" | "grade" | "pu" | "project" | "status";

const ROWS_PER_PAGE = 50;

function formatJoinLeave(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const month = d.toLocaleString("en", { month: "short" });
  return `${month} ${String(d.getFullYear()).slice(2)}`;
}

function SortTh({
  col,
  label,
  sort,
  onToggle,
  align = "left",
}: {
  col: SortCol;
  label: string;
  sort: { col: SortCol; dir: "asc" | "desc" };
  onToggle: (c: SortCol) => void;
  align?: "left" | "right";
}) {
  const active = sort.col === col;
  return (
    <th className={cn("table-th select-none", align === "right" && "text-right")}>
      <button
        type="button"
        className={cn(
          "inline-flex items-center gap-1 hover:text-brand cursor-pointer",
          active && "text-brand",
          align === "right" && "flex-row-reverse",
        )}
        onClick={() => onToggle(col)}
      >
        <span>{label}</span>
        {active ? (
          sort.dir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
        ) : (
          <ChevronDown className="w-3 h-3 opacity-20" />
        )}
      </button>
    </th>
  );
}

export default function People() {
  const employees = useAppStore((s) => s.employees);
  const snapshots = useAppStore((s) => s.snapshots);
  const gfsHours = useAppStore((s) => s.gfsHours);
  const productionUnits = useAppStore((s) => s.productionUnits);
  const grades = useAppStore((s) => s.grades);
  const locations = useAppStore((s) => s.locations);
  const projects = useAppStore((s) => s.projects);
  const [q, setQ] = useState("");
  const [pu, setPu] = useState("");
  const [grade, setGrade] = useState("");
  const [loc, setLoc] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "leavers" | "all">("active");
  const [arveBand, setArveBand] = useState<"all" | "low" | "mid" | "high">("all");
  const [page, setPage] = useState(0);
  const [modal, setModal] = useState<null | "person" | "joiner" | "leaver" | "transfer" | "assign">(null);
  const [selectedLocalNumber, setSelectedLocalNumber] = useState<string | undefined>(undefined);
  const [sort, setSort] = useState<{ col: SortCol; dir: "asc" | "desc" }>({ col: "name", dir: "asc" });
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  function toggleSort(col: SortCol) {
    setSort((s) => (s.col === col ? { col, dir: s.dir === "asc" ? "desc" : "asc" } : { col, dir: "asc" }));
  }
  function toggleGroup(k: string) {
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k); else n.add(k);
      return n;
    });
  }

  function openRowAction(m: "leaver" | "transfer" | "assign", localNumber: string) {
    setSelectedLocalNumber(localNumber);
    setModal(m);
  }
  function closeModal() {
    setModal(null);
    setSelectedLocalNumber(undefined);
  }

  const projByNumber = useMemo(() => new Map(projects.map((p) => [p.projectNumber, p])), [projects]);

  function renderPersonRow(
    r: { e: typeof employees[number]; arve: number; totalHours: number; projectNumbers: string[] },
    groupKey: string,
  ) {
    const locName = locations.find((l) => l.code === r.e.locationCode)?.displayName ?? r.e.locationCode;
    const isLeaver = !!r.e.endDate;
    return (
      <tr key={`${groupKey}::${r.e.localNumber}`} className="group hover:bg-bg-hover">
        <td className="table-td font-medium">
          <Link to={`/people/${r.e.localNumber}`} className="hover:text-brand">{r.e.displayName}</Link>
        </td>
        <td className="table-td font-mono text-[11px] text-fg-muted">{r.e.localNumber}</td>
        <td className="table-td">{puLabel(r.e.puCode)}</td>
        <td className="table-td">{r.e.gradeCode}</td>
        <td className="table-td text-fg-muted">{locName}</td>
        <td className="table-td">
          {isLeaver ? (
            <span className="chip !text-[10px] !px-1.5 !py-0 bg-danger/10 text-danger border-danger/20">Leaver</span>
          ) : (
            <span className="chip !text-[10px] !px-1.5 !py-0 bg-success/10 text-success border-success/20">Active</span>
          )}
        </td>
        <td className="table-td text-fg-muted tabular-nums text-xs" title={r.e.startDate}>
          {formatJoinLeave(r.e.startDate)}
        </td>
        <td className={cn("table-td tabular-nums text-xs", isLeaver ? "text-danger" : "text-fg-subtle")} title={r.e.endDate ?? undefined}>
          {formatJoinLeave(r.e.endDate)}
        </td>
        <td className="table-td text-right tabular-nums">
          <span className={r.arve < 0.65 ? "text-danger" : r.arve < 0.8 ? "text-warning" : "text-success"}>
            {formatPct(r.arve, 0)}
          </span>
        </td>
        <td className="table-td">
          <div className="flex flex-wrap gap-1">
            {r.projectNumbers.length === 0 && <span className="text-fg-subtle text-xs">—</span>}
            {r.projectNumbers.map((pn) => {
              const proj = projByNumber.get(pn);
              return (
                <Link key={pn} to={`/projects/${pn}`} className="chip hover:bg-brand/10">
                  {proj?.name.split(" — ")[0] ?? pn}
                </Link>
              );
            })}
          </div>
        </td>
        <td className="table-td text-right whitespace-nowrap">
          <div className="inline-flex items-center gap-1 opacity-40 group-hover:opacity-100 transition-opacity">
            <button
              className="btn !px-1.5 !py-1"
              title="Assign to project"
              disabled={isLeaver}
              onClick={() => openRowAction("assign", r.e.localNumber)}
            >
              <Briefcase className="w-3.5 h-3.5" />
            </button>
            <button
              className="btn !px-1.5 !py-1"
              title="Transfer to another PU"
              disabled={isLeaver}
              onClick={() => openRowAction("transfer", r.e.localNumber)}
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
            </button>
            <button
              className="btn !px-1.5 !py-1"
              title="Mark as leaver"
              disabled={isLeaver}
              onClick={() => openRowAction("leaver", r.e.localNumber)}
            >
              <UserMinus className="w-3.5 h-3.5" />
            </button>
          </div>
        </td>
      </tr>
    );
  }

  const enriched = useMemo(() => {
    return employees.map((e) => {
      const arve = trailingArve(e.localNumber, currentPeriod, snapshots, 3);
      const currentAssignments = employeeProjectsForPeriod(e.localNumber, currentPeriod, gfsHours);
      const totalHours = currentAssignments.reduce((s, a) => s + a.hours, 0);
      const uniqueProjects = Array.from(new Set(currentAssignments.map((a) => a.projectNumber)));
      return { e, arve, totalHours, projectNumbers: uniqueProjects };
    });
  }, [employees, snapshots, gfsHours]);

  const filtered = useMemo(() => {
    return enriched.filter((r) => {
      if (statusFilter === "active" && r.e.endDate) return false;
      if (statusFilter === "leavers" && !r.e.endDate) return false;
      if (q) {
        const qL = q.toLowerCase();
        if (!r.e.displayName.toLowerCase().includes(qL) && !r.e.localNumber.toLowerCase().includes(qL)) return false;
      }
      if (pu && r.e.puCode !== pu) return false;
      if (grade && r.e.gradeCode !== grade) return false;
      if (loc && r.e.locationCode !== loc) return false;
      if (projectFilter && !r.projectNumbers.includes(projectFilter)) return false;
      if (arveBand === "low" && r.arve >= 0.65) return false;
      if (arveBand === "mid" && (r.arve < 0.65 || r.arve >= 0.8)) return false;
      if (arveBand === "high" && r.arve < 0.8) return false;
      return true;
    });
  }, [enriched, q, pu, grade, loc, projectFilter, statusFilter, arveBand]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const dir = sort.dir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      let va: string | number = "";
      let vb: string | number = "";
      switch (sort.col) {
        case "name": va = a.e.displayName.toLowerCase(); vb = b.e.displayName.toLowerCase(); break;
        case "localNumber": va = a.e.localNumber; vb = b.e.localNumber; break;
        case "pu": va = puLabel(a.e.puCode); vb = puLabel(b.e.puCode); break;
        case "grade": va = a.e.gradeCode; vb = b.e.gradeCode; break;
        case "location":
          va = locations.find((l) => l.code === a.e.locationCode)?.displayName ?? a.e.locationCode;
          vb = locations.find((l) => l.code === b.e.locationCode)?.displayName ?? b.e.locationCode;
          break;
        case "joined": va = a.e.startDate ?? ""; vb = b.e.startDate ?? ""; break;
        case "left": va = a.e.endDate ?? "\uffff"; vb = b.e.endDate ?? "\uffff"; break;
        case "arve": va = a.arve; vb = b.arve; break;
        case "status": va = a.e.endDate ? 1 : 0; vb = b.e.endDate ? 1 : 0; break;
        case "projects": va = a.projectNumbers.length; vb = b.projectNumbers.length; break;
      }
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
    return arr;
  }, [filtered, sort, locations]);

  const groups = useMemo(() => {
    if (groupBy === "none") return null;
    const buckets = new Map<string, { label: string; rows: typeof sorted }>();
    for (const r of sorted) {
      let keys: string[] = [];
      let labels: string[] = [];
      if (groupBy === "location") {
        const code = r.e.locationCode;
        keys = [code];
        labels = [locations.find((l) => l.code === code)?.displayName ?? code];
      } else if (groupBy === "grade") {
        keys = [r.e.gradeCode];
        labels = [r.e.gradeCode];
      } else if (groupBy === "pu") {
        keys = [r.e.puCode];
        labels = [puLabel(r.e.puCode)];
      } else if (groupBy === "status") {
        keys = [r.e.endDate ? "leaver" : "active"];
        labels = [r.e.endDate ? "Leavers" : "Active"];
      } else if (groupBy === "project") {
        if (r.projectNumbers.length === 0) {
          keys = ["__unassigned__"];
          labels = ["Unassigned"];
        } else {
          keys = r.projectNumbers;
          labels = r.projectNumbers.map((pn) => projByNumber.get(pn)?.name.split(" — ")[0] ?? pn);
        }
      }
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        let bucket = buckets.get(k);
        if (!bucket) {
          bucket = { label: labels[i], rows: [] };
          buckets.set(k, bucket);
        }
        bucket.rows.push(r);
      }
    }
    return Array.from(buckets.entries())
      .map(([key, v]) => ({ key, label: v.label, rows: v.rows }))
      .sort((a, b) => {
        if (a.key === "__unassigned__") return -1;
        if (b.key === "__unassigned__") return 1;
        return a.label.localeCompare(b.label);
      });
  }, [sorted, groupBy, locations, projByNumber]);

  const paged = sorted.slice(page * ROWS_PER_PAGE, (page + 1) * ROWS_PER_PAGE);
  const totalPages = Math.max(1, Math.ceil(sorted.length / ROWS_PER_PAGE));

  const totalHc = filtered.length;
  const avgArve = filtered.length === 0 ? 0 : filtered.reduce((s, r) => s + r.arve, 0) / filtered.length;
  const lowCount = filtered.filter((r) => r.arve < 0.65).length;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Users className="w-5 h-5" /> People
          </h1>
          <p className="text-sm text-fg-muted">Every person in the practice with their current PU, grade, ARVE and project assignments.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button className="btn" onClick={() => { setSelectedLocalNumber(undefined); setModal("joiner"); }}>
            <UserPlus className="w-4 h-4" /> Add joiner
          </button>
          <button className="btn-primary" onClick={() => { setSelectedLocalNumber(undefined); setModal("person"); }}>
            <UserPlus className="w-4 h-4" /> Add person
          </button>
        </div>
      </div>

      <AddPersonModal open={modal === "person"} onClose={closeModal} />
      <AddJoinerModal open={modal === "joiner"} onClose={closeModal} />
      <AddLeaverModal open={modal === "leaver"} onClose={closeModal} preselectLocalNumber={selectedLocalNumber} />
      <TransferModal open={modal === "transfer"} onClose={closeModal} preselectLocalNumber={selectedLocalNumber} />
      <AssignProjectModal open={modal === "assign"} onClose={closeModal} preselectLocalNumber={selectedLocalNumber} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="card p-4">
          <div className="text-xs uppercase text-fg-muted tracking-wider">Headcount (filtered)</div>
          <div className="text-2xl font-semibold mt-1">{totalHc}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs uppercase text-fg-muted tracking-wider">Avg trailing 3m ARVE</div>
          <div className="text-2xl font-semibold mt-1">{formatPct(avgArve, 1)}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs uppercase text-fg-muted tracking-wider">On bench (&lt;65%)</div>
          <div className="text-2xl font-semibold mt-1 text-danger">{lowCount}</div>
        </div>
      </div>

      <div className="card p-3 flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-fg-muted" />
          <input
            className="bg-transparent text-sm focus:outline-none flex-1"
            placeholder="Search by name or employee number…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(0);
            }}
          />
        </div>
        <select className="input !w-auto" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as "active" | "leavers" | "all"); setPage(0); }}>
          <option value="active">Active only</option>
          <option value="leavers">Leavers only</option>
          <option value="all">All (incl. leavers)</option>
        </select>
        <select className="input !w-auto" value={pu} onChange={(e) => { setPu(e.target.value); setPage(0); }}>
          <option value="">All PUs</option>
          {productionUnits.filter((p) => !p.isVirtual).map((p) => (
            <option key={p.code} value={p.code}>{p.displayName}</option>
          ))}
        </select>
        <select className="input !w-auto" value={grade} onChange={(e) => { setGrade(e.target.value); setPage(0); }}>
          <option value="">All grades</option>
          {grades.map((g) => (
            <option key={g.code} value={g.code}>{g.code}</option>
          ))}
        </select>
        <select className="input !w-auto" value={loc} onChange={(e) => { setLoc(e.target.value); setPage(0); }}>
          <option value="">All locations</option>
          {locations.map((l) => (
            <option key={l.code} value={l.code}>{l.displayName}</option>
          ))}
        </select>
        <select className="input !w-auto" value={projectFilter} onChange={(e) => { setProjectFilter(e.target.value); setPage(0); }}>
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p.projectNumber} value={p.projectNumber}>
              {p.name.split(" — ")[0]}
            </option>
          ))}
        </select>
        <select
          className="input !w-auto"
          value={groupBy}
          onChange={(e) => { setGroupBy(e.target.value as GroupBy); setPage(0); setCollapsed(new Set()); }}
          title="Group rows by a dimension"
        >
          <option value="none">No grouping</option>
          <option value="location">Group: Location</option>
          <option value="grade">Group: Grade</option>
          <option value="pu">Group: PU</option>
          <option value="project">Group: Project</option>
          <option value="status">Group: Status</option>
        </select>
        <div className="flex items-center gap-1">
          {(["all", "low", "mid", "high"] as const).map((o) => (
            <button
              key={o}
              className={arveBand === o ? "pill-brand" : "chip"}
              onClick={() => { setArveBand(o); setPage(0); }}
              title={o === "low" ? "<65%" : o === "mid" ? "65–80%" : o === "high" ? "≥80%" : "any ARVE"}
            >
              ARVE {o === "all" ? "any" : o === "low" ? "<65%" : o === "mid" ? "65–80%" : "≥80%"}
            </button>
          ))}
        </div>
      </div>

      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <SortTh col="name" label="Name" sort={sort} onToggle={toggleSort} />
              <SortTh col="localNumber" label="Employee #" sort={sort} onToggle={toggleSort} />
              <SortTh col="pu" label="PU" sort={sort} onToggle={toggleSort} />
              <SortTh col="grade" label="Grade" sort={sort} onToggle={toggleSort} />
              <SortTh col="location" label="Location" sort={sort} onToggle={toggleSort} />
              <SortTh col="status" label="Status" sort={sort} onToggle={toggleSort} />
              <SortTh col="joined" label="Joined" sort={sort} onToggle={toggleSort} />
              <SortTh col="left" label="Left" sort={sort} onToggle={toggleSort} />
              <SortTh col="arve" label="ARVE (3m)" align="right" sort={sort} onToggle={toggleSort} />
              <SortTh col="projects" label={`Projects · ${currentPeriod}`} sort={sort} onToggle={toggleSort} />
              <th className="table-th text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {groups
              ? groups.map((g) => (
                  <Fragment key={g.key}>
                    <tr
                      className="bg-bg-muted/60 cursor-pointer hover:bg-bg-muted border-t border-border"
                      onClick={() => toggleGroup(g.key)}
                    >
                      <td colSpan={11} className="table-td font-medium">
                        <div className="flex items-center gap-2">
                          {collapsed.has(g.key) ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          <span>{g.label}</span>
                          <span className="chip !text-[10px] !px-1.5 !py-0">{g.rows.length}</span>
                        </div>
                      </td>
                    </tr>
                    {!collapsed.has(g.key) && g.rows.map((r) => renderPersonRow(r, g.key))}
                  </Fragment>
                ))
              : paged.map((r) => renderPersonRow(r, "flat"))}
            {(groups ? groups.length === 0 : paged.length === 0) && (
              <tr>
                <td colSpan={11} className="table-td text-center text-fg-muted py-6">No people match the current filters.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!groups && totalPages > 1 && (
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs text-fg-muted">
            Showing {page * ROWS_PER_PAGE + 1}–{Math.min((page + 1) * ROWS_PER_PAGE, filtered.length)} of {filtered.length}
          </div>
          <div className="flex items-center gap-1">
            <button className="btn" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Prev</button>
            <span className="text-xs tabular-nums px-2">{page + 1} / {totalPages}</span>
            <button className="btn" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}>Next</button>
          </div>
        </div>
      )}
    </div>
  );
}
