import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Check, X, Pencil, FastForward } from "lucide-react";
import type { HrEmployeeDiff } from "../../lib/hrImportDiff";
import type { HrImportRowDecision, HrImportWarning } from "../../types";

interface Props {
  diffs: HrEmployeeDiff[];
  warnings: HrImportWarning[];
  currentUserEmail: string;
  onComplete: (decisions: HrImportRowDecision[]) => void;
  onCancel: () => void;
}

type Filter = "all" | "errors-only" | "changed-only" | "new-only";

/** Diff kinds the reviewer must decide on. `missing-from-file` is informational. */
const REVIEWABLE = new Set([
  "new-employee",
  "changed",
  "unchanged",
  "re-hire",
  "terminating",
]);

const KIND_BADGE: Record<HrEmployeeDiff["diffKind"], string> = {
  "new-employee": "bg-success/10 text-success",
  changed: "bg-warning/10 text-warning",
  unchanged: "bg-bg-hover text-fg-muted",
  "re-hire": "bg-brand/10 text-brand",
  terminating: "bg-danger/10 text-danger",
  "missing-from-file": "bg-bg-hover text-fg-muted italic",
};

const SORT_ORDER: Record<HrEmployeeDiff["diffKind"], number> = {
  changed: 1,
  "re-hire": 2,
  terminating: 3,
  "new-employee": 4,
  unchanged: 5,
  "missing-from-file": 6,
};

function sortDiffs(diffs: HrEmployeeDiff[], warningsByEmp: Map<string, HrImportWarning[]>): HrEmployeeDiff[] {
  return [...diffs].sort((a, b) => {
    const aw = warningsByEmp.get(a.localNumber)?.length ?? 0;
    const bw = warningsByEmp.get(b.localNumber)?.length ?? 0;
    if (aw !== bw) return bw - aw;
    return SORT_ORDER[a.diffKind] - SORT_ORDER[b.diffKind];
  });
}

export default function HrImportReviewWalker({ diffs, warnings, currentUserEmail, onComplete, onCancel }: Props) {
  const warningsByEmp = useMemo(() => {
    const m = new Map<string, HrImportWarning[]>();
    for (const w of warnings) {
      const arr = m.get(w.localNumber) ?? [];
      arr.push(w);
      m.set(w.localNumber, arr);
    }
    return m;
  }, [warnings]);

  const sorted = useMemo(() => sortDiffs(diffs, warningsByEmp), [diffs, warningsByEmp]);

  const [filter, setFilter] = useState<Filter>("all");

  const filtered = useMemo(() => {
    if (filter === "all") return sorted;
    if (filter === "errors-only") return sorted.filter((d) => (warningsByEmp.get(d.localNumber)?.length ?? 0) > 0);
    if (filter === "changed-only") return sorted.filter((d) => d.diffKind === "changed");
    if (filter === "new-only") return sorted.filter((d) => d.diffKind === "new-employee");
    return sorted;
  }, [sorted, filter, warningsByEmp]);

  const [index, setIndex] = useState(0);
  const [decisionsByLocal, setDecisionsByLocal] = useState<Map<string, HrImportRowDecision>>(new Map());
  const [editing, setEditing] = useState(false);
  const [editValues, setEditValues] = useState<Record<string, unknown>>({});

  // Reset position when filter changes.
  useEffect(() => {
    setIndex(0);
    setEditing(false);
  }, [filter]);

  const current = filtered[index];

  const reviewableCount = useMemo(
    () => diffs.filter((d) => REVIEWABLE.has(d.diffKind)).length,
    [diffs],
  );

  const decidedCount = decisionsByLocal.size;

  const recordDecision = (
    diff: HrEmployeeDiff,
    action: HrImportRowDecision["action"],
    edits?: Record<string, unknown>,
  ) => {
    if (!REVIEWABLE.has(diff.diffKind)) return;
    setDecisionsByLocal((prev) => {
      const next = new Map(prev);
      next.set(diff.localNumber, {
        importId: "pending",
        localNumber: diff.localNumber,
        diffKind:
          diff.diffKind === "missing-from-file" ? "missing-from-file" : diff.diffKind,
        fieldDiffs: diff.fieldDiffs.map((f) => ({
          field: String(f.field),
          before: f.before,
          after: f.after,
        })),
        decidedBy: currentUserEmail,
        decidedAt: new Date().toISOString(),
        action,
        edits,
      });
      return next;
    });
  };

  const advance = () => {
    setEditing(false);
    setIndex((i) => Math.min(i + 1, filtered.length - 1));
  };

  const onAccept = () => {
    if (!current) return;
    recordDecision(current, "accept");
    advance();
  };

  const onSkip = () => {
    if (!current) return;
    recordDecision(current, "skip");
    advance();
  };

  const onEdit = () => {
    if (!current) return;
    const seed: Record<string, unknown> = {};
    for (const f of current.fieldDiffs) {
      seed[String(f.field)] = f.after;
    }
    setEditValues(seed);
    setEditing(true);
  };

  const saveEdit = () => {
    if (!current) return;
    recordDecision(current, "edit-accept", editValues);
    setEditing(false);
    advance();
  };

  const onAcceptAllUnchanged = () => {
    setDecisionsByLocal((prev) => {
      const next = new Map(prev);
      for (const d of diffs) {
        if (d.diffKind !== "unchanged") continue;
        if (next.has(d.localNumber)) continue;
        next.set(d.localNumber, {
          importId: "pending",
          localNumber: d.localNumber,
          diffKind: "unchanged",
          fieldDiffs: [],
          decidedBy: currentUserEmail,
          decidedAt: new Date().toISOString(),
          action: "accept",
        });
      }
      return next;
    });
  };

  // Keyboard shortcuts (j/k/a/s/e). Skip when an input is focused.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      if (e.key === "j") {
        e.preventDefault();
        setIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "k") {
        e.preventDefault();
        setIndex((i) => Math.max(0, i - 1));
      } else if (e.key === "a") {
        e.preventDefault();
        onAccept();
      } else if (e.key === "s") {
        e.preventDefault();
        onSkip();
      } else if (e.key === "e") {
        e.preventDefault();
        onEdit();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, filtered.length]);

  // Once every reviewable diff has a decision, fire onComplete.
  const allReviewed = decidedCount >= reviewableCount && reviewableCount > 0;

  if (!current) {
    return (
      <div className="card p-6 text-center text-sm text-fg-muted">
        No diffs to review.
        <div className="mt-3">
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
          {decidedCount > 0 && (
            <button
              className="btn-primary ml-2"
              onClick={() => onComplete(Array.from(decisionsByLocal.values()))}
            >
              Continue ({decidedCount})
            </button>
          )}
        </div>
      </div>
    );
  }

  const empName =
    current.parsedRow?.employee.displayName ||
    current.currentEmployee?.displayName ||
    `${current.parsedRow?.employee.firstName ?? current.currentEmployee?.firstName ?? ""} ${current.parsedRow?.employee.lastName ?? current.currentEmployee?.lastName ?? ""}`.trim();

  const empWarnings = warningsByEmp.get(current.localNumber) ?? [];

  return (
    <div className="card p-4 space-y-3" data-testid="review-walker">
      {/* Progress + filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="text-sm">
          Reviewing <strong>{index + 1}</strong> / {filtered.length}
          <span className="text-fg-muted ml-2">
            (decided {decidedCount} / {reviewableCount})
          </span>
        </div>
        <div className="flex gap-1 ml-auto">
          {(["all", "errors-only", "changed-only", "new-only"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`chip text-xs ${filter === f ? "bg-brand text-brand-foreground" : ""}`}
            >
              {f.replace("-", " ")}
            </button>
          ))}
        </div>
        {filter === "all" && (
          <button className="btn-ghost text-xs" onClick={onAcceptAllUnchanged} title="Accept all unchanged">
            <FastForward className="w-3 h-3" /> Accept all unchanged
          </button>
        )}
      </div>

      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`chip ${KIND_BADGE[current.diffKind]}`}>{current.diffKind}</span>
        <strong className="text-sm">{empName || current.localNumber}</strong>
        <span className="text-fg-muted text-xs">{current.localNumber}</span>
        {decisionsByLocal.has(current.localNumber) && (
          <span className="chip text-xs ml-auto">decided: {decisionsByLocal.get(current.localNumber)?.action}</span>
        )}
      </div>

      {/* Field diffs */}
      {current.diffKind === "missing-from-file" ? (
        <div className="text-sm text-fg-muted">
          This employee is in the system but absent from the file. No automatic action — informational only.
        </div>
      ) : current.fieldDiffs.length === 0 && current.diffKind !== "new-employee" ? (
        <div className="text-sm text-fg-muted">No field changes detected.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="table-th">Field</th>
                <th className="table-th">Current</th>
                <th className="table-th">File</th>
                {editing && <th className="table-th">Override</th>}
              </tr>
            </thead>
            <tbody>
              {current.fieldDiffs.map((d) => (
                <tr key={String(d.field)}>
                  <td className="table-td font-mono text-xs">{String(d.field)}</td>
                  <td className="table-td text-fg-muted">{formatVal(d.before)}</td>
                  <td className="table-td">{formatVal(d.after)}</td>
                  {editing && (
                    <td className="table-td">
                      <input
                        className="input"
                        defaultValue={typeof d.after === "string" ? d.after : ""}
                        onChange={(e) =>
                          setEditValues((prev) => ({ ...prev, [String(d.field)]: e.target.value }))
                        }
                        aria-label={`Override ${String(d.field)}`}
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Warnings */}
      {empWarnings.length > 0 && (
        <ul className="text-xs text-warning space-y-1">
          {empWarnings.map((w, i) => (
            <li key={i}>
              <strong>{w.code}:</strong> {w.message}
            </li>
          ))}
        </ul>
      )}

      {/* Action bar */}
      <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-border">
        <button
          className="btn"
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
          aria-label="Previous"
          title="prev (k)"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          className="btn"
          onClick={() => setIndex((i) => Math.min(filtered.length - 1, i + 1))}
          disabled={index >= filtered.length - 1}
          aria-label="Next"
          title="next (j)"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        {REVIEWABLE.has(current.diffKind) && !editing && (
          <>
            <button className="btn" onClick={onSkip} aria-label="Skip" title="skip (s)">
              <X className="w-4 h-4" /> Skip
            </button>
            <button className="btn-primary" onClick={onAccept} aria-label="Accept" title="accept (a)">
              <Check className="w-4 h-4" /> Accept
            </button>
            {current.fieldDiffs.length > 0 && (
              <button className="btn" onClick={onEdit} aria-label="Edit and accept" title="edit (e)">
                <Pencil className="w-4 h-4" /> Edit & Accept
              </button>
            )}
          </>
        )}
        {editing && (
          <>
            <button className="btn" onClick={() => setEditing(false)}>Cancel edit</button>
            <button className="btn-primary" onClick={saveEdit}>Save edits</button>
          </>
        )}
        <span className="ml-auto text-xs text-fg-muted">
          j next · k prev · a accept · s skip · e edit
        </span>
      </div>

      {/* Continue / cancel */}
      <div className="flex items-center gap-2 pt-2">
        <button className="btn" onClick={onCancel}>
          Cancel import
        </button>
        <button
          className="btn-primary ml-auto"
          disabled={!allReviewed}
          onClick={() => onComplete(Array.from(decisionsByLocal.values()))}
        >
          Continue to commit ({decidedCount}/{reviewableCount})
        </button>
      </div>
    </div>
  );
}

function formatVal(v: unknown): string {
  if (v === undefined || v === null || v === "") return "—";
  if (typeof v === "number") return String(v);
  return String(v);
}
