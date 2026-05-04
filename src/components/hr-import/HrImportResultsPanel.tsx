import { useMemo, useState } from "react";
import type { Employee, HrImport, Joiner, Leaver } from "../../types";

interface Props {
  hrImport: HrImport;
  employees: Employee[];
  joiners: Joiner[];
  leavers: Leaver[];
}

type TabKey = "changed" | "new" | "joiners" | "leavers" | "skipped" | "missing" | "warnings";

/**
 * Tabbed results view per hr_database_import.md §13. Pure presentation —
 * reads from props rather than the store so it's easy to test in isolation.
 */
export default function HrImportResultsPanel({ hrImport, employees, joiners, leavers }: Props) {
  const decisions = hrImport.rowDecisions;
  const empByLocal = useMemo(() => {
    const m = new Map<string, Employee>();
    for (const e of employees) m.set(e.localNumber, e);
    return m;
  }, [employees]);

  const counts = hrImport.counts;

  const changedDecisions = decisions.filter((d) => d.diffKind === "changed" || d.diffKind === "re-hire" || d.diffKind === "terminating");
  const newDecisions = decisions.filter((d) => d.diffKind === "new-employee");
  const skippedDecisions = decisions.filter((d) => d.action === "skip");
  const missingDecisions = decisions.filter((d) => d.diffKind === "missing-from-file");
  const importJoiners = joiners.filter((j) => j.id.startsWith(`j-hr-${hrImport.id}-`));
  const importLeavers = leavers.filter((l) => l.id.startsWith(`l-hr-${hrImport.id}-`));

  const warningsByCode = useMemo(() => {
    const m = new Map<string, typeof hrImport.warnings>();
    for (const w of hrImport.warnings) {
      const arr = m.get(w.code) ?? [];
      arr.push(w);
      m.set(w.code, arr);
    }
    return m;
  // hrImport identity drives `hrImport.warnings`; the inner reference is sufficient.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hrImport.warnings]);

  const TABS: Array<{ key: TabKey; label: string; count: number }> = [
    { key: "changed", label: "Changed", count: changedDecisions.length },
    { key: "new", label: "New", count: newDecisions.length },
    { key: "joiners", label: "Joiners", count: importJoiners.length },
    { key: "leavers", label: "Leavers", count: importLeavers.length },
    { key: "skipped", label: "Skipped", count: skippedDecisions.length },
    { key: "missing", label: "Missing", count: missingDecisions.length },
    { key: "warnings", label: "Warnings", count: hrImport.warnings.length },
  ];

  const [tab, setTab] = useState<TabKey>("changed");

  return (
    <div className="space-y-4">
      {/* Counts panel */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="card p-4">
          <h3 className="text-sm font-semibold mb-2">File</h3>
          <dl className="text-sm space-y-1">
            <Row label="Rows read" value={counts.rowsRead} />
            <Row label="Rows skipped" value={counts.rowsSkipped} />
            <Row label="Rows rejected" value={counts.rowsRejected} />
            <Row label="Warnings" value={counts.warnings} />
          </dl>
        </div>
        <div className="card p-4">
          <h3 className="text-sm font-semibold mb-2">People</h3>
          <dl className="text-sm space-y-1">
            <Row label="Total" value={counts.rowsRead - counts.rowsRejected} />
            <Row label="New" value={counts.new} />
            <Row label="Changed" value={counts.changed} />
            <Row label="Unchanged" value={counts.unchanged} />
            <Row label="Missing-from-file" value={counts.missingFromFile} />
          </dl>
        </div>
        <div className="card p-4">
          <h3 className="text-sm font-semibold mb-2">Events</h3>
          <dl className="text-sm space-y-1">
            <Row label="Joiners" value={counts.joiners} />
            <Row label="Leavers" value={counts.leavers} />
            <Row label="Re-hires" value={counts.rehires} />
            <Row label="Transfers" value={counts.transfers} />
          </dl>
        </div>
      </div>

      {/* Tabs */}
      <div className="card p-4">
        <div className="flex flex-wrap gap-1 border-b border-border mb-3">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 text-sm border-b-2 -mb-px ${
                tab === t.key ? "border-brand text-brand" : "border-transparent text-fg-muted"
              }`}
            >
              {t.label} <span className="text-xs">({t.count})</span>
            </button>
          ))}
        </div>

        {tab === "changed" && <ChangedTab decisions={changedDecisions} empByLocal={empByLocal} />}
        {tab === "new" && <NewTab decisions={newDecisions} empByLocal={empByLocal} />}
        {tab === "joiners" && <JoinersTab joiners={importJoiners} />}
        {tab === "leavers" && <LeaversTab leavers={importLeavers} empByLocal={empByLocal} />}
        {tab === "skipped" && <SkippedTab decisions={skippedDecisions} empByLocal={empByLocal} />}
        {tab === "missing" && <MissingTab decisions={missingDecisions} empByLocal={empByLocal} />}
        {tab === "warnings" && <WarningsTab warningsByCode={warningsByCode} />}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

interface Decision {
  localNumber: string;
  diffKind: string;
  fieldDiffs: Array<{ field: string; before: unknown; after: unknown }>;
  action: string;
}

function ChangedTab({ decisions, empByLocal }: { decisions: Decision[]; empByLocal: Map<string, Employee> }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  if (decisions.length === 0) return <Empty message="No changed employees in this import." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="table-th">Employee</th>
            <th className="table-th">PU before</th>
            <th className="table-th">PU after</th>
            <th className="table-th">Fields changed</th>
            <th className="table-th">Reviewer</th>
          </tr>
        </thead>
        <tbody>
          {decisions.map((d) => {
            const emp = empByLocal.get(d.localNumber);
            const puBefore = d.fieldDiffs.find((f) => f.field === "puCode")?.before;
            const puAfter = d.fieldDiffs.find((f) => f.field === "puCode")?.after;
            const fieldNames = d.fieldDiffs.slice(0, 2).map((f) => f.field).join(", ");
            const more = d.fieldDiffs.length > 2 ? ` (+${d.fieldDiffs.length - 2})` : "";
            const isOpen = expanded === d.localNumber;
            return (
              <>
                <tr
                  key={d.localNumber}
                  className="hover:bg-bg-hover cursor-pointer"
                  onClick={() => setExpanded(isOpen ? null : d.localNumber)}
                >
                  <td className="table-td">
                    {d.localNumber} — {emp?.displayName ?? "—"}
                  </td>
                  <td className="table-td text-fg-muted">{String(puBefore ?? emp?.puCode ?? "—")}</td>
                  <td className="table-td">{String(puAfter ?? emp?.puCode ?? "—")}</td>
                  <td className="table-td text-xs">
                    {d.fieldDiffs.length} ({fieldNames}{more})
                  </td>
                  <td className="table-td text-xs">{d.action}</td>
                </tr>
                {isOpen && (
                  <tr key={`${d.localNumber}-detail`} className="bg-bg-hover">
                    <td className="table-td" colSpan={5}>
                      <ul className="text-xs space-y-1">
                        {d.fieldDiffs.map((f) => (
                          <li key={f.field}>
                            <strong>{f.field}:</strong>{" "}
                            <span className="text-fg-muted">{formatVal(f.before)}</span> →{" "}
                            {formatVal(f.after)}
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function NewTab({ decisions, empByLocal }: { decisions: Decision[]; empByLocal: Map<string, Employee> }) {
  if (decisions.length === 0) return <Empty message="No new employees in this import." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="table-th">Employee Number</th>
            <th className="table-th">Name</th>
            <th className="table-th">PU</th>
            <th className="table-th">Grade</th>
            <th className="table-th">Location</th>
            <th className="table-th">Date of employment</th>
            <th className="table-th">Job type</th>
          </tr>
        </thead>
        <tbody>
          {decisions.map((d) => {
            const emp = empByLocal.get(d.localNumber);
            return (
              <tr key={d.localNumber}>
                <td className="table-td font-mono text-xs">{d.localNumber}</td>
                <td className="table-td">{emp?.displayName ?? "—"}</td>
                <td className="table-td">{emp?.puCode ?? "—"}</td>
                <td className="table-td">{emp?.gradeCode ?? "—"}</td>
                <td className="table-td">{emp?.locationCode ?? "—"}</td>
                <td className="table-td">{emp?.startDate ?? "—"}</td>
                <td className="table-td">{emp?.jobFunction ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function JoinersTab({ joiners }: { joiners: Joiner[] }) {
  if (joiners.length === 0) return <Empty message="No joiners created by this import." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="table-th">Start date</th>
            <th className="table-th">Employee Number</th>
            <th className="table-th">Name</th>
            <th className="table-th">PU</th>
            <th className="table-th">Grade</th>
            <th className="table-th">Location</th>
            <th className="table-th">Source</th>
          </tr>
        </thead>
        <tbody>
          {joiners.map((j) => (
            <tr key={j.id}>
              <td className="table-td">{j.startDate}</td>
              <td className="table-td font-mono text-xs">{j.employeeLocalNumber ?? "—"}</td>
              <td className="table-td">
                {j.firstName} {j.lastName}
              </td>
              <td className="table-td">{j.puCode}</td>
              <td className="table-td">{j.gradeCode}</td>
              <td className="table-td">{j.locationCode}</td>
              <td className="table-td text-xs">HR import</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LeaversTab({ leavers, empByLocal }: { leavers: Leaver[]; empByLocal: Map<string, Employee> }) {
  if (leavers.length === 0) return <Empty message="No leavers created by this import." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="table-th">End date</th>
            <th className="table-th">Employee Number</th>
            <th className="table-th">Name</th>
            <th className="table-th">PU</th>
            <th className="table-th">Grade</th>
            <th className="table-th">Method</th>
            <th className="table-th">Source</th>
          </tr>
        </thead>
        <tbody>
          {leavers.map((l) => {
            const emp = empByLocal.get(l.employeeLocalNumber);
            return (
              <tr key={l.id}>
                <td className="table-td">{l.endDate}</td>
                <td className="table-td font-mono text-xs">{l.employeeLocalNumber}</td>
                <td className="table-td">{emp?.displayName ?? `${l.firstName} ${l.lastName}`}</td>
                <td className="table-td">{l.puCode}</td>
                <td className="table-td">{l.gradeCode}</td>
                <td className="table-td">{l.terminationMethod ?? "—"}</td>
                <td className="table-td text-xs">HR import</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SkippedTab({ decisions, empByLocal }: { decisions: Decision[]; empByLocal: Map<string, Employee> }) {
  if (decisions.length === 0) return <Empty message="No skipped rows." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="table-th">Employee</th>
            <th className="table-th">Diff kind</th>
            <th className="table-th">Reviewer</th>
          </tr>
        </thead>
        <tbody>
          {decisions.map((d) => {
            const emp = empByLocal.get(d.localNumber);
            return (
              <tr key={d.localNumber}>
                <td className="table-td">
                  {d.localNumber} — {emp?.displayName ?? "—"}
                </td>
                <td className="table-td text-xs">{d.diffKind}</td>
                <td className="table-td text-xs">{d.action}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MissingTab({ decisions, empByLocal }: { decisions: Decision[]; empByLocal: Map<string, Employee> }) {
  if (decisions.length === 0) return <Empty message="No employees missing from this file." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="table-th">Employee</th>
            <th className="table-th">PU</th>
            <th className="table-th">Last seen end date</th>
          </tr>
        </thead>
        <tbody>
          {decisions.map((d) => {
            const emp = empByLocal.get(d.localNumber);
            return (
              <tr key={d.localNumber}>
                <td className="table-td">
                  {d.localNumber} — {emp?.displayName ?? "—"}
                </td>
                <td className="table-td">{emp?.puCode ?? "—"}</td>
                <td className="table-td">{emp?.endDate ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function WarningsTab({ warningsByCode }: { warningsByCode: Map<string, Array<{ code: string; localNumber: string; message: string }>> }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  if (warningsByCode.size === 0) return <Empty message="No warnings raised by this import." />;
  return (
    <ul className="space-y-2 text-sm">
      {Array.from(warningsByCode.entries()).map(([code, list]) => (
        <li key={code} className="border border-border rounded-md p-2">
          <button
            onClick={() => setExpanded(expanded === code ? null : code)}
            className="flex items-center gap-2 w-full text-left"
          >
            <strong>{code}</strong>
            <span className="text-fg-muted text-xs">({list.length})</span>
          </button>
          {expanded === code && (
            <ul className="mt-2 text-xs text-fg-muted space-y-0.5">
              {list.map((w, i) => (
                <li key={i}>
                  <span className="font-mono">{w.localNumber}</span>: {w.message}
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

function Empty({ message }: { message: string }) {
  return <p className="text-sm text-fg-muted py-3">{message}</p>;
}

function formatVal(v: unknown): string {
  if (v === undefined || v === null || v === "") return "—";
  return String(v);
}
