import { useMemo } from "react";
import { useAppStore } from "../store";
import { formatNumber, periodLabel } from "../lib/utils";

const STATUSES: Array<{ key: "lead" | "qualified" | "proposal" | "won" | "lost"; label: string; color: string }> = [
  { key: "lead", label: "Lead", color: "bg-bg-muted" },
  { key: "qualified", label: "Qualified", color: "bg-brand/10" },
  { key: "proposal", label: "Proposal", color: "bg-warning/10" },
  { key: "won", label: "Won", color: "bg-success/10" },
  { key: "lost", label: "Lost", color: "bg-danger/10" },
];

export default function Pipeline() {
  const pipeline = useAppStore((s) => s.pipeline);
  const mus = useAppStore((s) => s.marketUnits);

  const byMu = useMemo(() => {
    const map = new Map<string, typeof pipeline>();
    for (const o of pipeline) {
      if (!map.has(o.marketUnit)) map.set(o.marketUnit, []);
      map.get(o.marketUnit)!.push(o);
    }
    return map;
  }, [pipeline]);

  const weightedTotal = pipeline.reduce((a, o) => a + o.weightedFte, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Pipeline</h1>
          <p className="text-sm text-fg-muted">Probability-weighted FTE demand per Market Unit.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="chip">Opportunities: {pipeline.length}</span>
          <span className="pill-brand">Weighted demand: {formatNumber(weightedTotal, 1)} FTE</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {Array.from(byMu.entries()).map(([muCode, opps]) => {
          const mu = mus.find((m) => m.code === muCode);
          const weighted = opps.reduce((a, o) => a + o.weightedFte, 0);
          return (
            <div key={muCode} className="card p-3">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="text-sm font-semibold">{mu?.displayName ?? muCode}</div>
                  <div className="text-[11px] text-fg-muted">{opps.length} opportunities</div>
                </div>
                <div className="pill-brand">{formatNumber(weighted, 1)} FTE</div>
              </div>
              <ul className="space-y-2">
                {opps.map((o) => {
                  const status = STATUSES.find((s) => s.key === o.status);
                  return (
                    <li key={o.id} className={`rounded-lg p-2 ${status?.color}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium truncate">{o.name}</span>
                        <span className="chip capitalize">{o.status}</span>
                      </div>
                      <div className="text-[11px] text-fg-muted mt-1">{periodLabel(o.period, "short")}</div>
                      <div className="mt-2 flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-bg-card overflow-hidden">
                          <div className="h-full bg-brand" style={{ width: `${Math.round(o.winProbability * 100)}%` }} />
                        </div>
                        <span className="text-[11px] tabular-nums text-fg-muted">
                          {Math.round(o.winProbability * 100)}% · {formatNumber(o.fteDemand, 0)} FTE
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
