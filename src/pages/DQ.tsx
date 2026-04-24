import { useState } from "react";
import { CheckCircle2, AlertTriangle, XCircle, Play } from "lucide-react";
import { useAppStore } from "../store";

export default function DQ() {
  const checks = useAppStore((s) => s.dqChecks);
  const run = useAppStore((s) => s.runDqChecks);
  const waive = useAppStore((s) => s.waiveDqCheck);
  const [comment, setComment] = useState("");
  const [waivingId, setWaivingId] = useState<string | null>(null);

  const pass = checks.filter((c) => c.status === "pass").length;
  const fail = checks.filter((c) => c.status === "fail").length;
  const waived = checks.filter((c) => c.status === "waived").length;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Data quality & reconciliation</h1>
          <p className="text-sm text-fg-muted">
            Block cycle close while a critical check is failing and un-waived.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="pill-success">{pass} pass</span>
          <span className={fail === 0 ? "pill-success" : "pill-danger"}>{fail} fail</span>
          <span className="pill-warning">{waived} waived</span>
          <button className="btn" onClick={run}>
            <Play className="w-4 h-4" /> Run all checks
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {checks.map((c) => (
          <div
            key={c.id}
            className={
              c.status === "pass"
                ? "card p-4 border-success/30"
                : c.status === "fail"
                ? "card p-4 border-danger/40"
                : "card p-4 border-warning/30"
            }
          >
            <div className="flex items-center gap-2 mb-2">
              {c.status === "pass" && <CheckCircle2 className="w-5 h-5 text-success" />}
              {c.status === "fail" && <XCircle className="w-5 h-5 text-danger" />}
              {c.status === "waived" && <AlertTriangle className="w-5 h-5 text-warning" />}
              <h3 className="text-sm font-semibold flex-1">{c.name}</h3>
              <span
                className={
                  c.severity === "critical"
                    ? "pill-danger !py-0 !text-[10px]"
                    : c.severity === "warning"
                    ? "pill-warning !py-0 !text-[10px]"
                    : "chip"
                }
              >
                {c.severity}
              </span>
            </div>
            <p className="text-xs text-fg-muted">{c.description}</p>

            {c.failingRows && c.failingRows.length > 0 && c.status === "fail" && (
              <div className="mt-2 space-y-1 text-xs">
                {c.failingRows.slice(0, 5).map((row, i) => (
                  <div key={i} className="font-mono text-[11px] text-fg-muted truncate">
                    {JSON.stringify(row)}
                  </div>
                ))}
              </div>
            )}

            {c.status === "fail" && waivingId !== c.id && (
              <button className="btn mt-3 w-full" onClick={() => setWaivingId(c.id)}>
                Waive for this cycle
              </button>
            )}
            {waivingId === c.id && (
              <div className="mt-3 flex gap-2">
                <input
                  className="input"
                  placeholder="Reason required…"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
                <button
                  className="btn-primary"
                  disabled={!comment.trim()}
                  onClick={() => {
                    waive(c.id, comment);
                    setComment("");
                    setWaivingId(null);
                  }}
                >
                  Save
                </button>
              </div>
            )}
            {c.status === "waived" && (
              <div className="mt-2 text-[11px] text-fg-muted italic">
                Waived by {c.waivedBy}: {c.waivedComment}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
