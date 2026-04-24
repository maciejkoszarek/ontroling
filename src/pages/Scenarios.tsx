import { useState } from "react";
import { Plus, Play, Users, Briefcase } from "lucide-react";
import { useAppStore } from "../store";
import { puLabel } from "../lib/demoData";
import type { ScenarioChange } from "../types";

function pickString(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  return typeof value === "string" ? value : "";
}

function pickNumber(payload: Record<string, unknown>, key: string): number {
  const value = payload[key];
  return typeof value === "number" ? value : 0;
}

function describeChange(c: ScenarioChange): string {
  switch (c.type) {
    case "add_joiner": {
      const count = pickNumber(c.payload, "count");
      const grade = pickString(c.payload, "grade");
      const puCode = pickString(c.payload, "puCode");
      return `+${count} ${grade} in ${puLabel(puCode)} (${c.effectivePeriod})`;
    }
    case "headcount_delta": {
      const delta = pickNumber(c.payload, "delta");
      const puCode = pickString(c.payload, "puCode");
      const sign = delta > 0 ? "+" : "";
      return `${sign}${delta} HC in ${puLabel(puCode)} (${c.effectivePeriod})`;
    }
    case "project_ramp": {
      const project = pickString(c.payload, "project") || "project";
      return `ramp ${project} ${c.effectivePeriod}`;
    }
    default:
      return "";
  }
}

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
                  <span className="text-xs">{describeChange(c)}</span>
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
