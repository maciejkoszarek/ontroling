import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { useAppStore } from "../store";
import { leafPuCodes, rollingPeriods, currentPeriod, puLabel } from "../lib/demoData";
import { ForecastIndex, attributeVariance, effectiveCells } from "../lib/forecast";
import Heatmap from "../components/Heatmap";
import { formatDelta, formatNumber, periodLabel } from "../lib/utils";
import type { ForecastMetric } from "../types";

const METRICS: Array<{ key: ForecastMetric; label: string }> = [
  { key: "HC_END", label: "HC end" },
  { key: "FTE", label: "FTE" },
  { key: "BFTE", label: "bFTE" },
  { key: "F1", label: "F1" },
  { key: "F2", label: "F2" },
  { key: "F_TOTAL", label: "F Total" },
  { key: "ARVE_PCT", label: "ARVE %" },
];

export default function FcFc() {
  const cycles = useAppStore((s) => s.cycles);
  const activeCycleId = useAppStore((s) => s.activeCycleId);
  const previousCycleId = useAppStore((s) => s.previousCycleId);
  const forecastCells = useAppStore((s) => s.forecastCells);
  const lockedSnapshots = useAppStore((s) => s.lockedSnapshots);
  const [metric, setMetric] = useState<ForecastMetric>("FTE");
  const [current, setCurrent] = useState(activeCycleId);
  const [previous, setPrevious] = useState(previousCycleId);
  const [selected, setSelected] = useState<{ pu: string; period: string; delta: number } | null>(null);

  const merged = useMemo(
    () => effectiveCells(forecastCells, lockedSnapshots, cycles),
    [forecastCells, lockedSnapshots, cycles],
  );
  const idx = useMemo(() => new ForecastIndex(merged), [merged]);

  const currentCycle = cycles.find((c) => c.id === current);
  const previousCycle = cycles.find((c) => c.id === previous);

  // 18-month horizon for the matrix
  const cols = rollingPeriods.slice(rollingPeriods.indexOf(currentPeriod) - 3, rollingPeriods.indexOf(currentPeriod) + 12);

  const cells = leafPuCodes.flatMap((pu) =>
    cols.map((p) => {
      const cur = idx.get(current, pu, metric, p);
      const prev = idx.get(previous, pu, metric, p);
      return { row: pu, col: p, value: cur - prev };
    }),
  );

  const topMovements = [...cells]
    .filter((c) => Math.abs(c.value) >= 0.5)
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, 10);

  const totalDelta = cells.reduce((a, c) => a + c.value, 0);
  const attribution = selected ? attributeVariance(selected.delta) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Forecast vs. previous Forecast</h1>
          <p className="text-sm text-fg-muted">
            Δ (current − previous) for each PU × month.
            <span className="ml-2 chip">Total {formatDelta(totalDelta, 1)}</span>
            {currentCycle && (currentCycle.status === "locked" || currentCycle.status === "archived") && (
              <span className="ml-2 chip">Current: frozen snapshot</span>
            )}
            {previousCycle && (previousCycle.status === "locked" || previousCycle.status === "archived") && (
              <span className="ml-2 chip">Previous: frozen snapshot</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select className="input !w-auto" value={metric} onChange={(e) => setMetric(e.target.value as ForecastMetric)}>
            {METRICS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
          <select className="input !w-auto" value={current} onChange={(e) => setCurrent(e.target.value)}>
            {cycles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <span className="text-fg-muted text-sm">vs</span>
          <select className="input !w-auto" value={previous} onChange={(e) => setPrevious(e.target.value)}>
            {cycles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <button className="btn">
            <Download className="w-4 h-4" /> Export
          </button>
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
          onCellClick={(row, col, val) => setSelected({ pu: row, period: col, delta: val })}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-4">
        <div className="card p-4">
          <h2 className="text-sm font-semibold mb-3">Top movements</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="table-th">PU</th>
                  <th className="table-th">Period</th>
                  <th className="table-th text-right">Previous</th>
                  <th className="table-th text-right">Current</th>
                  <th className="table-th text-right">Δ</th>
                  <th className="table-th">Narrative</th>
                </tr>
              </thead>
              <tbody>
                {topMovements.map((m) => {
                  const cur = idx.get(current, m.row, metric, m.col);
                  const prev = idx.get(previous, m.row, metric, m.col);
                  return (
                    <tr key={`${m.row}-${m.col}`} className="hover:bg-bg-hover cursor-pointer" onClick={() => setSelected({ pu: m.row, period: m.col, delta: m.value })}>
                      <td className="table-td">{puLabel(m.row)}</td>
                      <td className="table-td">{periodLabel(m.col, "short")}</td>
                      <td className="table-td text-right tabular-nums">{formatNumber(prev, 1)}</td>
                      <td className="table-td text-right tabular-nums">{formatNumber(cur, 1)}</td>
                      <td className="table-td text-right tabular-nums">
                        <span className={m.value > 0 ? "pill-success" : "pill-danger"}>{formatDelta(m.value, 1)}</span>
                      </td>
                      <td className="table-td text-fg-muted text-xs">Driven by joiners + project ramp</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="card p-4 sticky top-20 h-fit">
          <h3 className="text-sm font-semibold mb-2">What changed?</h3>
          {selected ? (
            <>
              <div className="text-[11px] text-fg-muted">
                {puLabel(selected.pu)} — {periodLabel(selected.period, "long")}
              </div>
              <div className="text-2xl font-semibold tabular-nums mt-1">
                <span className={selected.delta > 0 ? "text-success" : "text-danger"}>
                  {formatDelta(selected.delta, 1)}
                </span>
              </div>
              <div className="mt-3 space-y-2">
                {attribution?.map((a) => (
                  <div key={a.driver} className="text-sm">
                    <div className="flex items-center justify-between">
                      <span className="capitalize">{a.driver.replace("_", " ")}</span>
                      <span className={a.contribution >= 0 ? "pill-success" : "pill-danger"}>
                        {formatDelta(a.contribution, 1)}
                      </span>
                    </div>
                    <div className="text-[11px] text-fg-muted">{a.narrative}</div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="text-sm text-fg-subtle">Click a heatmap cell or a row to see a drill-down.</div>
          )}
        </aside>
      </div>
    </div>
  );
}
