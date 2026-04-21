import { useState } from "react";
import { CheckSquare, Square, FileText, Download, Eye } from "lucide-react";
import { useAppStore } from "../store";
import { periodLabel } from "../lib/utils";

const SCREENS = [
  { id: "cockpit", label: "Cockpit (KPIs + trend)", default: true },
  { id: "fcfc", label: "Forecast vs previous Forecast (FC/FC)", default: true },
  { id: "mu", label: "Market Unit heatmap", default: true },
  { id: "arve", label: "ARVE / Utilization matrix", default: true },
  { id: "people-flow", label: "Joiners & Leavers", default: true },
  { id: "fc-budget", label: "FC vs Budget", default: false },
  { id: "bench", label: "Bench & matching", default: false },
  { id: "projects", label: "Project forecast", default: false },
  { id: "scenarios", label: "Scenarios overview", default: false },
];

const PAST_PACKS = [
  { label: "Practice CCA — FC March 2026", date: "2026-03-14" },
  { label: "Practice CCA — FC February 2026", date: "2026-02-13" },
  { label: "Practice CCA — FC January 2026", date: "2026-01-15" },
  { label: "Practice CCA — Closing 2025", date: "2026-01-08" },
];

export default function ReviewPack() {
  const cycles = useAppStore((s) => s.cycles);
  const activeCycleId = useAppStore((s) => s.activeCycleId);
  const [cycleId, setCycleId] = useState(activeCycleId);
  const [selected, setSelected] = useState<string[]>(SCREENS.filter((s) => s.default).map((s) => s.id));
  const [format, setFormat] = useState<"pdf" | "pptx">("pdf");
  const [summary, setSummary] = useState("");

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  function generate() {
    alert(
      `Review pack "${cycles.find((c) => c.id === cycleId)?.label}" will generate a ${format.toUpperCase()} with:\n- ${selected.join("\n- ")}`,
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Monthly review pack</h1>
        <p className="text-sm text-fg-muted">Generate a PDF / PPTX for executive review.</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-4 items-start">
        <div className="card p-4 space-y-4">
          <div>
            <label className="section-title">Cycle</label>
            <select className="input mt-1 !w-auto" value={cycleId} onChange={(e) => setCycleId(e.target.value)}>
              {cycles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="section-title">Screens to include</label>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {SCREENS.map((s) => {
                const isOn = selected.includes(s.id);
                return (
                  <button key={s.id} className={isOn ? "btn border-brand bg-brand/5 justify-start" : "btn justify-start"} onClick={() => toggle(s.id)}>
                    {isOn ? <CheckSquare className="w-4 h-4 text-brand" /> : <Square className="w-4 h-4" />}
                    <span className="text-sm">{s.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="section-title">Controller commentary</label>
            <textarea
              rows={4}
              className="input mt-1"
              placeholder="Narrative for the review deck — what changed, why, what it means…"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 pt-2 border-t border-border">
            <div className="flex items-center gap-1">
              <button className={format === "pdf" ? "pill-brand" : "chip"} onClick={() => setFormat("pdf")}>PDF</button>
              <button className={format === "pptx" ? "pill-brand" : "chip"} onClick={() => setFormat("pptx")}>PPTX</button>
            </div>
            <div className="flex-1" />
            <button className="btn"><Eye className="w-4 h-4" /> Preview</button>
            <button className="btn-primary" onClick={generate}>
              <FileText className="w-4 h-4" /> Generate pack
            </button>
          </div>
        </div>

        <aside className="card p-4">
          <h3 className="text-sm font-semibold mb-2">Past packs</h3>
          <ul className="space-y-1.5 text-sm">
            {PAST_PACKS.map((p) => (
              <li key={p.date} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-bg-hover">
                <div className="min-w-0">
                  <div className="truncate">{p.label}</div>
                  <div className="text-[11px] text-fg-muted">{p.date}</div>
                </div>
                <button className="btn-ghost"><Download className="w-3.5 h-3.5" /></button>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}
