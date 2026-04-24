import { beforeEach, describe, expect, it } from "vitest";
import { useAppStore } from "./store";

function reset() {
  localStorage.clear();
  useAppStore.getState().resetToDemo();
  // Force active cycle into editing so RBAC is the only thing guarding writes.
  const s = useAppStore.getState();
  useAppStore.setState({
    cycles: s.cycles.map((c) => (c.id === s.activeCycleId ? { ...c, status: "editing" as const } : c)),
  });
}

describe("store — I25 pu_lead PU scoping on forecast writes", () => {
  beforeEach(reset);

  it("pu_lead can write to their own PU but NOT to another PU; out-of-scope write leaves forecastCells unchanged", () => {
    const { activeCycleId, setForecastValue } = useAppStore.getState();
    // Put the pu_lead in charge of PL01NC03 (SE1).
    useAppStore.setState({
      role: "pu_lead",
      user: { ...useAppStore.getState().user, puCode: "PL01NC03" },
    });

    // Own PU write — allowed. Use a sentinel value unlikely to collide with seed data.
    setForecastValue({
      cycleId: activeCycleId,
      puCode: "PL01NC03",
      period: "2026-05",
      metric: "FTE",
      value: 1234.5,
    });
    const afterOwn = useAppStore.getState().forecastCells;
    const ownCell = afterOwn.find(
      (c) => c.cycleId === activeCycleId && c.puCode === "PL01NC03" && c.period === "2026-05" && c.metric === "FTE",
    );
    expect(ownCell?.value).toBe(1234.5);

    // Out-of-scope PU write — blocked. forecastCells must not change, and no cell with
    // the sentinel value should appear for PL01NC04.
    const beforeBlocked = useAppStore.getState().forecastCells;
    const sentinel = 999999;
    setForecastValue({
      cycleId: activeCycleId,
      puCode: "PL01NC04",
      period: "2026-05",
      metric: "FTE",
      value: sentinel,
    });
    const afterBlocked = useAppStore.getState().forecastCells;
    // Blocked write leaves the reference identical (no set() call).
    expect(afterBlocked).toBe(beforeBlocked);
    expect(
      afterBlocked.some(
        (c) =>
          c.cycleId === activeCycleId &&
          c.puCode === "PL01NC04" &&
          c.period === "2026-05" &&
          c.metric === "FTE" &&
          c.value === sentinel,
      ),
    ).toBe(false);
  });

  it("controller can write to any PU, regardless of user.puCode", () => {
    useAppStore.setState({
      role: "controller",
      user: { ...useAppStore.getState().user, puCode: "PL01NC03" },
    });
    const { activeCycleId, setForecastValue } = useAppStore.getState();

    const targets: Array<[string, number]> = [
      ["PL01NC03", 10],
      ["PL01NC04", 20],
      ["PL01NC08", 30],
      ["PL01NC10", 40],
    ];
    for (const [pu, value] of targets) {
      setForecastValue({
        cycleId: activeCycleId,
        puCode: pu,
        period: "2026-06",
        metric: "FTE",
        value,
      });
    }
    const cells = useAppStore.getState().forecastCells;
    for (const [pu, value] of targets) {
      const cell = cells.find(
        (c) => c.cycleId === activeCycleId && c.puCode === pu && c.period === "2026-06" && c.metric === "FTE",
      );
      expect(cell?.value).toBe(value);
    }
  });

  it("canEditCycle returns true for controller on any PU and for pu_lead only on their own PU", () => {
    const { activeCycleId } = useAppStore.getState();

    useAppStore.setState({ role: "controller" });
    expect(useAppStore.getState().canEditCycle(activeCycleId, "PL01NC04")).toBe(true);
    expect(useAppStore.getState().canEditCycle(activeCycleId, "PL01NC08")).toBe(true);

    useAppStore.setState({
      role: "pu_lead",
      user: { ...useAppStore.getState().user, puCode: "PL01NC03" },
    });
    expect(useAppStore.getState().canEditCycle(activeCycleId, "PL01NC03")).toBe(true);
    expect(useAppStore.getState().canEditCycle(activeCycleId, "PL01NC04")).toBe(false);
  });
});
