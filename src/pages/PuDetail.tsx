import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CheckCircle2, History, Info, Layers, PieChart, Send, Sparkles, Zap, GraduationCap, Users } from "lucide-react";
import { useAppStore } from "../store";
import { leafPuCodes, puByCode, rollingPeriods, DEMO_ANCHOR_PERIOD as currentPeriodConst, puLabel, sePuCodes, vacationPhasingFor } from "../lib/demoData";
import MetricGrid, { type GridCellValue, type MetricRow } from "../components/MetricGrid";
import CommentFeed from "../components/CommentFeed";
import KpiCard from "../components/KpiCard";
import TrendChart from "../components/TrendChart";
import { ForecastIndex, effectiveValue } from "../lib/forecast";
import { formatNumber, periodLabel } from "../lib/utils";
import type { ForecastMetric, Period } from "../types";

const ROWS: MetricRow[] = [
  // ── Headcount movements ──────────────────────────────────────
  { key: "HC_BEGIN", label: "HC beginning", format: "int", tone: "muted", editable: true, group: "Headcount movements" },
  { key: "JOINERS", label: "Joiners", format: "int", tone: "muted", editable: true, group: "Headcount movements" },
  { key: "LEAVERS", label: "Leavers", format: "int", tone: "muted", editable: true, group: "Headcount movements" },
  { key: "HC_END", label: "HC end of month", format: "int", emphasis: true, computed: true, formulaHint: "HC_BEGIN + Joiners − Leavers (+ transfers net)", group: "Headcount movements" },
  { key: "STUDENTS_HC", label: "Students (interns)", format: "int", tone: "muted", editable: true, indent: true, group: "Headcount movements" },
  // ── FTE & overlays ───────────────────────────────────────────
  { key: "FTE", label: "FTE assigned", emphasis: true, editable: true, group: "FTE & overlays" },
  { key: "OVERTIME_FTE", label: "Overtime FTE", tone: "muted", editable: true, indent: true, group: "FTE & overlays" },
  { key: "FTE_LOST", label: "FTE lost", tone: "muted", editable: true, indent: true, group: "FTE & overlays" },
  { key: "UNPAID_LEAVE_FTE", label: "Unpaid leave FTE", tone: "muted", editable: true, indent: true, group: "FTE & overlays" },
  { key: "FTE_CSS", label: "FTE CSS", emphasis: true, computed: true, formulaHint: "FTE + Overtime − FTE lost − Unpaid leave (row 105)", group: "FTE & overlays" },
  // ── Absence ──────────────────────────────────────────────────
  { key: "VACATION_FTE", label: "Vacation FTE", tone: "muted", editable: true, group: "Absence" },
  { key: "SICKNESS_FTE", label: "Sickness FTE", tone: "muted", editable: true, group: "Absence" },
  { key: "ARVE_BASE", label: "ARVE base", emphasis: true, computed: true, formulaHint: "FTE CSS − Vacation − Unpaid leave (row 107)", group: "Absence" },
  // ── Billable (BDC) ───────────────────────────────────────────
  { key: "BDC_SOLD_FTE", label: "BDC Sold FTE", editable: true, group: "Billable (BDC)" },
  { key: "BDC_PL_FTE", label: "BDC-PL FTE", editable: true, group: "Billable (BDC)" },
  { key: "INTERNAL_PROJECTS_FTE", label: "Internal projects FTE", editable: true, group: "Billable (BDC)" },
  { key: "BFTE", label: "bFTE (billable)", emphasis: true, computed: true, tone: "highlight", formulaHint: "BDC Sold + BDC-PL + Internal projects", group: "Billable (BDC)" },
  // ── Non-billable (IDC) ───────────────────────────────────────
  { key: "BENCH_FTE", label: "IDC-Bench FTE", editable: true, group: "Non-billable (IDC)" },
  { key: "LND_FTE", label: "L&D FTE", editable: true, group: "Non-billable (IDC)" },
  { key: "RECRUITMENT_FTE", label: "Recruitment FTE", editable: true, group: "Non-billable (IDC)" },
  { key: "MAN_FTE", label: "MAN reserve FTE", editable: true, group: "Non-billable (IDC)" },
  { key: "RESERVE_FTE", label: "Reserve pool FTE", editable: true, group: "Non-billable (IDC)" },
  // ── Utilization ratios ───────────────────────────────────────
  { key: "ARVE_PCT", label: "ARVE %", format: "pct", emphasis: true, computed: true, formulaHint: "bFTE / ARVE base", group: "Utilization ratios" },
  { key: "ARVI_PCT", label: "ARVI %", format: "pct", emphasis: true, computed: true, formulaHint: "bFTE / FTE CSS", group: "Utilization ratios" },
  // ── Pipeline forecast ────────────────────────────────────────
  { key: "F1", label: "F1 — high probability", editable: true, group: "Pipeline forecast" },
  { key: "F2", label: "F2 — medium probability", editable: true, group: "Pipeline forecast" },
  { key: "F_TOTAL", label: "F Total", emphasis: true, computed: true, formulaHint: "F1 + F2", group: "Pipeline forecast" },
];

const COMPUTED_KEYS = new Set<ForecastMetric>(["HC_END", "FTE_CSS", "ARVE_BASE", "BFTE", "ARVE_PCT", "ARVI_PCT", "F_TOTAL"]);

function deriveComputed(
  primitive: (m: ForecastMetric) => number,
  transfersNet: number,
): Record<string, number> {
  const hcBeg = primitive("HC_BEGIN");
  const joiners = primitive("JOINERS");
  const leavers = primitive("LEAVERS");
  const fte = primitive("FTE");
  const ot = primitive("OVERTIME_FTE");
  const fteLost = primitive("FTE_LOST");
  const unpaid = primitive("UNPAID_LEAVE_FTE");
  const vac = primitive("VACATION_FTE");
  const bdcSold = primitive("BDC_SOLD_FTE");
  const bdcPl = primitive("BDC_PL_FTE");
  const intProj = primitive("INTERNAL_PROJECTS_FTE");
  const f1 = primitive("F1");
  const f2 = primitive("F2");

  const hcEnd = hcBeg + joiners - leavers + transfersNet;
  const fteCss = fte + ot - fteLost - unpaid;
  const arveBase = fteCss - vac - unpaid;
  const bfte = bdcSold + bdcPl + intProj;
  const arvePct = arveBase > 0 ? bfte / arveBase : 0;
  const arviPct = fteCss > 0 ? bfte / fteCss : 0;
  const fTotal = f1 + f2;

  return {
    HC_END: hcEnd,
    FTE_CSS: fteCss,
    ARVE_BASE: arveBase,
    BFTE: bfte,
    ARVE_PCT: arvePct,
    ARVI_PCT: arviPct,
    F_TOTAL: fTotal,
  };
}

export default function PuDetail() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const puList = useAppStore((s) => s.productionUnits);
  const forecastCells = useAppStore((s) => s.forecastCells);
  const setForecastValue = useAppStore((s) => s.setForecastValue);
  const setForecastValuesBulk = useAppStore((s) => s.setForecastValuesBulk);
  const activeCycleId = useAppStore((s) => s.activeCycleId);
  const previousCycleId = useAppStore((s) => s.previousCycleId);
  const density = useAppStore((s) => s.density);
  const joiners = useAppStore((s) => s.joiners);
  const leavers = useAppStore((s) => s.leavers);
  const transfers = useAppStore((s) => s.transfers);
  const pu = puByCode.get(code ?? "");

  const [showActuals, setShowActuals] = useState(true);

  const idx = useMemo(() => new ForecastIndex(forecastCells), [forecastCells]);

  if (!pu) {
    return <div className="card p-6 text-sm">PU &quot;{code}&quot; not found.</div>;
  }

  const isVirtual = pu.isVirtual === true;
  const rolledCodes = code === "CCA_TOTAL" ? leafPuCodes : code === "CCA_SE_TOTAL" ? sePuCodes : [code!];
  const rolledSet = new Set(rolledCodes);

  function primitiveValue(metric: ForecastMetric, period: Period, cycleId = activeCycleId): number {
    return effectiveValue(forecastCells, puList, cycleId, code!, metric, period);
  }

  function transfersNetFor(period: Period): number {
    let net = 0;
    for (const t of transfers) {
      if (t.effectivePeriod !== period) continue;
      const inbound = rolledSet.has(t.toPuCode);
      const outbound = rolledSet.has(t.fromPuCode);
      if (inbound && !outbound) net += 1;
      else if (outbound && !inbound) net -= 1;
    }
    return net;
  }

  function rollupValue(metric: ForecastMetric, period: Period, cycleId = activeCycleId): number {
    if (COMPUTED_KEYS.has(metric)) {
      const derived = deriveComputed(
        (m) => effectiveValue(forecastCells, puList, cycleId, code!, m, period),
        transfersNetFor(period),
      );
      return derived[metric] ?? 0;
    }
    return effectiveValue(forecastCells, puList, cycleId, code!, metric, period);
  }

  function rollupGradeBreakdown(metric: ForecastMetric, period: Period): Array<{ grade: string; value: number }> {
    const out = new Map<string, number>();
    const fteWeights = new Map<string, number>();
    for (const pu of rolledCodes) {
      const b = idx.gradeBreakdown(activeCycleId, pu, metric, period);
      if (!b) continue;
      if (metric === "ARVE_PCT") {
        // weighted by FTE per grade
        const f = idx.gradeBreakdown(activeCycleId, pu, "FTE", period);
        for (const [g, v] of b) {
          const w = f?.get(g) ?? 1;
          out.set(g, (out.get(g) ?? 0) + v * w);
          fteWeights.set(g, (fteWeights.get(g) ?? 0) + w);
        }
      } else {
        for (const [g, v] of b) out.set(g, (out.get(g) ?? 0) + v);
      }
    }
    const list: Array<{ grade: string; value: number }> = [];
    for (const [g, v] of out) {
      const value = metric === "ARVE_PCT" ? v / (fteWeights.get(g) || 1) : v;
      list.push({ grade: g, value });
    }
    return list.sort((a, b) => a.grade.localeCompare(b.grade));
  }

  const hcByGrade = rollupGradeBreakdown("HC_END", currentPeriodConst);
  const arveByGrade = rollupGradeBreakdown("ARVE_PCT", currentPeriodConst);
  const arveByGradeMap = new Map(arveByGrade.map((r) => [r.grade, r.value]));
  const hcTotal = hcByGrade.reduce((a, b) => a + b.value, 0);
  const studentsHc = rollupValue("STUDENTS_HC", currentPeriodConst);
  // A5 = intern grade, NG = UZ intern — join as "students"
  const studentGrades = new Set(["A5", "NG"]);
  const studentsByGrade = hcByGrade.filter((r) => studentGrades.has(r.grade));
  const studentsHcGrade = studentsByGrade.reduce((a, b) => a + b.value, 0);

  const fteNow = rollupValue("FTE", currentPeriodConst);
  const breakdown: Array<{ label: string; metric: ForecastMetric; tone: string; desc?: string }> = [
    { label: "Vacation", metric: "VACATION_FTE", tone: "text-sky-700", desc: "Planned annual leave" },
    { label: "Sickness", metric: "SICKNESS_FTE", tone: "text-amber-700", desc: "Driven by ADMIN phasing × 0.69" },
    { label: "Unpaid leave", metric: "UNPAID_LEAVE_FTE", tone: "text-fg-muted" },
    { label: "IDC-Bench", metric: "BENCH_FTE", tone: "text-danger", desc: "Non-billable bench FTE" },
    { label: "L&D (learning)", metric: "LND_FTE", tone: "text-indigo-700", desc: "Standard + onboarding" },
    { label: "MAN reserve", metric: "MAN_FTE", tone: "text-fg-muted" },
    { label: "Recruitment", metric: "RECRUITMENT_FTE", tone: "text-fg-muted" },
    { label: "Reserve pool", metric: "RESERVE_FTE", tone: "text-fg-muted" },
    { label: "BDC-Sold", metric: "BDC_SOLD_FTE", tone: "text-emerald-700", desc: "Sold bench billed internally" },
    { label: "BDC-PL", metric: "BDC_PL_FTE", tone: "text-emerald-700" },
    { label: "Internal projects", metric: "INTERNAL_PROJECTS_FTE", tone: "text-fg-muted" },
  ];
  const breakdownValues = breakdown.map((r) => ({
    ...r,
    value: rollupValue(r.metric, currentPeriodConst),
  }));

  // Build values map for the grid
  const values: Record<string, Record<string, GridCellValue>> = {};
  for (const row of ROWS) {
    values[row.key] = {};
    for (const p of rollingPeriods) {
      const v = rollupValue(row.key as ForecastMetric, p);
      values[row.key][p] = { value: v, isActual: p <= currentPeriodConst };
    }
  }

  function autoBaseline() {
    // Simple: for non-actual periods, keep a smooth growth curve from last actual
    if (isVirtual) return;
    const metrics: ForecastMetric[] = ["HC_BEGIN", "FTE", "F1", "F2"];
    for (const metric of metrics) {
      const last = idx.get(activeCycleId, code!, metric, currentPeriodConst);
      rollingPeriods.forEach((p, i) => {
        if (p <= currentPeriodConst) return;
        const months = i - rollingPeriods.indexOf(currentPeriodConst);
        const v = last * (1 + months * 0.006);
        setForecastValue({ cycleId: activeCycleId, puCode: code!, period: p, metric, value: Math.round(v * 100) / 100 });
      });
    }
  }

  /**
   * Roll forward future months using planned joiners/leavers + current project mix.
   * - HC_BEGIN[m] = HC_END[m-1] (chained)
   * - JOINERS[m]/LEAVERS[m] = counts from store filtered to this PU (incl. virtual children)
   * - FTE[m] scales with HC via current FTE/HC ratio
   * - VACATION_FTE[m] = FTE[m] × vacationPhasingFor(m)
   * - Other overlays (SICKNESS, BENCH, L&D, MAN, RECRUITMENT, RESERVE, INTERNAL) preserve their
   *   current share of FTE.
   * - BDC_SOLD/PL preserve current share of FTE (project-demand driven refinement is future work).
   */
  function forecastFromPeopleAndProjects() {
    if (isVirtual) return;
    const base = currentPeriodConst;
    const hcNow = rollupValue("HC_END", base);
    const fteNow = primitiveValue("FTE", base);
    const hcToFte = hcNow > 0 ? fteNow / hcNow : 1;
    const shareOf = (m: ForecastMetric) => (fteNow > 0 ? primitiveValue(m, base) / fteNow : 0);
    const sickShare = shareOf("SICKNESS_FTE");
    const benchShare = shareOf("BENCH_FTE");
    const lndShare = shareOf("LND_FTE");
    const manShare = shareOf("MAN_FTE");
    const recShare = shareOf("RECRUITMENT_FTE");
    const reserveShare = shareOf("RESERVE_FTE");
    const intProjShare = shareOf("INTERNAL_PROJECTS_FTE");
    const bdcSoldShare = shareOf("BDC_SOLD_FTE");
    const bdcPlShare = shareOf("BDC_PL_FTE");
    const overtimeShare = shareOf("OVERTIME_FTE");
    const fteLostShare = shareOf("FTE_LOST");
    const unpaidShare = shareOf("UNPAID_LEAVE_FTE");
    const f1Now = primitiveValue("F1", base);
    const f2Now = primitiveValue("F2", base);

    const joinersByPeriod = new Map<Period, number>();
    const leaversByPeriod = new Map<Period, number>();
    for (const j of joiners) {
      if (!rolledSet.has(j.puCode)) continue;
      const p = j.startDate.slice(0, 7) as Period;
      joinersByPeriod.set(p, (joinersByPeriod.get(p) ?? 0) + 1);
    }
    for (const l of leavers) {
      if (!rolledSet.has(l.puCode)) continue;
      const p = l.endDate.slice(0, 7) as Period;
      leaversByPeriod.set(p, (leaversByPeriod.get(p) ?? 0) + 1);
    }

    const future = rollingPeriods.filter((p) => p > base);
    let hcBeginNext = hcNow;
    const round2 = (v: number) => Math.round(v * 100) / 100;
    const plan: Array<{ period: Period; metric: ForecastMetric; value: number }> = [];
    const push = (metric: ForecastMetric, p: Period, value: number) => {
      plan.push({ period: p, metric, value: round2(value) });
    };

    future.forEach((p, idx) => {
      const jCount = joinersByPeriod.get(p) ?? 0;
      const lCount = leaversByPeriod.get(p) ?? 0;
      const transfersNet = transfersNetFor(p);
      const hcEnd = hcBeginNext + jCount - lCount + transfersNet;
      const fte = hcEnd * hcToFte;
      const vacShare = vacationPhasingFor(p);

      push("HC_BEGIN", p, hcBeginNext);
      push("JOINERS", p, jCount);
      push("LEAVERS", p, lCount);
      push("FTE", p, fte);
      push("OVERTIME_FTE", p, fte * overtimeShare);
      push("FTE_LOST", p, fte * fteLostShare);
      push("UNPAID_LEAVE_FTE", p, fte * unpaidShare);
      push("VACATION_FTE", p, fte * vacShare);
      push("SICKNESS_FTE", p, fte * sickShare);
      push("BENCH_FTE", p, fte * benchShare);
      push("LND_FTE", p, fte * lndShare);
      push("MAN_FTE", p, fte * manShare);
      push("RECRUITMENT_FTE", p, fte * recShare);
      push("RESERVE_FTE", p, fte * reserveShare);
      push("INTERNAL_PROJECTS_FTE", p, fte * intProjShare);
      push("BDC_SOLD_FTE", p, fte * bdcSoldShare);
      push("BDC_PL_FTE", p, fte * bdcPlShare);
      // Pipeline F1/F2 decay slightly on win probability recalibration
      const months = idx + 1;
      push("F1", p, f1Now * Math.pow(0.97, months));
      push("F2", p, f2Now * Math.pow(0.93, months));

      hcBeginNext = hcEnd;
    });

    setForecastValuesBulk({ cycleId: activeCycleId, puCode: code!, values: plan });
  }

  // KPI
  const cur = rollupValue("FTE", currentPeriodConst);
  const prev = effectiveValue(forecastCells, puList, previousCycleId, code!, "FTE", currentPeriodConst);
  const hc = rollupValue("HC_END", currentPeriodConst);
  const bfte = rollupValue("BFTE", currentPeriodConst);
  const arve = rollupValue("ARVE_PCT", currentPeriodConst);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-xs text-fg-muted">
            <Link to="/" className="hover:underline">Cockpit</Link>
            <span>/</span>
            <span>Production Units</span>
          </div>
          <h1 className="text-xl font-semibold mt-0.5">{pu.displayName}</h1>
          <p className="text-sm text-fg-muted">
            {pu.code} · {pu.bu} · {pu.sbu}
            {isVirtual && <span className="chip ml-2">roll-up</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="flex items-center gap-1.5 text-xs text-fg-muted">
            <input
              type="checkbox"
              checked={showActuals}
              onChange={(e) => setShowActuals(e.target.checked)}
              className="rounded border-border"
            />
            Show actuals
          </label>
          {!isVirtual && (
            <>
              <button
                className="btn"
                onClick={forecastFromPeopleAndProjects}
                title="Roll forward future months using planned joiners/leavers, transfers, and current project mix + vacation phasing"
              >
                <Users className="w-4 h-4 text-brand" /> Forecast from people + projects
              </button>
              <button className="btn" onClick={autoBaseline} title="Linear growth from current-period baseline">
                <Zap className="w-4 h-4 text-brand" /> Auto-baseline
              </button>
              <button className="btn-primary">
                <Send className="w-4 h-4" /> Submit for review
              </button>
            </>
          )}
          {isVirtual && (
            <button className="btn-primary">
              <CheckCircle2 className="w-4 h-4" /> Approve cycle
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 flex-wrap">
        {puList
          .filter((p) => p.code === "CCA_TOTAL" || !p.parentCode || p.code === "CCA_SE_TOTAL")
          .concat(puList.filter((p) => sePuCodes.includes(p.code)))
          .map((p) => (
            <button
              key={p.code}
              onClick={() => navigate(`/pu/${p.code}`)}
              className={
                p.code === code
                  ? "chip !bg-brand/10 !text-brand !border-brand/30"
                  : "chip hover:bg-bg-hover"
              }
            >
              {puLabel(p.code)}
            </button>
          ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="HC (end)" value={hc} fractionDigits={0} />
        <KpiCard label="FTE assigned" value={cur} delta={cur - prev} deltaLabel="vs prev FC" />
        <KpiCard label="bFTE" value={bfte} delta={bfte - effectiveValue(forecastCells, puList, previousCycleId, code!, "BFTE", currentPeriodConst)} deltaLabel="vs prev FC" />
        <KpiCard label="ARVE %" value={arve * 100} unit="%" delta={(arve - effectiveValue(forecastCells, puList, previousCycleId, code!, "ARVE_PCT", currentPeriodConst)) * 100} deltaLabel="vs prev FC" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard
          label="On bench (FTE)"
          value={rollupValue("BENCH_FTE", currentPeriodConst)}
          fractionDigits={1}
          tone={rollupValue("BENCH_FTE", currentPeriodConst) / Math.max(1, fteNow) > 0.08 ? "danger" : "warning"}
        />
        <KpiCard
          label="Vacation (FTE)"
          value={rollupValue("VACATION_FTE", currentPeriodConst)}
          fractionDigits={1}
        />
        <KpiCard
          label="L&D (FTE)"
          value={rollupValue("LND_FTE", currentPeriodConst)}
          fractionDigits={1}
        />
        <KpiCard
          label="Students (HC)"
          value={studentsHc + studentsHcGrade}
          fractionDigits={0}
        />
        <KpiCard
          label="ARVI %"
          value={rollupValue("ARVI_PCT", currentPeriodConst) * 100}
          unit="%"
          fractionDigits={1}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-4 items-start">
        <div className="space-y-4 min-w-0">
          <div className="flex items-center gap-2 text-[11px] text-fg-muted">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-bg-muted border border-border" /> Actuals
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-bg-card border border-border" /> Forecast (editable)
            </div>
            <div className="flex items-center gap-1.5">
              <Info className="w-3 h-3" /> Double-click a forecast cell to edit. Right-click to view lineage.
            </div>
          </div>

          <MetricGrid
            rows={ROWS.filter((_) => showActuals || _.editable !== false)}
            periods={rollingPeriods}
            values={values}
            currentPeriod={currentPeriodConst}
            density={density}
            onCellChange={(row, period, value) =>
              setForecastValue({
                cycleId: activeCycleId,
                puCode: code!,
                period,
                metric: row.key as ForecastMetric,
                value,
              })
            }
            onRightClickCell={(row, period, value) => {
              alert(
                `Lineage — ${row.label} · ${period}\nValue: ${value.toFixed(2)}\n\nSource: forecast cycle ${activeCycleId}\nLinks: HR_DB ingest 2026-03, GFS_DB ingest 2026-03`,
              );
            }}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="card p-4">
              <h3 className="text-sm font-semibold mb-3">FTE vs previous FC</h3>
              <TrendChart
                periods={rollingPeriods}
                markPeriod={currentPeriodConst}
                series={[
                  {
                    name: "This FC",
                    data: rollingPeriods.map((p) => rollupValue("FTE", p, activeCycleId)),
                    color: "#1d4ed8",
                  },
                  {
                    name: "Previous FC",
                    data: rollingPeriods.map((p) => effectiveValue(forecastCells, puList, previousCycleId, code!, "FTE", p)),
                    color: "#94a3b8",
                  },
                ]}
                height={220}
              />
            </div>
            <div className="card p-4">
              <h3 className="text-sm font-semibold mb-3">Joiners / Leavers (planned + actual)</h3>
              <TrendChart
                periods={rollingPeriods}
                markPeriod={currentPeriodConst}
                series={[
                  { name: "Joiners", type: "bar", data: rollingPeriods.map((p) => rollupValue("JOINERS", p)), color: "#16a34a" },
                  { name: "Leavers", type: "bar", data: rollingPeriods.map((p) => -rollupValue("LEAVERS", p)), color: "#dc2626" },
                ]}
                height={220}
              />
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="card p-4">
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-brand" /> Drivers applied
            </h3>
            <ul className="space-y-1.5 text-sm">
              <li className="flex items-center justify-between"><span>+5 joiners planned May</span><span className="chip">on</span></li>
              <li className="flex items-center justify-between"><span>ABB ramp +2 FTE Q3</span><span className="chip">on</span></li>
              <li className="flex items-center justify-between"><span>Vacation phasing</span><span className="chip">auto</span></li>
              <li className="flex items-center justify-between text-fg-muted"><span>BMW opportunity (35%)</span><span className="chip">off</span></li>
            </ul>
            <button className="btn w-full mt-3"><Sparkles className="w-3.5 h-3.5" /> Add driver</button>
          </div>

          <div className="card p-4">
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <PieChart className="w-4 h-4 text-brand" /> Utilization breakdown · {periodLabel(currentPeriodConst, "short")}
            </h3>
            <p className="text-[11px] text-fg-muted mb-2">
              FTE split across billable (BDC), non-billable (Bench/L&D/MAN), and absence (Vacation/Sickness).
            </p>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-fg-muted">
                  <th className="text-left py-1">Category</th>
                  <th className="text-right py-1">FTE</th>
                  <th className="text-right py-1">% of FTE</th>
                </tr>
              </thead>
              <tbody>
                {breakdownValues.map((r) => {
                  const pct = fteNow === 0 ? 0 : r.value / fteNow;
                  return (
                    <tr key={r.metric} title={r.desc}>
                      <td className={`py-1 ${r.tone}`}>{r.label}</td>
                      <td className="py-1 text-right tabular-nums">{formatNumber(r.value, 1)}</td>
                      <td className="py-1 text-right tabular-nums text-fg-muted">{(pct * 100).toFixed(1)}%</td>
                    </tr>
                  );
                })}
                <tr className="border-t border-border">
                  <td className="py-1 text-fg-muted">Sum of overlays</td>
                  <td className="py-1 text-right tabular-nums font-semibold">
                    {formatNumber(breakdownValues.reduce((a, b) => a + b.value, 0), 1)}
                  </td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>

          <div className="card p-4">
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <GraduationCap className="w-4 h-4 text-brand" /> Students · {periodLabel(currentPeriodConst, "short")}
            </h3>
            <div className="text-2xl font-semibold">{studentsHc + studentsHcGrade}</div>
            <div className="text-[11px] text-fg-muted">
              A5 + NG intern grades count toward this total. Share of HC:{" "}
              <span className="font-mono">{hcTotal === 0 ? 0 : (((studentsHc + studentsHcGrade) / hcTotal) * 100).toFixed(1)}%</span>
            </div>
            {studentsByGrade.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs">
                {studentsByGrade.map((r) => (
                  <li key={r.grade} className="flex items-center justify-between">
                    <span className="font-mono">{r.grade}</span>
                    <span className="tabular-nums">{formatNumber(r.value, 0)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {hcByGrade.length > 0 && (
            <div className="card p-4">
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Layers className="w-4 h-4 text-brand" /> Grade mix · {periodLabel(currentPeriodConst, "short")}
              </h3>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-fg-muted">
                    <th className="text-left py-1">Grade</th>
                    <th className="text-right py-1">HC</th>
                    <th className="text-right py-1">Share</th>
                    <th className="text-right py-1">ARVE</th>
                  </tr>
                </thead>
                <tbody>
                  {hcByGrade.map((r) => {
                    const pct = hcTotal === 0 ? 0 : r.value / hcTotal;
                    const arveG = arveByGradeMap.get(r.grade) ?? 0;
                    return (
                      <tr key={r.grade}>
                        <td className="py-1 font-mono">{r.grade}</td>
                        <td className="py-1 text-right tabular-nums">{formatNumber(r.value, 1)}</td>
                        <td className="py-1 text-right tabular-nums">{(pct * 100).toFixed(0)}%</td>
                        <td className="py-1 text-right tabular-nums">
                          <span className={arveG < 0.65 ? "text-danger" : arveG < 0.8 ? "text-warning" : "text-success"}>
                            {(arveG * 100).toFixed(0)}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="border-t border-border">
                    <td className="py-1 text-fg-muted">Total</td>
                    <td className="py-1 text-right tabular-nums font-semibold">{formatNumber(hcTotal, 1)}</td>
                    <td className="py-1 text-right text-fg-muted">100%</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          <div className="card p-4">
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <History className="w-4 h-4 text-fg-muted" /> Change history
            </h3>
            <ul className="space-y-2 text-xs">
              <li className="flex items-center justify-between"><span>FTE Apr 2026 <b>92 → 94</b></span><span className="text-fg-subtle">2h ago</span></li>
              <li className="flex items-center justify-between"><span>HC End May 2026 <b>98 → 101</b></span><span className="text-fg-subtle">3h ago</span></li>
              <li className="flex items-center justify-between"><span>F1 Jun 2026 <b>+3.2</b></span><span className="text-fg-subtle">yesterday</span></li>
            </ul>
          </div>

          <CommentFeed entityType="pu" entityId={code!} title="PU commentary" />
        </div>
      </div>
    </div>
  );
}
