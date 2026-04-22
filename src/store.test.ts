import { beforeEach, describe, expect, it } from "vitest";
import { useAppStore } from "./store";

function reset() {
  localStorage.clear();
  const s = useAppStore.getState();
  // Force editing status on the active cycle so RBAC-gated actions run.
  const active = s.cycles.find((c) => c.id === s.activeCycleId);
  if (active) {
    useAppStore.setState({
      cycles: s.cycles.map((c) => (c.id === active.id ? { ...c, status: "editing" as const } : c)),
    });
  }
  useAppStore.setState({ role: "controller" });
}

describe("store — forecast edits and audit", () => {
  beforeEach(reset);

  it("setForecastValue writes a cell and a matching audit entry", () => {
    const { activeCycleId, setForecastValue } = useAppStore.getState();
    const before = useAppStore.getState().audit.length;
    setForecastValue({
      cycleId: activeCycleId,
      puCode: "PL01NC08",
      period: "2026-05",
      metric: "FTE",
      value: 42,
    });
    const s = useAppStore.getState();
    const cell = s.forecastCells.find(
      (c) => c.cycleId === activeCycleId && c.puCode === "PL01NC08" && c.metric === "FTE" && c.period === "2026-05",
    );
    expect(cell?.value).toBe(42);
    expect(s.audit.length).toBe(before + 1);
    expect(s.audit[0].entityType).toBe("forecast_cell");
    expect(s.audit[0].action === "create" || s.audit[0].action === "update").toBe(true);
  });

  it("setForecastValue is a no-op when canEditCycle is false", () => {
    const { activeCycleId } = useAppStore.getState();
    // Set active cycle back to locked so edits should be rejected.
    useAppStore.setState({
      cycles: useAppStore
        .getState()
        .cycles.map((c) => (c.id === activeCycleId ? { ...c, status: "locked" as const } : c)),
    });
    const before = useAppStore.getState().forecastCells.length;
    useAppStore.getState().setForecastValue({
      cycleId: activeCycleId,
      puCode: "PL01NC08",
      period: "2026-05",
      metric: "FTE",
      value: 999,
    });
    expect(useAppStore.getState().forecastCells.length).toBe(before);
  });

  it("canEditCycle requires role controller or pu_lead and status editing", () => {
    const { activeCycleId } = useAppStore.getState();
    expect(useAppStore.getState().canEditCycle(activeCycleId)).toBe(true);

    useAppStore.setState({ role: "viewer" });
    expect(useAppStore.getState().canEditCycle(activeCycleId)).toBe(false);

    useAppStore.setState({ role: "pu_lead" });
    expect(useAppStore.getState().canEditCycle(activeCycleId)).toBe(true);

    useAppStore.setState({
      cycles: useAppStore
        .getState()
        .cycles.map((c) => (c.id === activeCycleId ? { ...c, status: "reconciling" as const } : c)),
    });
    expect(useAppStore.getState().canEditCycle(activeCycleId)).toBe(false);
  });
});

describe("store — cycle lifecycle", () => {
  beforeEach(reset);

  it("lockCycle freezes a snapshot and transitions status", () => {
    const { activeCycleId, setForecastValue, lockCycle } = useAppStore.getState();
    setForecastValue({
      cycleId: activeCycleId,
      puCode: "PL01NC08",
      period: "2026-05",
      metric: "FTE",
      value: 11,
    });
    lockCycle(activeCycleId);
    const s = useAppStore.getState();
    const cycle = s.cycles.find((c) => c.id === activeCycleId);
    expect(cycle?.status).toBe("locked");
    expect(s.lockedSnapshots[activeCycleId]?.length).toBeGreaterThan(0);
    expect(s.audit.some((a) => a.action === "lock" && a.entityId === activeCycleId)).toBe(true);
  });

  it("lockCycle is rejected for non-controller roles", () => {
    const { activeCycleId, lockCycle } = useAppStore.getState();
    useAppStore.setState({ role: "pu_lead" });
    lockCycle(activeCycleId);
    expect(useAppStore.getState().cycles.find((c) => c.id === activeCycleId)?.status).toBe("editing");
  });
});
