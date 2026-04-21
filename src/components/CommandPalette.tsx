import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "../store";
import { puLabel } from "../lib/demoData";

type Result = {
  kind: "pu" | "mu" | "project" | "employee" | "page";
  label: string;
  sub?: string;
  to: string;
};

export default function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState("");
  const navigate = useNavigate();
  const pus = useAppStore((s) => s.productionUnits);
  const mus = useAppStore((s) => s.marketUnits);
  const projects = useAppStore((s) => s.projects);
  const employees = useAppStore((s) => s.employees);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (open) onClose();
      }
      if (e.key === "Escape" && open) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const query = q.toLowerCase();
  const pages: Result[] = [
    { kind: "page", label: "Cockpit", to: "/" },
    { kind: "page", label: "Headcount & FTE trends", to: "/trends" },
    { kind: "page", label: "FC vs FC", to: "/fcfc" },
    { kind: "page", label: "FC vs Budget", to: "/fc-vs-budget" },
    { kind: "page", label: "Market Units", to: "/mu" },
    { kind: "page", label: "ARVE / Utilization", to: "/arve" },
    { kind: "page", label: "Projects", to: "/projects" },
    { kind: "page", label: "Pipeline", to: "/pipeline" },
    { kind: "page", label: "Bench", to: "/bench" },
    { kind: "page", label: "Joiners / Leavers", to: "/people-flow" },
    { kind: "page", label: "Scenarios", to: "/scenarios" },
    { kind: "page", label: "Review pack", to: "/review-pack" },
    { kind: "page", label: "Data quality", to: "/dq" },
    { kind: "page", label: "Ingestion", to: "/ingestion" },
    { kind: "page", label: "Admin", to: "/admin" },
  ];

  const results: Result[] = [
    ...pages.filter((p) => p.label.toLowerCase().includes(query)),
    ...pus.map<Result>((p) => ({ kind: "pu", label: puLabel(p.code), sub: p.displayName, to: `/pu/${p.code}` })).filter((r) =>
      r.label.toLowerCase().includes(query) || (r.sub ?? "").toLowerCase().includes(query),
    ),
    ...mus.map<Result>((m) => ({ kind: "mu", label: m.displayName, sub: m.code, to: "/mu" })).filter((r) => r.label.toLowerCase().includes(query)),
    ...projects
      .filter((p) => p.name.toLowerCase().includes(query) || p.projectNumber.includes(query))
      .slice(0, 5)
      .map<Result>((p) => ({ kind: "project", label: p.name, sub: p.projectNumber, to: "/projects" })),
    ...(query.length >= 2
      ? employees
          .filter((e) => e.displayName.toLowerCase().includes(query) || e.localNumber.includes(query))
          .slice(0, 6)
          .map<Result>((e) => ({ kind: "employee", label: e.displayName, sub: `${e.localNumber} · ${puLabel(e.puCode)}`, to: "/people-flow" }))
      : []),
  ].slice(0, 30);

  return (
    <div className="fixed inset-0 z-50 grid place-items-start justify-center pt-[10vh] bg-fg/30 backdrop-blur-sm" onClick={onClose}>
      <div className="w-[540px] max-w-[92vw] card overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-3 h-12 border-b border-border">
          <Search className="w-4 h-4 text-fg-muted" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search pages, PUs, Market Units, projects, people…"
            className="flex-1 bg-transparent focus:outline-none text-sm"
          />
          <button className="btn-ghost" onClick={onClose}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="max-h-[50vh] overflow-auto p-1">
          {results.length === 0 && <div className="p-4 text-sm text-fg-subtle text-center">No results.</div>}
          {results.map((r, i) => (
            <button
              key={`${r.kind}-${r.to}-${i}`}
              className="w-full flex items-center justify-between px-3 py-2 rounded-md hover:bg-bg-hover text-left"
              onClick={() => {
                navigate(r.to);
                onClose();
              }}
            >
              <div className="min-w-0">
                <div className="text-sm truncate">{r.label}</div>
                {r.sub && <div className="text-[11px] text-fg-muted truncate">{r.sub}</div>}
              </div>
              <span className="chip capitalize">{r.kind}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
