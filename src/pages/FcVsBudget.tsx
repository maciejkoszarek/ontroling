import { useMemo, useState } from "react";
import { useAppStore } from "../store";
import { leafPuCodes, rollingPeriods, puLabel } from "../lib/demoData";
import { ForecastIndex, indexBudget } from "../lib/forecast";
import Heatmap from "../components/Heatmap";
import { formatDelta, formatNumber, periodLabel } from "../lib/utils";
import type { ForecastMetric } from "../types";

const METRICS: Array<{ key: ForecastMetric; label: string }> = [
  { key: "FTE", label: "FTE" },
  { key: "BFTE", label: "bFTE" },
  { key: "HC_END", label: "HC end" },
  { key: "F_TOTAL", label: "F Total" },
];

export default function FcVsBudget() {
  const forecastCells = useAppStore((s) => s.forecastCells);
  const budget = useAppStore((s) => s.budget);
  const activeCycleId = useAppStore((s) => s.activeCycleId);
  const [metric, setMetric] = useState<ForecastMetric>("FTE");
  const [year, setYear] = useState(2026);

  const idx = useMemo(() => new ForecastIndex(forecastCells), [forecastCells]);
  const budgetIdx = useMemo(() => indexBudget(budget), [budget]);

  const cols = rollingPeriods.filter((p) => p.startsWith(String(year)));

  const cells = leafPuCodes.flatMap((pu) =>
    cols.map((p) => {
      const cur = idx.get(activeCycleId, pu, metric, p);
      const bud = budgetIdx.get(`${pu}::${metric}::${p}`) ?? 0;
      return { row: pu, col: p, value: cur - bud };
    }),
  );

  const totalPerPu = leafPuCodes.map((pu) => {
    const f = cols.reduce((a, p) => a + idx.get(activeCycleId, pu, metric, p), 0);
    const b = cols.reduce((a, p) => a + (budgetIdx.get(`${pu}::${metric}::${p}`) ?? 0), 0);
    return { pu, f, b, delta: f - b };
  });

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Forecast vs. Budget</h1>
          <p className="text-sm text-fg-muted">Current cycle vs. frozen annual budget for {year}.</p>
        </div>
        <div className="flex items-center gap-2">
          <select className="input !w-auto" value={metric} onChange={(e) => setMetric(e.target.value as ForecastMetric)}>
            {METRICS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
          <select className="input !w-auto" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            <option>2025</option>
            <option>2026</option>
            <option>2027</option>
          </select>
        </div>
      </div>

      <div className="card p-4">
        <Heatmap
          rows={leafPuCodes}
          cols={cols}
          cells={cells}
          diverging
          centerZero
          height={Math.max(280, leafPuCodes.length * 32 + 60)}
          valueFormatter={(v) => formatDelta(v, 1)}
          rowLabelFn={puLabel}
          colLabelFn={(p) => periodLabel(p, "short")}
        />
      </div>

      <div className="card p-4">
        <h2 className="text-sm font-semibold mb-3">Full-year landing ({year})</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="table-th">PU</th>
                <th className="table-th text-right">Budget {metric}</th>
                <th className="table-th text-right">Forecast {metric}</th>
                <th className="table-th text-right">Δ</th>
                <th className="table-th text-right">Δ %</th>
              </tr>
            </thead>
            <tbody>
              {totalPerPu.map((p) => (
                <tr key={p.pu} className="hover:bg-bg-hover">
                  <td className="table-td">{puLabel(p.pu)}</td>
                  <td className="table-td text-right tabular-nums">{formatNumber(p.b, 1)}</td>
                  <td className="table-td text-right tabular-nums">{formatNumber(p.f, 1)}</td>
                  <td className="table-td text-right tabular-nums">
                    <span className={p.delta > 0 ? "pill-success" : p.delta < 0 ? "pill-danger" : "chip"}>
                      {formatDelta(p.delta, 1)}
                    </span>
                  </td>
                  <td className="table-td text-right tabular-nums text-fg-muted">
                    {p.b ? `${((p.delta / p.b) * 100).toFixed(1)}%` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
