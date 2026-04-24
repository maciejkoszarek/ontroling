import { useState } from "react";
import TrendChart from "../components/TrendChart";
import { useAppStore } from "../store";
import { leafPuCodes, rollingPeriods, DEMO_ANCHOR_PERIOD, puLabel } from "../lib/demoData";
import { useForecastIndex } from "../hooks/useForecastIndex";
import KpiCard from "../components/KpiCard";
import type { ForecastMetric } from "../types";

const SERIES_OPTIONS: ReadonlyArray<{
  key: ForecastMetric;
  label: string;
  color: string;
}> = [
  { key: "HC_END", label: "HC end", color: "#2563eb" },
  { key: "FTE", label: "FTE", color: "#1d4ed8" },
  { key: "BFTE", label: "bFTE", color: "#16a34a" },
  { key: "JOINERS", label: "Joiners", color: "#22c55e" },
  { key: "LEAVERS", label: "Leavers", color: "#ef4444" },
];

export default function Trends() {
  const activeCycleId = useAppStore((s) => s.activeCycleId);
  const filter = useAppStore((s) => s.filter);
  const [enabled, setEnabled] = useState<string[]>(["HC_END", "FTE", "BFTE"]);
  const [puFilter, setPuFilter] = useState<string>(filter.pu ?? "CCA_TOTAL");

  const { index: idx } = useForecastIndex();

  function valueFor(metric: ForecastMetric, p: string) {
    if (puFilter === "CCA_TOTAL") {
      return leafPuCodes.reduce((a, pu) => a + idx.get(activeCycleId, pu, metric, p), 0);
    }
    return idx.get(activeCycleId, puFilter, metric, p);
  }

  const series = SERIES_OPTIONS.filter((o) => enabled.includes(o.key)).map((o) => ({
    name: o.label,
    data: rollingPeriods.map((p) => valueFor(o.key, p)),
    color: o.color,
    type: ((o.key === "JOINERS" || o.key === "LEAVERS") ? "bar" : "line") as "line" | "bar",
  }));

  const totalHc = valueFor("HC_END", DEMO_ANCHOR_PERIOD);
  const totalFte = valueFor("FTE", DEMO_ANCHOR_PERIOD);
  const totalBfte = valueFor("BFTE", DEMO_ANCHOR_PERIOD);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Headcount & FTE trends</h1>
          <p className="text-sm text-fg-muted">Rolling 24 months across actuals and forecast.</p>
        </div>
        <div className="flex items-center gap-2">
          <select className="input !w-auto" value={puFilter} onChange={(e) => setPuFilter(e.target.value)}>
            <option value="CCA_TOTAL">CCA Total</option>
            {leafPuCodes.map((p) => (
              <option key={p} value={p}>
                {puLabel(p)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard label="HC end" value={totalHc} fractionDigits={0} />
        <KpiCard label="FTE assigned" value={totalFte} />
        <KpiCard label="bFTE" value={totalBfte} />
      </div>

      <div className="card p-4">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <h2 className="text-sm font-semibold">Series</h2>
          <div className="flex gap-1.5 flex-wrap">
            {SERIES_OPTIONS.map((o) => (
              <button
                key={o.key}
                className={enabled.includes(o.key) ? "pill-brand" : "chip"}
                onClick={() => setEnabled((e) => (e.includes(o.key) ? e.filter((k) => k !== o.key) : [...e, o.key]))}
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: o.color }} />
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <TrendChart periods={rollingPeriods} series={series} markPeriod={DEMO_ANCHOR_PERIOD} height={420} />
      </div>
    </div>
  );
}
