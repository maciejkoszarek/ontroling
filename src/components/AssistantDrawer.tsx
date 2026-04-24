import { useState } from "react";
import { Sparkles, X, Send } from "lucide-react";
import { useAppStore } from "../store";
import { ForecastIndex } from "../lib/forecast";
import { leafPuCodes } from "../lib/demoData";
import { formatNumber, periodLabel } from "../lib/utils";

// A deterministic "assistant" that answers a handful of question patterns using
// the in-memory store — demonstrates how the real LLM-backed assistant would work.

type Msg = { role: "user" | "assistant"; body: string };

const EXAMPLES = [
  "Why did FTE change most in SE2 vs previous FC?",
  "Which PUs have bench problems this month?",
  "What is the total HC and FTE for April 2026?",
  "How many joiners are planned in the next 3 months?",
];

export default function AssistantDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", body: "I can answer questions grounded in your live data. Try one of the examples below." },
  ]);

  const state = useAppStore();

  if (!open) return null;

  function onSend(text?: string) {
    const q = (text ?? input).trim();
    if (!q) return;
    const reply = answer(q, state);
    setMessages((m) => [...m, { role: "user", body: q }, { role: "assistant", body: reply }]);
    setInput("");
  }

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="flex-1 bg-fg/30 backdrop-blur-sm" />
      <aside className="w-[440px] max-w-[92vw] h-full bg-bg-card border-l border-border flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="h-14 flex items-center gap-2 px-4 border-b border-border">
          <Sparkles className="w-4 h-4 text-brand" />
          <h3 className="text-sm font-semibold flex-1">Assistant</h3>
          <button className="btn-ghost" onClick={onClose}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4 space-y-3">
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : "flex"}>
              <div
                className={
                  m.role === "user"
                    ? "px-3 py-2 rounded-xl rounded-br-sm bg-brand text-brand-foreground max-w-[85%] text-sm"
                    : "px-3 py-2 rounded-xl rounded-bl-sm bg-bg-muted text-sm max-w-[90%] whitespace-pre-wrap"
                }
              >
                {m.body}
              </div>
            </div>
          ))}
          {messages.length === 1 && (
            <div className="pt-3">
              <div className="text-[11px] uppercase tracking-wider text-fg-subtle mb-2">Examples</div>
              <div className="flex flex-col gap-1.5">
                {EXAMPLES.map((q) => (
                  <button key={q} className="btn text-left justify-start" onClick={() => onSend(q)}>
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <form
          className="p-3 border-t border-border flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            onSend();
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="input"
            placeholder="Ask about headcount, forecasts, variance, attrition…"
          />
          <button type="submit" className="btn-primary">
            <Send className="w-4 h-4" />
          </button>
        </form>
      </aside>
    </div>
  );
}

function answer(q: string, s: ReturnType<typeof useAppStore.getState>): string {
  const lower = q.toLowerCase();
  const idx = new ForecastIndex(s.forecastCells);
  const period = s.cycles.find((c) => c.id === s.activeCycleId)?.periodOpened ?? "2026-04";

  if (lower.includes("joiner")) {
    const horizon = 3;
    const [y, m] = period.split("-").map(Number);
    const periods = Array.from({ length: horizon }, (_, i) => {
      const d = new Date(Date.UTC(y, m - 1 + i, 1));
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    });
    const total = s.joiners.filter((j) => j.status === "planned" && periods.includes(j.startDate.slice(0, 7))).length;
    return `There are ${total} planned joiners across CCA for the next ${horizon} months (${periods[0]} → ${periods.at(-1)}). The largest cohorts are in SE1 and SE2.`;
  }

  if (lower.includes("bench") || lower.includes("arve")) {
    const perPu = leafPuCodes.map((pu) => ({
      pu,
      arve: idx.get(s.activeCycleId, pu, "ARVE_PCT", period),
    })).sort((a, b) => a.arve - b.arve);
    const bottom = perPu.slice(0, 3).map((p) => `${p.pu} (${Math.round(p.arve * 100)}%)`);
    return `The lowest ARVE this month is in: ${bottom.join(", ")}. Consider checking /bench for matching suggestions.`;
  }

  if (lower.includes("fte") || lower.includes("hc") || lower.includes("headcount")) {
    const fte = leafPuCodes.reduce((acc, pu) => acc + idx.get(s.activeCycleId, pu, "FTE", period), 0);
    const hc = leafPuCodes.reduce((acc, pu) => acc + idx.get(s.activeCycleId, pu, "HC_END", period), 0);
    return `For ${periodLabel(period, "long")} the current forecast is ~${formatNumber(hc, 0)} HC / ${formatNumber(fte, 1)} FTE across CCA.`;
  }

  if (lower.includes("variance") || lower.includes("fc vs fc") || lower.includes("changed")) {
    const prev = s.previousCycleId;
    const perPu = leafPuCodes.map((pu) => {
      const cur = idx.get(s.activeCycleId, pu, "FTE", period);
      const pv = idx.get(prev, pu, "FTE", period);
      return { pu, delta: cur - pv };
    });
    const top = perPu.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 3);
    return `Top FTE movements vs previous FC for ${periodLabel(period, "short")}:\n${top.map((t) => `- ${t.pu}: ${t.delta > 0 ? "+" : ""}${t.delta.toFixed(1)} FTE`).join("\n")}`;
  }

  return `I don't yet know how to answer that precisely — try rephrasing, or check the relevant section (cockpit, FC/FC, ARVE, Joiners & Leavers).`;
}
