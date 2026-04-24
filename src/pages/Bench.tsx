import { useMemo, useState } from "react";
import { useAppStore } from "../store";
import { puLabel, DEMO_ANCHOR_PERIOD } from "../lib/demoData";
import { formatPct, formatNumber, periodAdd } from "../lib/utils";
import { Sparkles } from "lucide-react";

export default function Bench() {
  const employees = useAppStore((s) => s.employees);
  const snapshots = useAppStore((s) => s.snapshots);
  const projects = useAppStore((s) => s.projects);
  const projectDemand = useAppStore((s) => s.projectDemand);
  const [selected, setSelected] = useState<string | null>(null);

  // rolling 3m ARVE per employee
  const arveMap = useMemo(() => {
    const last3 = [periodAdd(DEMO_ANCHOR_PERIOD, -2), periodAdd(DEMO_ANCHOR_PERIOD, -1), DEMO_ANCHOR_PERIOD];
    const byEmp = new Map<string, number[]>();
    for (const s of snapshots) {
      if (!last3.includes(s.period)) continue;
      if (!byEmp.has(s.employeeLocalNumber)) byEmp.set(s.employeeLocalNumber, []);
      byEmp.get(s.employeeLocalNumber)!.push(s.arve);
    }
    const out = new Map<string, number>();
    for (const [k, vs] of byEmp.entries()) out.set(k, vs.reduce((a, v) => a + v, 0) / vs.length);
    return out;
  }, [snapshots]);

  const bench = useMemo(
    () =>
      employees
        .map((e) => ({ e, arve: arveMap.get(e.localNumber) ?? 0 }))
        .filter((x) => x.arve > 0 && x.arve < 0.65)
        .sort((a, b) => a.arve - b.arve)
        .slice(0, 40),
    [employees, arveMap],
  );

  const selectedEmp = bench.find((b) => b.e.localNumber === selected) ?? bench[0];

  // matching: score each project by skill overlap
  const matches = useMemo(() => {
    if (!selectedEmp) return [];
    const empSkills = new Set(selectedEmp.e.skills.map((s) => s.toLowerCase()));
    return projects
      .map((p) => {
        const projDemand = projectDemand.filter((d) => d.projectNumber === p.projectNumber && d.period >= DEMO_ANCHOR_PERIOD).slice(0, 6);
        const avgDemand = projDemand.reduce((a, d) => a + d.fteDemand, 0) / Math.max(1, projDemand.length);
        const tagHits = (p.tags ?? []).filter((t) => empSkills.has(t.toLowerCase())).length;
        const nameHits = selectedEmp.e.skills.filter((s) => p.name.toLowerCase().includes(s.toLowerCase())).length;
        const score = (tagHits + nameHits) * 10 + avgDemand * 0.5;
        return { project: p, score, avgDemand };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
  }, [selectedEmp, projects, projectDemand]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Bench & matching</h1>
        <p className="text-sm text-fg-muted">People with trailing 3-month ARVE below 65%, matched against open demand.</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-4">
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="table-th">Name</th>
                <th className="table-th">PU</th>
                <th className="table-th">Grade</th>
                <th className="table-th">Location</th>
                <th className="table-th text-right">3m ARVE</th>
                <th className="table-th">Skills</th>
              </tr>
            </thead>
            <tbody>
              {bench.map(({ e, arve }) => (
                <tr
                  key={e.localNumber}
                  className={selected === e.localNumber ? "bg-brand/5" : "hover:bg-bg-hover cursor-pointer"}
                  onClick={() => setSelected(e.localNumber)}
                >
                  <td className="table-td">
                    <div className="font-medium">{e.displayName}</div>
                    <div className="text-[11px] text-fg-muted">{e.localNumber}</div>
                  </td>
                  <td className="table-td">{puLabel(e.puCode)}</td>
                  <td className="table-td">{e.gradeCode}</td>
                  <td className="table-td">{e.locationCode}</td>
                  <td className="table-td text-right tabular-nums">
                    <span className={arve < 0.5 ? "pill-danger" : "pill-warning"}>{formatPct(arve, 0)}</span>
                  </td>
                  <td className="table-td">
                    <div className="flex flex-wrap gap-1">
                      {e.skills.slice(0, 3).map((s) => (
                        <span key={s} className="chip">{s}</span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <aside className="card p-4 h-fit">
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-brand" /> Suggested matches
          </h3>
          {selectedEmp ? (
            <>
              <div className="text-sm font-medium">{selectedEmp.e.displayName}</div>
              <div className="text-[11px] text-fg-muted">{puLabel(selectedEmp.e.puCode)} · {selectedEmp.e.gradeCode}</div>
              <div className="flex flex-wrap gap-1 mt-2">
                {selectedEmp.e.skills.map((s) => (
                  <span key={s} className="chip">{s}</span>
                ))}
              </div>
              <ul className="mt-4 space-y-2">
                {matches.map(({ project, score, avgDemand }) => (
                  <li key={project.projectNumber} className="border border-border rounded-lg p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium truncate">{project.name}</span>
                      <span className="pill-brand">{score.toFixed(0)} match</span>
                    </div>
                    <div className="text-[11px] text-fg-muted mt-0.5">
                      {project.customer} · {formatNumber(avgDemand, 1)} FTE avg
                    </div>
                  </li>
                ))}
              </ul>
              <button className="btn-primary w-full mt-4">Propose to PM</button>
            </>
          ) : (
            <div className="text-sm text-fg-subtle">Select a bench row on the left.</div>
          )}
        </aside>
      </div>
    </div>
  );
}
