import { useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";
import { useAppStore } from "../store";
import { rollingPeriods, currentPeriod } from "../lib/demoData";
import Heatmap from "../components/Heatmap";
import { formatNumber, periodLabel } from "../lib/utils";

type Metric = "fte" | "bfte" | "coverage";

export default function MarketUnit() {
  const mus = useAppStore((s) => s.marketUnits);
  const projects = useAppStore((s) => s.projects);
  const projectDemand = useAppStore((s) => s.projectDemand);
  const [metric, setMetric] = useState<Metric>("fte");
  const [hoverMonth, setHoverMonth] = useState<string | null>(currentPeriod);

  const cols = rollingPeriods.slice(rollingPeriods.indexOf(currentPeriod) - 5, rollingPeriods.indexOf(currentPeriod) + 13);

  const fteByMuPeriod = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of projectDemand) {
      const proj = projects.find((p) => p.projectNumber === d.projectNumber);
      if (!proj) continue;
      const k = `${proj.marketUnit}::${d.period}`;
      map.set(k, (map.get(k) ?? 0) + d.fteDemand);
    }
    return map;
  }, [projectDemand, projects]);

  const cells = mus.map((mu) => cols.map((p) => ({
    row: mu.code,
    col: p,
    value: fteByMuPeriod.get(`${mu.code}::${p}`) ?? 0,
  }))).flat();

  const selectedMonth = hoverMonth ?? currentPeriod;
  const stacked = mus.map((mu) => ({
    name: mu.displayName,
    value: fteByMuPeriod.get(`${mu.code}::${selectedMonth}`) ?? 0,
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Market Units</h1>
          <p className="text-sm text-fg-muted">FTE demand distribution across Market Units and months.</p>
        </div>
        <select className="input !w-auto" value={metric} onChange={(e) => setMetric(e.target.value as Metric)}>
          <option value="fte">FTE demand</option>
          <option value="bfte">bFTE demand</option>
          <option value="coverage">Coverage % (bFTE / FTE)</option>
        </select>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4">
        <div className="card p-4">
          <Heatmap
            rows={mus.map((m) => m.code)}
            cols={cols}
            cells={cells}
            height={Math.max(320, mus.length * 36 + 80)}
            valueFormatter={(v) => formatNumber(v, 0)}
            rowLabelFn={(code) => mus.find((m) => m.code === code)?.displayName ?? code}
            colLabelFn={(p) => periodLabel(p, "short")}
            onCellClick={(row, col) => setHoverMonth(col)}
          />
        </div>

        <aside className="card p-4 space-y-3">
          <div>
            <div className="section-title">Stacked FTE — {periodLabel(selectedMonth, "long")}</div>
            <ReactECharts
              style={{ height: 240 }}
              option={{
                grid: { top: 10, bottom: 24, left: 80, right: 10 },
                xAxis: { type: "value", axisLabel: { fontSize: 10 } },
                yAxis: {
                  type: "category",
                  data: stacked.map((s) => s.name),
                  axisLabel: { fontSize: 10 },
                },
                series: [
                  {
                    type: "bar",
                    data: stacked.map((s) => s.value),
                    barMaxWidth: 18,
                    itemStyle: { color: "#2563eb" },
                    label: { show: true, fontSize: 10, position: "right" },
                  },
                ],
                tooltip: { trigger: "axis" },
              }}
              notMerge
              lazyUpdate
            />
          </div>

          <div>
            <div className="section-title">Top projects for {periodLabel(selectedMonth, "short")}</div>
            <ul className="mt-1 space-y-1.5">
              {projectDemand
                .filter((d) => d.period === selectedMonth)
                .sort((a, b) => b.fteDemand - a.fteDemand)
                .slice(0, 6)
                .map((d) => {
                  const proj = projects.find((p) => p.projectNumber === d.projectNumber);
                  return (
                    <li key={d.projectNumber} className="flex items-center justify-between text-sm">
                      <span className="truncate mr-2">{proj?.name ?? d.projectNumber}</span>
                      <span className="chip">{formatNumber(d.fteDemand, 1)} FTE</span>
                    </li>
                  );
                })}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
