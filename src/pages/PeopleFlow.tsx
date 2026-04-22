import { useMemo, useState } from "react";
import { ArrowRightLeft, UserMinus, UserPlus } from "lucide-react";
import { useAppStore } from "../store";
import { rollingPeriods, currentPeriod, puLabel } from "../lib/demoData";
import KpiCard from "../components/KpiCard";
import TrendChart from "../components/TrendChart";
import { periodAdd, periodLabel } from "../lib/utils";
import { AddJoinerModal, AddLeaverModal, TransferModal } from "../components/forms/PeopleForms";

export default function PeopleFlow() {
  const joiners = useAppStore((s) => s.joiners);
  const leavers = useAppStore((s) => s.leavers);
  const employees = useAppStore((s) => s.employees);
  const transfers = useAppStore((s) => s.transfers);
  const filter = useAppStore((s) => s.filter);
  const [tab, setTab] = useState<"joiners" | "leavers" | "transfers">("joiners");
  const [selectedPeriod, setSelectedPeriod] = useState<string>(currentPeriod);
  const [modal, setModal] = useState<null | "joiner" | "leaver" | "transfer">(null);

  const transfersByPeriod = useMemo(() => {
    const map: Record<string, typeof transfers> = {};
    for (const t of transfers) {
      if (filter.pu && t.toPuCode !== filter.pu && t.fromPuCode !== filter.pu) continue;
      map[t.effectivePeriod] = map[t.effectivePeriod] ?? [];
      map[t.effectivePeriod].push(t);
    }
    return map;
  }, [transfers, filter.pu]);

  const joinersByPeriod = useMemo(() => {
    const map: Record<string, typeof joiners> = {};
    for (const j of joiners) {
      if (filter.pu && j.puCode !== filter.pu) continue;
      const p = j.startDate.slice(0, 7);
      map[p] = map[p] ?? [];
      map[p].push(j);
    }
    return map;
  }, [joiners, filter.pu]);

  const leaversByPeriod = useMemo(() => {
    const map: Record<string, typeof leavers> = {};
    for (const l of leavers) {
      if (filter.pu && l.puCode !== filter.pu) continue;
      const p = l.endDate.slice(0, 7);
      map[p] = map[p] ?? [];
      map[p].push(l);
    }
    return map;
  }, [leavers, filter.pu]);

  // Rolling 12m attrition %
  const last12 = rollingPeriods.filter((p) => p > periodAdd(currentPeriod, -12) && p <= currentPeriod);
  const lastYearLeavers = last12.reduce((a, p) => a + (leaversByPeriod[p]?.length ?? 0), 0);
  const attritionPct = employees.length === 0 ? 0 : lastYearLeavers / employees.length;

  const joinerSeries = rollingPeriods.map((p) => joinersByPeriod[p]?.length ?? 0);
  const leaverSeries = rollingPeriods.map((p) => leaversByPeriod[p]?.length ?? 0);

  const selectedItems =
    tab === "joiners"
      ? joinersByPeriod[selectedPeriod] ?? []
      : tab === "leavers"
      ? leaversByPeriod[selectedPeriod] ?? []
      : transfersByPeriod[selectedPeriod] ?? [];
  const transferSeries = rollingPeriods.map((p) => transfersByPeriod[p]?.length ?? 0);
  const empByLocal = new Map(employees.map((e) => [e.localNumber, e]));

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Joiners, Leavers & Transfers</h1>
          <p className="text-sm text-fg-muted">Rolling 24-month people-flow across the practice.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button className="btn" onClick={() => setModal("joiner")}>
            <UserPlus className="w-4 h-4" /> Add joiner
          </button>
          <button className="btn" onClick={() => setModal("leaver")}>
            <UserMinus className="w-4 h-4" /> Mark leaver
          </button>
          <button className="btn" onClick={() => setModal("transfer")}>
            <ArrowRightLeft className="w-4 h-4" /> Transfer
          </button>
        </div>
      </div>

      <AddJoinerModal open={modal === "joiner"} onClose={() => setModal(null)} />
      <AddLeaverModal open={modal === "leaver"} onClose={() => setModal(null)} />
      <TransferModal open={modal === "transfer"} onClose={() => setModal(null)} />

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <KpiCard label="Joiners — rolling 12m" value={joinerSeries.reduce((a, v) => a + v, 0)} fractionDigits={0} series={joinerSeries} />
        <KpiCard label="Leavers — rolling 12m" value={lastYearLeavers} fractionDigits={0} series={leaverSeries} tone="warning" />
        <KpiCard label="Attrition %" value={attritionPct * 100} unit="%" fractionDigits={1} tone={attritionPct > 0.12 ? "danger" : "success"} />
        <KpiCard label="Next 6m planned joiners" value={joiners.filter((j) => j.status === "planned").length} fractionDigits={0} />
      </div>

      <div className="flex items-center gap-1 border-b border-border">
        <button className={tab === "joiners" ? "px-3 py-2 text-sm font-medium text-brand border-b-2 border-brand" : "px-3 py-2 text-sm text-fg-muted"} onClick={() => setTab("joiners")}>
          <UserPlus className="w-4 h-4 inline mr-1.5" /> Joiners
        </button>
        <button className={tab === "leavers" ? "px-3 py-2 text-sm font-medium text-brand border-b-2 border-brand" : "px-3 py-2 text-sm text-fg-muted"} onClick={() => setTab("leavers")}>
          <UserMinus className="w-4 h-4 inline mr-1.5" /> Leavers
        </button>
        <button className={tab === "transfers" ? "px-3 py-2 text-sm font-medium text-brand border-b-2 border-brand" : "px-3 py-2 text-sm text-fg-muted"} onClick={() => setTab("transfers")}>
          <ArrowRightLeft className="w-4 h-4 inline mr-1.5" /> Transfers
        </button>
      </div>

      <div className="card p-4">
        <h3 className="text-sm font-semibold mb-2">Monthly {tab} count</h3>
        <TrendChart
          periods={rollingPeriods}
          markPeriod={currentPeriod}
          series={[
            tab === "joiners"
              ? { name: "Joiners", type: "bar", data: joinerSeries, color: "#16a34a" }
              : tab === "leavers"
              ? { name: "Leavers", type: "bar", data: leaverSeries, color: "#dc2626" }
              : { name: "Transfers", type: "bar", data: transferSeries, color: "#2563eb" },
          ]}
          height={240}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-4">
        <div className="card p-4">
          <h3 className="text-sm font-semibold mb-3">
            {tab === "joiners" ? "Joiners" : tab === "leavers" ? "Leavers" : "Transfers"} — {periodLabel(selectedPeriod, "long")}
          </h3>
          <div className="overflow-x-auto">
            {tab === "transfers" ? (
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="table-th">Person</th>
                    <th className="table-th">From PU</th>
                    <th className="table-th">To PU</th>
                    <th className="table-th">Effective</th>
                    <th className="table-th">Reason</th>
                    <th className="table-th">Recorded</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedItems.length === 0 && (
                    <tr>
                      <td colSpan={6} className="table-td text-fg-subtle text-center py-6">
                        No transfers in this month.
                      </td>
                    </tr>
                  )}
                  {selectedItems.map((item: any) => {
                    const emp = empByLocal.get(item.employeeLocalNumber);
                    return (
                      <tr key={item.id} className="hover:bg-bg-hover">
                        <td className="table-td">
                          <div className="font-medium">{emp?.displayName ?? item.employeeLocalNumber}</div>
                          <div className="text-[11px] text-fg-muted font-mono">{item.employeeLocalNumber}</div>
                        </td>
                        <td className="table-td">{puLabel(item.fromPuCode)}</td>
                        <td className="table-td">{puLabel(item.toPuCode)}</td>
                        <td className="table-td">{item.effectivePeriod}</td>
                        <td className="table-td text-fg-muted">{item.reason ?? "—"}</td>
                        <td className="table-td text-[11px] text-fg-muted">
                          {item.recordedAt.slice(0, 10)} · {item.recordedBy}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="table-th">Name</th>
                    <th className="table-th">PU</th>
                    <th className="table-th">Grade</th>
                    <th className="table-th">{tab === "joiners" ? "Start date" : "End date"}</th>
                    <th className="table-th">{tab === "joiners" ? "Source" : "Reason"}</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedItems.length === 0 && (
                    <tr>
                      <td colSpan={5} className="table-td text-fg-subtle text-center py-6">
                        No {tab} in this month.
                      </td>
                    </tr>
                  )}
                  {selectedItems.map((item: any) => (
                    <tr key={item.id} className="hover:bg-bg-hover">
                      <td className="table-td">
                        <div className="font-medium">
                          {item.firstName} {item.lastName}
                        </div>
                        <div className="text-[11px] text-fg-muted">{item.employeeLocalNumber ?? "—"}</div>
                      </td>
                      <td className="table-td">{puLabel(item.puCode)}</td>
                      <td className="table-td">{item.gradeCode}</td>
                      <td className="table-td">{tab === "joiners" ? item.startDate : item.endDate}</td>
                      <td className="table-td capitalize">{tab === "joiners" ? item.source : item.reason.replace("_", " ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <aside className="card p-2 max-h-[520px] overflow-auto">
          <div className="section-title px-2 py-1.5">Pick a month</div>
          {rollingPeriods.map((p) => {
            const count =
              tab === "joiners"
                ? joinersByPeriod[p]?.length ?? 0
                : tab === "leavers"
                ? leaversByPeriod[p]?.length ?? 0
                : transfersByPeriod[p]?.length ?? 0;
            return (
              <button
                key={p}
                className={
                  p === selectedPeriod
                    ? "w-full flex items-center justify-between px-2 py-1.5 text-sm rounded-md bg-brand/10 text-brand"
                    : "w-full flex items-center justify-between px-2 py-1.5 text-sm rounded-md hover:bg-bg-hover"
                }
                onClick={() => setSelectedPeriod(p)}
              >
                <span>{periodLabel(p, "short")}</span>
                <span className="chip">{count}</span>
              </button>
            );
          })}
        </aside>
      </div>
    </div>
  );
}
