import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useAppStore } from "../store";
import type { ForecastCell } from "../types";
import { cellValue } from "../lib/forecast";
import { useForecastIndex } from "./useForecastIndex";

function reset() {
  localStorage.clear();
  useAppStore.getState().resetToDemo();
  useAppStore.setState({ role: "controller" });
}

describe("useForecastIndex — I17 locked-snapshot precedence", () => {
  beforeEach(reset);

  it("serves cells from lockedSnapshots for a locked cycle, even when forecastCells has edits under that cycleId", () => {
    // fc-2026-03 is seeded as locked with a snapshot populated from demo cells.
    const lockedId = "fc-2026-03";
    const puCode = "PL01NC08";
    const period = "2026-04";
    const metric = "FTE" as const;

    const snapshot = useAppStore.getState().lockedSnapshots[lockedId];
    expect(snapshot?.length ?? 0).toBeGreaterThan(0);

    // Sanity: hook should match the frozen snapshot for this (cycle, pu, period, metric).
    const snapshotValue =
      snapshot?.find(
        (c) => c.puCode === puCode && c.period === period && c.metric === metric && !c.grade && !c.mu,
      )?.value ?? 0;

    // Now inject a live edit on the locked cycleId with a clearly-different value.
    // This simulates a stale write slipping through — effectiveCells() must drop it.
    const sentinel = 123456;
    const live: ForecastCell = {
      cycleId: lockedId,
      puCode,
      period,
      metric,
      value: sentinel,
      source: "manual",
      enteredBy: "test",
      enteredAt: "2026-04-01T00:00:00Z",
    };
    act(() => {
      // Prepend so cellValue (first-match) returns the poisoned edit when reading raw.
      useAppStore.setState((s) => ({ forecastCells: [live, ...s.forecastCells] }));
    });

    // A raw read of `forecastCells` sees the poisoned edit…
    const raw = cellValue(useAppStore.getState().forecastCells, lockedId, puCode, metric, period);
    expect(raw).toBe(sentinel);

    // …but the hook must hide it behind the snapshot.
    const { result } = renderHook(() => useForecastIndex());
    const viaHook = result.current.index.get(lockedId, puCode, metric, period);
    expect(viaHook).not.toBe(sentinel);
    expect(viaHook).toBe(snapshotValue);

    // And the merged `cells` array contains the snapshot cell, not the live one.
    const cellsForLocked = result.current.cells.filter(
      (c) => c.cycleId === lockedId && c.puCode === puCode && c.period === period && c.metric === metric,
    );
    expect(cellsForLocked.some((c) => c.value === sentinel)).toBe(false);
  });

  it("passes through live cells unchanged for cycles that are still editing", () => {
    const editingId = "fc-2026-04"; // seeded as editing
    const puCode = "PL01NC08";
    const period = "2026-05";
    const metric = "FTE" as const;
    const value = 77;

    act(() => {
      useAppStore.getState().setForecastValue({ cycleId: editingId, puCode, period, metric, value });
    });

    const { result } = renderHook(() => useForecastIndex());
    expect(result.current.index.get(editingId, puCode, metric, period)).toBe(value);
  });
});
