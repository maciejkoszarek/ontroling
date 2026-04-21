import { useState } from "react";
import { MessageSquare, Send, CheckCircle2 } from "lucide-react";
import { useAppStore } from "../store";
import { initials } from "../lib/utils";
import type { Comment } from "../types";

export default function CommentFeed({
  entityType,
  entityId,
  period,
  title = "Commentary",
  limit,
}: {
  entityType: Comment["entityType"];
  entityId: string;
  period?: string;
  title?: string;
  limit?: number;
}) {
  const all = useAppStore((s) => s.comments);
  const add = useAppStore((s) => s.addComment);
  const resolve = useAppStore((s) => s.resolveComment);
  const [draft, setDraft] = useState("");

  const filtered = all
    .filter((c) => c.entityType === entityType && c.entityId === entityId && (!period || c.period === period))
    .slice(0, limit);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    add({ entityType, entityId, period, body: draft, mentions: [] });
    setDraft("");
  }

  return (
    <div className="card p-4 flex flex-col h-full min-h-[260px]">
      <div className="flex items-center gap-2 mb-3">
        <MessageSquare className="w-4 h-4 text-fg-muted" />
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="chip">{filtered.length}</span>
      </div>
      <div className="flex-1 overflow-auto space-y-3 pr-1">
        {filtered.length === 0 && (
          <div className="text-sm text-fg-subtle text-center py-8">No commentary yet. Be the first to add context.</div>
        )}
        {filtered.map((c) => (
          <div key={c.id} className="flex gap-2.5 group">
            <div className="w-7 h-7 rounded-full bg-brand/15 text-brand text-[11px] font-semibold grid place-items-center shrink-0">
              {initials(c.author)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-[11px] text-fg-muted">
                <span className="font-medium text-fg">{c.author}</span>
                <span>·</span>
                <span>{new Date(c.createdAt).toLocaleString()}</span>
                {c.resolvedAt && <span className="pill-success !text-[10px] !py-0">Resolved</span>}
              </div>
              <div className="text-sm mt-0.5 whitespace-pre-wrap break-words">{renderMarkdown(c.body)}</div>
              {!c.resolvedAt && (
                <button
                  className="opacity-0 group-hover:opacity-100 text-[11px] text-fg-muted hover:text-success mt-1 inline-flex items-center gap-1"
                  onClick={() => resolve(c.id)}
                >
                  <CheckCircle2 className="w-3 h-3" /> Resolve
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      <form onSubmit={onSubmit} className="flex items-center gap-2 pt-3 border-t border-border mt-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add commentary…"
          className="input"
        />
        <button type="submit" className="btn-primary" disabled={!draft.trim()}>
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}

function renderMarkdown(body: string): React.ReactNode {
  // Tiny markdown: **bold** + line breaks
  const parts = body.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={i}>{p.slice(2, -2)}</strong>;
    return <span key={i}>{p}</span>;
  });
}
