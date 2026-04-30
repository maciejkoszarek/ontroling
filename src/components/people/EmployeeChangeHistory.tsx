import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { History } from "lucide-react";
import { useAppStore } from "../../store";
import type { AuditEntry, Joiner, Leaver, Transfer } from "../../types";

interface Props {
  localNumber: string;
}

type Filter = "all" | "imports" | "user-edits";

const PAGE_SIZE = 25;

type HistoryEntry =
  | {
      kind: "audit";
      ts: string;
      audit: AuditEntry;
    }
  | {
      kind: "transfer";
      ts: string;
      transfer: Transfer;
    }
  | {
      kind: "joiner";
      ts: string;
      joiner: Joiner;
    }
  | {
      kind: "leaver";
      ts: string;
      leaver: Leaver;
    };

function isPlainRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function formatVal(v: unknown): string {
  if (v === undefined || v === null || v === "") return "(empty)";
  if (Array.isArray(v)) return v.length === 0 ? "[]" : `[${v.map((x) => String(x)).join(", ")}]`;
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** Merge keys from before/after objects, preserving order from `after` first then `before`. */
function fieldKeys(before: unknown, after: unknown): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  if (isPlainRecord(after)) {
    for (const k of Object.keys(after)) {
      if (!seen.has(k)) {
        seen.add(k);
        keys.push(k);
      }
    }
  }
  if (isPlainRecord(before)) {
    for (const k of Object.keys(before)) {
      if (!seen.has(k)) {
        seen.add(k);
        keys.push(k);
      }
    }
  }
  return keys;
}

function auditKindLabel(audit: AuditEntry): string {
  switch (audit.kind) {
    case "hr_import":
      return "HR import";
    case "user_edit":
      return "User edit";
    case "transfer":
      return "PU transfer";
    case "capability_change":
      return "Capability change";
    case "joiner":
      return "Joiner";
    case "leaver":
      return "Leaver";
    case "mapping_change":
      return "Mapping change";
    default:
      return audit.kind ?? audit.action;
  }
}

/** Tailwind utility class for the entry's accent / left-border. */
function accentClass(entry: HistoryEntry): string {
  if (entry.kind === "transfer") return "text-fg-muted border-l-brand/40";
  if (entry.kind === "joiner") return "text-fg-muted border-l-success";
  if (entry.kind === "leaver") return "text-fg-muted border-l-danger";
  const k = entry.audit.kind;
  if (k === "hr_import") return "text-fg-muted border-l-brand";
  if (k === "transfer") return "text-fg-muted border-l-brand/40";
  if (k === "joiner") return "text-fg-muted border-l-success";
  if (k === "leaver") return "text-fg-muted border-l-danger";
  return "text-fg-muted border-l-border";
}

function pillClass(entry: HistoryEntry): string {
  if (entry.kind === "transfer") return "bg-brand/10 text-brand";
  if (entry.kind === "joiner") return "bg-success/10 text-success";
  if (entry.kind === "leaver") return "bg-danger/10 text-danger";
  const k = entry.audit.kind;
  if (k === "hr_import") return "bg-brand/10 text-brand";
  if (k === "transfer") return "bg-brand/10 text-brand";
  if (k === "joiner") return "bg-success/10 text-success";
  if (k === "leaver") return "bg-danger/10 text-danger";
  return "bg-bg-muted text-fg-muted";
}

export default function EmployeeChangeHistory({ localNumber }: Props) {
  const audit = useAppStore((s) => s.audit);
  const joiners = useAppStore((s) => s.joiners);
  const leavers = useAppStore((s) => s.leavers);
  const transfers = useAppStore((s) => s.transfers);
  const navigate = useNavigate();

  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(0);

  const entries = useMemo<HistoryEntry[]>(() => {
    const auditEntries = audit
      .filter((a) => a.entityType === "employee" && a.entityId === localNumber)
      .map<HistoryEntry>((a) => ({ kind: "audit", ts: a.ts, audit: a }));

    // Add transfer rows that may not have a matching audit entry (e.g. legacy data).
    const auditTransferTs = new Set(
      auditEntries
        .filter((e) => e.kind === "audit" && e.audit.kind === "transfer")
        .map((e) => e.ts),
    );
    const transferEntries: HistoryEntry[] = transfers
      .filter((t) => t.employeeLocalNumber === localNumber)
      .filter((t) => !auditTransferTs.has(t.recordedAt))
      .map((t) => ({ kind: "transfer", ts: t.recordedAt, transfer: t }));

    // Augment audit `joiner` / `leaver` entries with date info from the actual records.
    // Also pick up legacy joiner/leaver records that have no audit entry yet.
    const joinerByLocal = new Map<string, Joiner>();
    for (const j of joiners) {
      if (j.employeeLocalNumber === localNumber) joinerByLocal.set(j.id, j);
    }
    const leaverByLocal = new Map<string, Leaver>();
    for (const l of leavers) {
      if (l.employeeLocalNumber === localNumber) leaverByLocal.set(l.id, l);
    }

    const auditedJoinerIds = new Set<string>();
    const auditedLeaverIds = new Set<string>();
    for (const e of auditEntries) {
      if (e.kind !== "audit") continue;
      const after = e.audit.after;
      if (!isPlainRecord(after)) continue;
      const id = typeof after.id === "string" ? after.id : undefined;
      if (!id) continue;
      if (e.audit.kind === "joiner") auditedJoinerIds.add(id);
      if (e.audit.kind === "leaver") auditedLeaverIds.add(id);
    }
    const orphanJoiners: HistoryEntry[] = Array.from(joinerByLocal.values())
      .filter((j) => !auditedJoinerIds.has(j.id))
      .map((j) => ({ kind: "joiner", ts: `${j.startDate}T00:00:00.000Z`, joiner: j }));
    const orphanLeavers: HistoryEntry[] = Array.from(leaverByLocal.values())
      .filter((l) => !auditedLeaverIds.has(l.id))
      .map((l) => ({ kind: "leaver", ts: `${l.endDate}T00:00:00.000Z`, leaver: l }));

    const all = [...auditEntries, ...transferEntries, ...orphanJoiners, ...orphanLeavers];
    all.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
    return all;
  }, [localNumber, audit, joiners, leavers, transfers]);

  const filtered = useMemo(() => {
    if (filter === "all") return entries;
    if (filter === "imports") {
      return entries.filter((e) => e.kind === "audit" && e.audit.kind === "hr_import");
    }
    // user-edits: everything that is NOT an hr_import audit entry
    return entries.filter((e) => {
      if (e.kind === "audit") return e.audit.kind !== "hr_import";
      return true;
    });
  }, [entries, filter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  function selectFilter(next: Filter) {
    setFilter(next);
    setPage(0);
  }

  function importMonthFromTs(ts: string): string {
    return ts.slice(0, 7);
  }

  return (
    <div className="card p-4">
      <h2 className="text-sm font-semibold mb-2 flex items-center gap-2">
        <History className="w-4 h-4 text-brand" /> Change history
      </h2>
      <div className="flex items-center gap-1 mb-3">
        {(
          [
            ["all", "All"],
            ["imports", "Imports only"],
            ["user-edits", "User edits only"],
          ] as [Filter, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => selectFilter(key)}
            className={`chip text-xs ${filter === key ? "bg-brand text-brand-foreground border-brand" : ""}`}
            aria-pressed={filter === key}
          >
            {label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-fg-muted">No tracked changes yet</p>
      ) : (
        <ul className="space-y-3">
          {visible.map((e, i) => (
            <HistoryRow
              key={`${e.ts}-${i}`}
              entry={e}
              importMonthFromTs={importMonthFromTs}
              onImportClick={(importId) => navigate(`/ingest/hr/results/${importId}`)}
            />
          ))}
        </ul>
      )}

      {filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-border text-xs">
          <span className="text-fg-muted">
            Showing {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={safePage === 0}
              aria-label="Previous page"
            >
              Prev
            </button>
            <span className="tabular-nums">
              {safePage + 1} / {pageCount}
            </span>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={safePage >= pageCount - 1}
              aria-label="Next page"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function HistoryRow({
  entry,
  importMonthFromTs,
  onImportClick,
}: {
  entry: HistoryEntry;
  importMonthFromTs: (ts: string) => string;
  onImportClick: (importId: string) => void;
}) {
  const accent = accentClass(entry);
  const pill = pillClass(entry);

  if (entry.kind === "transfer") {
    const t = entry.transfer;
    return (
      <li className={`pl-3 border-l-2 ${accent}`}>
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="font-mono text-fg-muted">{entry.ts.slice(0, 16).replace("T", " ")}</span>
          <span className={`chip text-[11px] ${pill}`}>PU transfer</span>
          <span className="text-fg-muted">{t.recordedBy}</span>
        </div>
        <div className="text-sm mt-1">
          PU: <span className="font-mono">{t.fromPuCode}</span> →{" "}
          <span className="font-mono font-semibold">{t.toPuCode}</span>
          <span className="text-fg-muted text-xs ml-2">(effective {t.effectivePeriod})</span>
        </div>
      </li>
    );
  }

  if (entry.kind === "joiner") {
    const j = entry.joiner;
    return (
      <li className={`pl-3 border-l-2 ${accent}`}>
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="font-mono text-fg-muted">{entry.ts.slice(0, 10)}</span>
          <span className={`chip text-[11px] ${pill}`}>Joiner</span>
          <span className="text-fg-muted">{j.source}</span>
        </div>
        <div className="text-sm mt-1">
          Start date <span className="font-mono">{j.startDate}</span> · PU{" "}
          <span className="font-mono">{j.puCode}</span> · Grade {j.gradeCode}
        </div>
      </li>
    );
  }

  if (entry.kind === "leaver") {
    const l = entry.leaver;
    return (
      <li className={`pl-3 border-l-2 ${accent}`}>
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="font-mono text-fg-muted">{entry.ts.slice(0, 10)}</span>
          <span className={`chip text-[11px] ${pill}`}>Leaver</span>
        </div>
        <div className="text-sm mt-1">
          End date <span className="font-mono">{l.endDate}</span> · PU{" "}
          <span className="font-mono">{l.puCode}</span>
          {l.terminationMethod && (
            <span className="text-fg-muted text-xs ml-2">· {l.terminationMethod}</span>
          )}
        </div>
      </li>
    );
  }

  // audit entry
  const a = entry.audit;
  const isImport = a.kind === "hr_import";
  const importId = a.importId;
  const clickable = isImport && Boolean(importId);
  const label = auditKindLabel(a);
  const month = isImport ? importMonthFromTs(a.ts) : null;
  const keys = fieldKeys(a.before, a.after);
  const beforeRec = isPlainRecord(a.before) ? a.before : {};
  const afterRec = isPlainRecord(a.after) ? a.after : {};

  function onClick() {
    if (clickable && importId) onImportClick(importId);
  }

  // For joiner/leaver audit entries, prefer to render the joiner/leaver date.
  const joinerAfter = a.kind === "joiner" && isPlainRecord(a.after) ? a.after : null;
  const leaverAfter = a.kind === "leaver" && isPlainRecord(a.after) ? a.after : null;

  return (
    <li
      className={`pl-3 border-l-2 ${accent} ${
        clickable ? "cursor-pointer hover:bg-bg-hover -ml-1 pl-4 -my-1 py-1 rounded-r" : ""
      }`}
      onClick={onClick}
      onKeyDown={(e) => {
        if (clickable && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick();
        }
      }}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-label={
        clickable
          ? `Open import results ${month ? `for ${month}` : ""}`.trim()
          : undefined
      }
    >
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <span className="font-mono text-fg-muted">{a.ts.slice(0, 16).replace("T", " ")}</span>
        <span className={`chip text-[11px] ${pill}`}>
          {label}
          {month && ` (${month})`}
        </span>
        <span className="text-fg-muted">{a.actor}</span>
      </div>
      {a.kind === "joiner" && joinerAfter ? (
        <div className="text-sm mt-1">
          Start date{" "}
          <span className="font-mono">{String(joinerAfter.startDate ?? "—")}</span> · PU{" "}
          <span className="font-mono">{String(joinerAfter.puCode ?? "—")}</span>
        </div>
      ) : a.kind === "leaver" && leaverAfter ? (
        <div className="text-sm mt-1">
          End date{" "}
          <span className="font-mono">{String(leaverAfter.endDate ?? "—")}</span> · PU{" "}
          <span className="font-mono">{String(leaverAfter.puCode ?? "—")}</span>
        </div>
      ) : keys.length > 0 ? (
        <ul className="mt-1 text-sm space-y-0.5">
          {keys.map((k) => (
            <li key={k}>
              <span className="font-mono text-xs text-fg-muted">{k}</span>:{" "}
              <span className="text-fg-muted">{formatVal(beforeRec[k])}</span> →{" "}
              <span>{formatVal(afterRec[k])}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="text-sm mt-1 text-fg-muted">{a.action}</div>
      )}
    </li>
  );
}
