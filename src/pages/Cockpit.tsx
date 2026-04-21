import { useMemo } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowUpRight, ExternalLink, PieChart as PieChartIcon } from "lucide-react";
import type { ForecastMetric } from "../types";
import KpiCard from "../components/KpiCard";
import TrendChart from "../components/TrendChart";
import CommentFeed from "../components/CommentFeed";
import { useAppStore } from "../store";
import { leafPuCodes, rollingPeriods, currentPeriod as currentPeriodConst, puLabel } from "../lib/demoData";
import { ForecastIndex } from "../lib/forecast";
import { formatDelta, formatNumber, formatPct, periodLabel } from "../lib/utils";

export default function Cockpit() {
  const forecastCells = useAppStore((s) => s.forecastCells);
  const activeCycleId = useAppStore((s) => s.activeCycleId);
  const previousCycleId = useAppStore((s) => s.previousCycleId);
  const cycles = useAppStore((s) => s.cycles);
  const anomalies = useAppStore((s) => s.anomalies);
  const joiners = useAppStore((s) => s.joiners);

  const cycle = cycles.find((c) => c.id === activeCycleId);
  const period = cycle?.periodOpened ?? currentPeriodConst;

  const idx = useMemo(() => new ForecastIndex(forecastCells), [forecastCells]);

  function sumAll(metric: ForecastMetric, cycleId: string, p: string) {
    return leafPuCodes.reduce((a, pu) => a + idx.get(cycleId, pu, metric, p), 0);
  }
  function weightedArve(cycleId: string, p: string) {
    const fts = leafPuCodes.map((pu) => idx.get(cycleId, pu, "FTE", p));
    const arves = leafPuCodes.map((pu) => idx.get(cycleId, pu, "ARVE_PCT", p));
    const total = fts.reduce((a, v) => a + v, 0);
    if (total === 0) return 0;
    return arves.reduce((a, v, i) => a + v * fts[i], 0) / total;
  }

  const hc = sumAll("HC_END", activeCycleId, period);
  const hcPrev = sumAll("HC_END", previousCycleId, period);
  const fte = sumAll("FTE", activeCycleId, period);
  const ftePrev = sumAll("FTE", previousCycleId, period);
  const bfte = sumAll("BFTE", activeCycleId, period);
  const bftePrev = sumAll("BFTE", previousCycleId, period);
  const arve = weightedArve(activeCycleId, period);
  const arvePrev = weightedArve(previousCycleId, period);

  const hcSeries = rollingPeriods.map((p) => sumAll("HC_END", activeCycleId, p));
  const fteSeries = rollingPeriods.map((p) => sumAll("FTE", activeCycleId, p));
  const bfteSeries = rollingPeriods.map((p) => sumAll("BFTE", activeCycleId, p));
  const arveSeries = rollingPeriods.map((p) => weightedArve(activeCycleId, p) * 100);
  const demandSeries = rollingPeriods.map((p) => sumAll("BFTE", activeCycleId, p) * 1.08); // mock demand line

  // variance leaderboard
  const leaderboard = leafPuCodes
    .map((pu) => {
      const cur = idx.get(activeCycleId, pu, "FTE", period);
      const prev = idx.get(previousCycleId, pu, "FTE", period);
      const delta = cur - prev;
      return { pu, cur, prev, delta };
    })
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 5);

  const plannedJoinersNextMonth = joiners.filter((j) => j.status === "planned" && j.startDate.slice(0, 7) === period).length;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Cockpit</h1>
          <p className="text-sm text-fg-muted">{cycle?.label} — as of {periodLabel(period, "long")}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="chip">Rolling 24 months</span>
          <Link to="/review-pack" className="btn">
            Generate review pack <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Headcount (end of month)"
          value={hc}
          fractionDigits={0}
          delta={hc - hcPrev}
          deltaLabel={`vs ${cycles.find((c) => c.id === previousCycleId)?.label ?? "prev FC"}`}
          series={hcSeries}
        />
        <KpiCard
          label="FTE assigned (CSS)"
          value={fte}
          delta={fte - ftePrev}
          deltaLabel={`vs prev FC`}
          series={fteSeries}
        />
        <KpiCard
          label="bFTE (billable)"
          value={bfte}
          delta={bfte - bftePrev}
          deltaLabel={`vs prev FC`}
          series={bfteSeries}
          tone={bfte - bftePrev < 0 ? "warning" : "default"}
        />
        <KpiCard
          label="ARVE %"
          value={arve * 100}
          fractionDigits={1}
          unit="%"
          delta={(arve - arvePrev) * 100}
          deltaLabel={`vs prev FC`}
          series={arveSeries}
          tone={arve < 0.75 ? "warning" : "success"}
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard
          label="On bench (FTE)"
          value={sumAll("BENCH_FTE", activeCycleId, period)}
          fractionDigits={1}
          tone={sumAll("BENCH_FTE", activeCycleId, period) / Math.max(1, fte) > 0.08 ? "danger" : "warning"}
        />
        <KpiCard label="Vacation (FTE)" value={sumAll("VACATION_FTE", activeCycleId, period)} fractionDigits={1} />
        <KpiCard label="Sickness (FTE)" value={sumAll("SICKNESS_FTE", activeCycleId, period)} fractionDigits={1} />
        <KpiCard label="L&D (FTE)" value={sumAll("LND_FTE", activeCycleId, period)} fractionDigits={1} />
        <KpiCard label="MAN reserve (FTE)" value={sumAll("MAN_FTE", activeCycleId, period)} fractionDigits={1} />
        <KpiCard label="Students (HC)" value={sumAll("STUDENTS_HC", activeCycleId, period)} fractionDigits={0} />
      </div>

      <div className="card p-4">
        <h2 className="text-sm font-semibold mb-2 flex items-center gap-2">
          <PieChartIcon className="w-4 h-4 text-brand" /> Total FTE breakdown · {periodLabel(period, "short")}
        </h2>
        <p className="text-[11px] text-fg-muted mb-3">
          Whole-practice split across billable (BDC), non-billable (Bench/L&D/MAN/Reserve/Recruitment/Internal) and absence (Vacation/Sickness/Unpaid leave).
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3 text-xs">
          {(
            [
              { label: "BDC Sold", metric: "BDC_SOLD_FTE", tone: "text-emerald-700" },
              { label: "BDC-PL", metric: "BDC_PL_FTE", tone: "text-emerald-700" },
              { label: "IDC-Bench", metric: "BENCH_FTE", tone: "text-danger" },
              { label: "L&D", metric: "LND_FTE", tone: "text-indigo-700" },
              { label: "MAN reserve", metric: "MAN_FTE", tone: "text-fg-muted" },
              { label: "Reserve pool", metric: "RESERVE_FTE", tone: "text-fg-muted" },
              { label: "Recruitment", metric: "RECRUITMENT_FTE", tone: "text-fg-muted" },
              { label: "Internal projects", metric: "INTERNAL_PROJECTS_FTE", tone: "text-fg-muted" },
              { label: "Vacation", metric: "VACATION_FTE", tone: "text-sky-700" },
              { label: "Sickness", metric: "SICKNESS_FTE", tone: "text-amber-700" },
              { label: "Unpaid leave", metric: "UNPAID_LEAVE_FTE", tone: "text-fg-muted" },
              { label: "Overtime", metric: "OVERTIME_FTE", tone: "text-fg-muted" },
            ] as Array<{ label: string; metric: ForecastMetric; tone: string }>
          ).map((r) => {
            const v = sumAll(r.metric, activeCycleId, period);
            const pct = fte === 0 ? 0 : v / fte;
            return (
              <div key={r.metric} className="rounded-md border border-border p-2">
                <div className={`text-[11px] font-medium ${r.tone}`}>{r.label}</div>
                <div className="text-base font-semibold tabular-nums mt-0.5">{formatNumber(v, 1)}</div>
                <div className="text-[11px] text-fg-muted">{(pct * 100).toFixed(1)}% of FTE</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 card p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold">Headcount, FTE & bFTE trend</h2>
              <p className="text-[11px] text-fg-muted">Actuals vs forecast — dashed line at {periodLabel(period, "short")}</p>
            </div>
            <Link to="/trends" className="btn-ghost">
              Open trends <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
          <TrendChart
            periods={rollingPeriods}
            markPeriod={period}
            dualAxis
            series={[
              { name: "HC (end)", type: "bar", data: hcSeries, color: "#93c5fd" },
              { name: "FTE", data: fteSeries, color: "#1d4ed8" },
              { name: "bFTE", data: bfteSeries, color: "#16a34a" },
              { name: "Demand (weighted)", data: demandSeries, color: "#f59e0b", smooth: true },
              { name: "ARVE %", data: arveSeries, color: "#dc2626", yAxisIndex: 1 },
            ]}
            height={360}
          />
        </div>

        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">Variance vs previous FC</h2>
            <Link to="/fcfc" className="btn-ghost">
              Open FC/FC <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
          <ul className="space-y-1.5">
            {leaderboard.map((l) => (
              <li key={l.pu}>
                <Link
                  to={`/pu/${l.pu}`}
                  className="flex items-center justify-between gap-2 px-2 py-2 rounded-md hover:bg-bg-hover"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{puLabel(l.pu)}</div>
                    <div className="text-[11px] text-fg-muted">
                      FTE {formatNumber(l.prev, 1)} → {formatNumber(l.cur, 1)}
                    </div>
                  </div>
                  <span
                    className={
                      l.delta > 0
                        ? "pill-success"
                        : l.delta < 0
                        ? "pill-danger"
                        : "chip"
                    }
                  >
                    {formatDelta(l.delta, 1)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="card p-4">
          <h2 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-warning" /> Anomalies
            <span className="chip ml-auto">{anomalies.length}</span>
          </h2>
          <ul className="space-y-2">
            {anomalies.map((a) => (
              <li key={a.id} className="text-sm">
                <div className="flex items-center gap-2">
                  <span
                    className={
                      a.severity === "critical"
                        ? "pill-danger"
                        : a.severity === "warning"
                        ? "pill-warning"
                        : "pill-brand"
                    }
                  >
                    {a.severity}
                  </span>
                  <span className="font-medium">{puLabel(a.scopeId)}</span>
                </div>
                <div className="text-fg-muted text-[13px] mt-0.5 ml-1">{a.message}</div>
              </li>
            ))}
            {anomalies.length === 0 && <li className="text-sm text-fg-subtle">All green.</li>}
          </ul>
        </div>

        <div className="card p-4 space-y-3">
          <h2 className="text-sm font-semibold">This cycle at a glance</h2>
          <Row label="Cycle" value={cycle?.label ?? "—"} />
          <Row label="Status" value={cycle?.status ?? "—"} />
          <Row label="Period" value={periodLabel(period, "long")} />
          <Row label="Planned joiners" value={String(plannedJoinersNextMonth)} />
          <Row label="ARVE target" value={formatPct(0.82, 0)} />
          <Row label="Last updated" value={new Date().toLocaleDateString()} />
        </div>

        <div className="xl:col-span-1">
          <CommentFeed entityType="cycle" entityId={activeCycleId} limit={5} title="Controller commentary" />
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between text-sm py-1">
      <span className="text-fg-muted">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}
