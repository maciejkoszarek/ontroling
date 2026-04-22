import { useMemo, useState } from "react";
import { useAppStore } from "../store";
import { leafPuCodes, rollingPeriods, currentPeriod, puLabel } from "../lib/demoData";
import { ForecastIndex } from "../lib/forecast";
import { formatPct, periodLabel } from "../lib/utils";
import ReactECharts from "echarts-for-react";

export default function Arve() {
  const forecastCells = useAppStore((s) => s.forecastCells);
  const activeCycleId = useAppStore((s) => s.activeCycleId);
  const [rolling, setRolling] = useState(false);
  const [selected, setSelected] = useState<{ pu: string; period: string } | null>(null);

  const idx = useMemo(() => new ForecastIndex(forecastCells), [forecastCells]);

  function arveAt(pu: string, period: string): number {
    if (!rolling) return idx.get(activeCycleId, pu, "ARVE_PCT", period);
    const pi = rollingPeriods.indexOf(period);
    const slice = rollingPeriods.slice(Math.max(0, pi - 2), pi + 1);
    const vs = slice.map((p) => idx.get(activeCycleId, pu, "ARVE_PCT", p));
    return vs.reduce((a, v) => a + v, 0) / Math.max(1, vs.length);
  }

  const cols = rollingPeriods;

  function band(v: number): string {
    if (v < 0.65) return "#fecaca";
    if (v < 0.80) return "#fde68a";
    return "#bbf7d0";
  }

  // histogram for currently selected month
  const histPeriod = selected?.period ?? currentPeriod;
  const histBuckets = [
    { label: "< 65%", min: 0, max: 0.65, color: "#ef4444" },
    { label: "65–80%", min: 0.65, max: 0.80, color: "#f59e0b" },
    { label: "80–95%", min: 0.80, max: 0.95, color: "#22c55e" },
    { label: "95%+", min: 0.95, max: 2, color: "#1d4ed8" },
  ];
  const histCounts = histBuckets.map((b) => leafPuCodes.filter((pu) => {
    const v = arveAt(pu, histPeriod);
    return v >= b.min && v < b.max;
  }).length);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">ARVE / Utilization</h1>
          <p className="text-sm text-fg-muted">Practice-level utilization matrix. Banding: red &lt;65%, yellow 65–80%, green ≥80%.</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-fg-muted">
          <input type="checkbox" checked={rolling} onChange={(e) => setRolling(e.target.checked)} className="rounded border-border" />
          Rolling 3-month average
        </label>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4">
        <div className="card p-4 overflow-auto">
          <table className="w-full border-separate border-spacing-0 text-xs">
            <thead>
              <tr>
                <th className="table-th sticky left-0 z-20 bg-bg-card" style={{ minWidth: 160 }}>PU</th>
                {cols.map((c) => (
                  <th key={c} className="table-th text-right" style={{ minWidth: 58 }}>
                    <div className="flex flex-col items-end leading-tight">
                      <span className="uppercase">{periodLabel(c, "short").split(" ")[0]}</span>
                      <span className="text-[9px] text-fg-subtle">{c.slice(0, 4)}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leafPuCodes.map((pu) => (
                <tr key={pu}>
                  <td className="table-td sticky left-0 z-10 bg-bg-card font-medium">{puLabel(pu)}</td>
                  {cols.map((c) => {
                    const v = arveAt(pu, c);
                    return (
                      <td
                        key={c}
                        onClick={() => setSelected({ pu, period: c })}
                        className="table-td text-right tabular-nums cursor-pointer"
                        style={{ backgroundColor: band(v) + "80" }}
                        title={`${puLabel(pu)} — ${periodLabel(c, "long")}: ${formatPct(v)}`}
                      >
                        {formatPct(v, 0)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <aside className="card p-4 space-y-4 h-fit">
          <div>
            <h3 className="text-sm font-semibold">Distribution — {periodLabel(histPeriod, "long")}</h3>
            <ReactECharts
              style={{ height: 200 }}
              option={{
                grid: { top: 10, bottom: 24, left: 30, right: 10 },
                xAxis: {
                  type: "category",
                  data: histBuckets.map((b) => b.label),
                  axisLabel: { fontSize: 10 },
                },
                yAxis: { type: "value", axisLabel: { fontSize: 10 } },
                series: [
                  {
                    type: "bar",
                    data: histCounts.map((c, i) => ({ value: c, itemStyle: { color: histBuckets[i].color } })),
                    barMaxWidth: 28,
                    label: { show: true, fontSize: 10 },
                  },
                ],
                tooltip: {},
              }}
              notMerge
              lazyUpdate
            />
          </div>

          {selected ? (
            <div>
              <div className="section-title">Selected cell</div>
              <div className="text-base font-medium">{puLabel(selected.pu)}</div>
              <div className="text-[11px] text-fg-muted">{periodLabel(selected.period, "long")}</div>
              <div className="text-2xl font-semibold tabular-nums mt-1">{formatPct(arveAt(selected.pu, selected.period))}</div>
              <a
                href="/bench"
                className="btn-primary w-full mt-3 justify-center"
              >
                Suggest projects for bench
              </a>
            </div>
          ) : (
            <div className="text-sm text-fg-subtle">Click a cell to drill in.</div>
          )}

          <div>
            <div className="section-title">Legend</div>
            <div className="flex items-center gap-2 mt-1 text-xs"><span className="w-3 h-3 rounded" style={{ background: "#fecaca" }} /> &lt; 65%</div>
            <div className="flex items-center gap-2 text-xs"><span className="w-3 h-3 rounded" style={{ background: "#fde68a" }} /> 65–80%</div>
            <div className="flex items-center gap-2 text-xs"><span className="w-3 h-3 rounded" style={{ background: "#bbf7d0" }} /> ≥ 80%</div>
          </div>
        </aside>
      </div>
    </div>
  );
}
