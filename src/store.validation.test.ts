import { beforeEach, describe, expect, it } from "vitest";
import { useAppStore } from "./store";

function reset() {
  localStorage.clear();
  useAppStore.getState().resetToDemo();
  // Force active cycle into editing so writes are accepted.
  const s = useAppStore.getState();
  useAppStore.setState({
    cycles: s.cycles.map((c) => (c.id === s.activeCycleId ? { ...c, status: "editing" as const } : c)),
    role: "controller",
  });
}

describe("store — validation-clamp audit trail (I4 / I6)", () => {
  beforeEach(reset);

  it("appends a 'validation-clamp' audit entry when ARVE_PCT exceeds 1.2", () => {
    const { activeCycleId, setForecastValue } = useAppStore.getState();
    setForecastValue({
      cycleId: activeCycleId,
      puCode: "PL01NC08",
      period: "2026-05",
      metric: "ARVE_PCT",
      value: 1.5,
    });
    const s = useAppStore.getState();
    // The stored value must be clamped to 1.2.
    const cell = s.forecastCells.find(
      (c) => c.cycleId === activeCycleId && c.puCode === "PL01NC08" && c.period === "2026-05" && c.metric === "ARVE_PCT",
    );
    expect(cell?.value).toBe(1.2);
    // The first two audit rows (newest-first) are: forecast_cell, then validation-clamp.
    const forecastEntry = s.audit[0];
    expect(forecastEntry.entityType).toBe("forecast_cell");
    const clampEntry = s.audit[1];
    expect(clampEntry.entityType).toBe("validation-clamp");
    expect(clampEntry.action).toBe("update");
    expect(clampEntry.entityId).toBe(`${activeCycleId}::PL01NC08::ARVE_PCT::2026-05`);
    expect(clampEntry.before).toEqual({ value: 1.5 });
    expect(clampEntry.after).toMatchObject({ value: 1.2, reason: expect.stringMatching(/ARVE_PCT>1\.2/) });
    expect(clampEntry.actor).toBe(s.user.name);
    expect(typeof clampEntry.ts).toBe("string");
    expect(typeof clampEntry.id).toBe("string");
  });

  it("appends a validation-clamp audit entry when BENCH_PCT goes below 0 (I6)", () => {
    const { activeCycleId, setForecastValue } = useAppStore.getState();
    setForecastValue({
      cycleId: activeCycleId,
      puCode: "PL01NC08",
      period: "2026-05",
      metric: "BENCH_PCT",
      value: -0.1,
    });
    const s = useAppStore.getState();
    const cell = s.forecastCells.find(
      (c) =>
        c.cycleId === activeCycleId && c.puCode === "PL01NC08" && c.period === "2026-05" && c.metric === "BENCH_PCT",
    );
    expect(cell?.value).toBe(0);
    const clamp = s.audit.find((a) => a.entityType === "validation-clamp");
    expect(clamp).toBeDefined();
    expect(clamp?.before).toEqual({ value: -0.1 });
    expect(clamp?.after).toMatchObject({ value: 0, reason: expect.stringMatching(/BENCH_PCT<0/) });
  });

  it("writes exactly one forecast_cell entry and no validation-clamp entry when the value is in range", () => {
    const before = useAppStore.getState().audit.length;
    const { activeCycleId, setForecastValue } = useAppStore.getState();
    setForecastValue({
      cycleId: activeCycleId,
      puCode: "PL01NC08",
      period: "2026-05",
      metric: "ARVE_PCT",
      value: 0.85,
    });
    const s = useAppStore.getState();
    expect(s.audit.length).toBe(before + 1);
    expect(s.audit[0].entityType).toBe("forecast_cell");
    expect(s.audit.some((a) => a.entityType === "validation-clamp")).toBe(false);
  });

  it("clamps negative FTE on write and records a validation-clamp entry", () => {
    const { activeCycleId, setForecastValue } = useAppStore.getState();
    setForecastValue({
      cycleId: activeCycleId,
      puCode: "PL01NC08",
      period: "2026-05",
      metric: "FTE",
      value: -5,
    });
    const s = useAppStore.getState();
    const cell = s.forecastCells.find(
      (c) => c.cycleId === activeCycleId && c.puCode === "PL01NC08" && c.period === "2026-05" && c.metric === "FTE",
    );
    expect(cell?.value).toBe(0);
    const clamp = s.audit.find((a) => a.entityType === "validation-clamp");
    expect(clamp).toBeDefined();
    expect(clamp?.after).toMatchObject({ value: 0, reason: expect.stringMatching(/FTE<0/) });
  });
});
