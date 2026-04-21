import { useState } from "react";
import { Bell, ChevronDown, Menu, Search, Sparkles } from "lucide-react";
import { useAppStore } from "../store";
import { periodLabel } from "../lib/utils";
import * as demo from "../lib/demoData";
import CommandPalette from "./CommandPalette";
import AssistantDrawer from "./AssistantDrawer";

export default function TopBar({ onMenuClick }: { onMenuClick: () => void }) {
  const cycles = useAppStore((s) => s.cycles);
  const activeCycleId = useAppStore((s) => s.activeCycleId);
  const setActiveCycle = useAppStore((s) => s.setActiveCycle);
  const anomalies = useAppStore((s) => s.anomalies);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [cycleOpen, setCycleOpen] = useState(false);

  const activeCycle = cycles.find((c) => c.id === activeCycleId);

  return (
    <>
      <header className="h-14 border-b border-border bg-bg-card/80 backdrop-blur sticky top-0 z-40 flex items-center gap-2 px-3 lg:px-4">
        <button className="btn-ghost lg:hidden" onClick={onMenuClick}>
          <Menu className="w-5 h-5" />
        </button>

        <div className="relative">
          <button
            className="btn"
            onClick={() => setCycleOpen((o) => !o)}
            onBlur={() => setTimeout(() => setCycleOpen(false), 150)}
          >
            <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
            <span>{activeCycle?.label ?? "No active cycle"}</span>
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          {cycleOpen && (
            <div className="absolute left-0 mt-1 w-72 card p-1.5 z-50">
              <div className="px-2 py-1 text-[11px] uppercase tracking-wider text-fg-subtle">Switch cycle</div>
              {cycles.map((c) => (
                <button
                  key={c.id}
                  className="w-full flex items-center justify-between px-2 py-1.5 text-sm rounded-md hover:bg-bg-hover"
                  onMouseDown={() => {
                    setActiveCycle(c.id);
                    setCycleOpen(false);
                  }}
                >
                  <span className="flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full ${c.status === "editing" ? "bg-success" : c.status === "open" || c.status === "reconciling" ? "bg-warning" : c.status === "archived" ? "bg-fg-subtle/50" : "bg-fg-subtle"}`} />
                    {c.label}
                  </span>
                  <span className="text-[11px] text-fg-muted capitalize">{c.status}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="hidden md:flex text-[11px] text-fg-muted">
          <span>As of {periodLabel(demo.currentPeriod, "long")}</span>
        </div>

        <div className="flex-1" />

        <button
          className="btn hidden md:inline-flex text-fg-muted"
          onClick={() => setPaletteOpen(true)}
        >
          <Search className="w-4 h-4" />
          <span>Search</span>
          <span className="kbd ml-2">⌘K</span>
        </button>

        <button className="btn relative" title="Notifications">
          <Bell className="w-4 h-4" />
          {anomalies.length > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-danger text-white text-[10px] font-semibold grid place-items-center">
              {anomalies.length}
            </span>
          )}
        </button>

        <button className="btn-primary" onClick={() => setAssistantOpen(true)}>
          <Sparkles className="w-4 h-4" />
          <span className="hidden md:inline">Assistant</span>
        </button>
      </header>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <AssistantDrawer open={assistantOpen} onClose={() => setAssistantOpen(false)} />
    </>
  );
}
