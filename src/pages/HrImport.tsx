import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { useAppStore } from "../store";
import HrImportDropZone from "../components/hr-import/HrImportDropZone";
import HrImportReviewWalker from "../components/hr-import/HrImportReviewWalker";
import { parseHrDatabaseFile, type HrParseResult } from "../lib/hrDbParser";
import { buildHrImportPreview, type HrImportPreview } from "../lib/hrImportDiff";
import type { HrImportRowDecision, HrImportWarning } from "../types";

type Phase =
  | { kind: "idle" }
  | { kind: "parsing" }
  | { kind: "file-error"; errors: { code: string; message: string }[] }
  | { kind: "staleness-blocked"; preview: HrImportPreview; parse: HrParseResult; lastMonth: string }
  | { kind: "diffing"; preview: HrImportPreview; parse: HrParseResult; overrideReason?: string; startedAt: number }
  | { kind: "committing" }
  | { kind: "done"; importId: string };

export default function HrImport() {
  const role = useAppStore((s) => s.role);
  const userEmail = useAppStore((s) => s.user.email);
  const canImportHr = useAppStore((s) => s.canImportHr);
  const canOverrideStaleness = useAppStore((s) => s.canOverrideStaleness);
  const navigate = useNavigate();

  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [overrideReasonDraft, setOverrideReasonDraft] = useState("");

  if (!canImportHr(role)) {
    return (
      <div className="card p-6 text-sm">
        <h1 className="text-xl font-semibold mb-2">HR Import</h1>
        <p>You don&apos;t have permission to import HR data.</p>
        <Link to="/admin" className="text-brand underline mt-3 inline-block">
          Back to Admin
        </Link>
      </div>
    );
  }

  async function onFile(file: File) {
    setPhase({ kind: "parsing" });
    try {
      const startedAt = Date.now();
      const resolve = useAppStore.getState().buildResolvePuFn();
      const parse = await parseHrDatabaseFile(file, resolve);
      if (parse.fileErrors.length > 0) {
        setPhase({ kind: "file-error", errors: parse.fileErrors });
        return;
      }
      const preview = buildHrImportPreview(parse, useAppStore.getState().employees);
      const lastHr = useAppStore.getState().lastHrImport;
      if (lastHr && preview.fileMonth < lastHr.month) {
        setPhase({ kind: "staleness-blocked", preview, parse, lastMonth: lastHr.month });
        return;
      }
      setPhase({ kind: "diffing", preview, parse, startedAt });
    } catch (e) {
      setPhase({
        kind: "file-error",
        errors: [{ code: "F01", message: (e as Error).message || "Unknown parse error" }],
      });
    }
  }

  function approveOverride() {
    if (phase.kind !== "staleness-blocked") return;
    const reason = overrideReasonDraft.trim();
    if (!reason) return;
    setPhase({
      kind: "diffing",
      preview: phase.preview,
      parse: phase.parse,
      overrideReason: reason,
      startedAt: Date.now(),
    });
  }

  function aggregateWarnings(parse: HrParseResult): HrImportWarning[] {
    const out: HrImportWarning[] = [];
    for (const r of parse.rows) {
      for (const w of r.rowWarnings) out.push(w);
    }
    return out;
  }

  async function onComplete(decisions: HrImportRowDecision[]) {
    if (phase.kind !== "diffing") return;
    setPhase({ kind: "committing" });
    try {
      const warnings = aggregateWarnings(phase.parse);
      const result = useAppStore.getState().commitHrImport({
        preview: phase.preview,
        decisions,
        fileName: phase.parse.fileName,
        fileSize: phase.parse.fileSize,
        durationMs: Date.now() - phase.startedAt,
        reportGeneratedAt: phase.preview.reportGeneratedAt,
        warnings,
        stalenessOverrideReason: phase.overrideReason,
      });
      navigate(`/ingest/hr/results/${result.id}`);
      setPhase({ kind: "done", importId: result.id });
    } catch (e) {
      const msg = (e as Error).message;
      const friendly =
        msg === "STALE_IMPORT"
          ? { code: "F08", message: msg }
          : msg === "FORBIDDEN_HR_IMPORT"
            ? { code: "F-RBAC", message: "You don't have permission to import HR data." }
            : { code: "F01", message: msg };
      setPhase({ kind: "file-error", errors: [friendly] });
    }
  }

  if (phase.kind === "done") {
    return <Navigate to={`/ingest/hr/results/${phase.importId}`} replace />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link to="/admin" className="btn-ghost text-sm" aria-label="Back to Admin">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <h1 className="text-xl font-semibold">HR Import</h1>
      </div>
      <p className="text-sm text-fg-muted">
        Upload the monthly HR Database file. The reviewer accepts, edits, or skips every record before commit.
      </p>

      {phase.kind === "idle" && (
        <div className="card p-6">
          <HrImportDropZone onFile={onFile} />
        </div>
      )}

      {phase.kind === "parsing" && (
        <div className="card p-6 text-center text-sm text-fg-muted">Parsing HR Database file…</div>
      )}

      {phase.kind === "file-error" && (
        <div className="card p-4 border-danger/40 space-y-2">
          <div className="flex items-center gap-2 text-danger">
            <AlertTriangle className="w-4 h-4" />
            <strong className="text-sm">File rejected</strong>
          </div>
          <ul className="text-sm space-y-1">
            {phase.errors.map((err, i) => (
              <li key={i}>
                <strong>{err.code}:</strong> {err.message}
              </li>
            ))}
          </ul>
          <button className="btn mt-2" onClick={() => setPhase({ kind: "idle" })}>
            Choose another file
          </button>
        </div>
      )}

      {phase.kind === "staleness-blocked" && (
        <div className="card p-4 border-warning/40 space-y-2">
          <div className="flex items-center gap-2 text-warning">
            <AlertTriangle className="w-4 h-4" />
            <strong className="text-sm">Stale file</strong>
          </div>
          <p className="text-sm">
            This file is from <strong>{phase.preview.fileMonth}</strong>; you have already imported data for{" "}
            <strong>{phase.lastMonth}</strong>. Importing would overwrite newer data.
          </p>
          {canOverrideStaleness(role) ? (
            <div className="space-y-2">
              <label className="text-sm">
                Reason for override
                <textarea
                  className="input mt-1 w-full"
                  rows={3}
                  value={overrideReasonDraft}
                  onChange={(e) => setOverrideReasonDraft(e.target.value)}
                  placeholder="HR resent the file with corrections, etc."
                  aria-label="Override reason"
                />
              </label>
              <div className="flex gap-2">
                <button className="btn" onClick={() => setPhase({ kind: "idle" })}>
                  Cancel
                </button>
                <button
                  className="btn-primary"
                  onClick={approveOverride}
                  disabled={!overrideReasonDraft.trim()}
                >
                  Override and continue
                </button>
              </div>
            </div>
          ) : (
            <button className="btn" onClick={() => setPhase({ kind: "idle" })}>
              Cancel
            </button>
          )}
        </div>
      )}

      {phase.kind === "diffing" && (
        <DiffingPanel
          preview={phase.preview}
          parse={phase.parse}
          overrideReason={phase.overrideReason}
          currentUserEmail={userEmail}
          onComplete={onComplete}
          onCancel={() => setPhase({ kind: "idle" })}
        />
      )}

      {phase.kind === "committing" && (
        <div className="card p-6 text-center text-sm text-fg-muted">Committing import…</div>
      )}
    </div>
  );
}

function DiffingPanel({
  preview,
  parse,
  overrideReason,
  currentUserEmail,
  onComplete,
  onCancel,
}: {
  preview: HrImportPreview;
  parse: HrParseResult;
  overrideReason?: string;
  currentUserEmail: string;
  onComplete: (decisions: HrImportRowDecision[]) => void;
  onCancel: () => void;
}) {
  const counts = preview.counts;
  const warnings: HrImportWarning[] = [];
  for (const r of parse.rows) for (const w of r.rowWarnings) warnings.push(w);
  const groupedWarnings = new Map<string, number>();
  for (const w of warnings) groupedWarnings.set(w.code, (groupedWarnings.get(w.code) ?? 0) + 1);

  return (
    <div className="space-y-3">
      {overrideReason && (
        <div className="card p-3 border-warning/40 text-sm">
          <strong>Staleness override:</strong> {overrideReason}
        </div>
      )}
      <div className="card p-4">
        <h3 className="text-sm font-semibold mb-2">
          Preview — file month <span className="text-brand">{preview.fileMonth}</span>
        </h3>
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
          <Stat label="Rows read" value={counts.rowsRead} />
          <Stat label="Rejected" value={counts.rowsRejected} />
          <Stat label="New" value={counts.new} />
          <Stat label="Changed" value={counts.changed} />
          <Stat label="Unchanged" value={counts.unchanged} />
          <Stat label="Re-hires" value={counts.rehires} />
          <Stat label="Terminating" value={counts.terminating} />
          <Stat label="Missing-from-file" value={counts.missingFromFile} />
        </dl>
        {groupedWarnings.size > 0 && (
          <div className="mt-3 text-xs">
            <div className="text-fg-muted uppercase tracking-wider mb-1">Warnings</div>
            <ul className="space-y-0.5">
              {Array.from(groupedWarnings.entries()).map(([code, n]) => (
                <li key={code}>
                  <strong>{code}:</strong> {n}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <HrImportReviewWalker
        diffs={preview.diffs}
        warnings={warnings}
        currentUserEmail={currentUserEmail}
        onComplete={onComplete}
        onCancel={onCancel}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-[11px] text-fg-muted uppercase tracking-wider">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}
