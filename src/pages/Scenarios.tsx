import { useState } from "react";
import { Plus, Play, Users, Briefcase } from "lucide-react";
import { useAppStore } from "../store";
import { puLabel } from "../lib/demoData";

export default function Scenarios() {
  const scenarios = useAppStore((s) => s.scenarios);
  const promote = useAppStore((s) => s.promoteScenario);
  const addScenario = useAppStore((s) => s.addScenario);
  const activeCycleId = useAppStore((s) => s.activeCycleId);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  function onCreate(e: React.FormEvent) {
    e.preventDefault();
    addScenario({
      name: name || "Untitled scenario",
      description: description || "",
      baseCycleId: activeCycleId,
      owner: "Maciej Koszarek",
      status: "draft",
      changes: [],
    });
    setName("");
    setDescription("");
    setCreating(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Scenarios</h1>
          <p className="text-sm text-fg-muted">What-if analyses forked from the active cycle. Nothing affects canonical numbers until promoted.</p>
        </div>
        <button className="btn-primary" onClick={() => setCreating(true)}>
          <Plus className="w-4 h-4" /> New scenario
        </button>
      </div>

      {creating && (
        <form onSubmit={onCreate} className="card p-4 flex flex-col gap-2">
          <input className="input" placeholder="Scenario name" value={name} onChange={(e) => setName(e.target.value)} />
          <textarea className="input" rows={3} placeholder="What does this scenario test?" value={description} onChange={(e) => setDescription(e.target.value)} />
          <div className="flex gap-2 justify-end">
            <button type="button" className="btn" onClick={() => setCreating(false)}>Cancel</button>
            <button type="submit" className="btn-primary">Create</button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
        {scenarios.map((s) => (
          <div key={s.id} className="card p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">{s.name}</h3>
                <p className="text-[11px] text-fg-muted truncate">{s.description}</p>
              </div>
              <span
                className={
                  s.status === "promoted"
                    ? "pill-success"
                    : s.status === "shared"
                    ? "pill-brand"
                    : "chip"
                }
              >
                {s.status}
              </span>
            </div>

            <ul className="space-y-1 text-sm">
              {s.changes.length === 0 && <li className="text-fg-subtle text-xs">No changes yet.</li>}
              {s.changes.map((c) => (
                <li key={c.id} className="flex items-center gap-2">
                  {c.type.includes("joiner") || c.type.includes("headcount") ? (
                    <Users className="w-3.5 h-3.5 text-fg-muted" />
                  ) : (
                    <Briefcase className="w-3.5 h-3.5 text-fg-muted" />
                  )}
                  <span className="text-xs">
                    {c.type === "add_joiner" && `+${(c.payload as any).count} ${(c.payload as any).grade} in ${puLabel((c.payload as any).puCode)} (${c.effectivePeriod})`}
                    {c.type === "headcount_delta" && `${(c.payload as any).delta > 0 ? "+" : ""}${(c.payload as any).delta} HC in ${puLabel((c.payload as any).puCode)} (${c.effectivePeriod})`}
                    {c.type === "project_ramp" && `ramp ${(c.payload as any).project ?? "project"} ${c.effectivePeriod}`}
                  </span>
                </li>
              ))}
            </ul>

            <div className="flex items-center gap-2 pt-2 border-t border-border">
              <button className="btn flex-1"><Play className="w-3.5 h-3.5" /> Compare</button>
              {s.status !== "promoted" && (
                <button className="btn-primary" onClick={() => promote(s.id)}>Promote</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
