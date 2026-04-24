import { useMemo } from "react";
import { useAppStore } from "../store";
import { ForecastIndex, effectiveCells } from "../lib/forecast";
import type { ForecastCell } from "../types";

/**
 * Subscribes to `forecastCells`, `lockedSnapshots`, and `cycles`, merges them via
 * `effectiveCells()` (so locked cycles serve their frozen snapshot) and returns
 * a memoized `ForecastIndex` plus the merged cells. Use this from any read path
 * rendering forecast values — it is the only way to honour invariant I17.
 */
export function useForecastIndex(): { cells: ForecastCell[]; index: ForecastIndex } {
  const forecastCells = useAppStore((s) => s.forecastCells);
  const lockedSnapshots = useAppStore((s) => s.lockedSnapshots);
  const cycles = useAppStore((s) => s.cycles);

  const cells = useMemo(
    () => effectiveCells(forecastCells, lockedSnapshots, cycles),
    [forecastCells, lockedSnapshots, cycles],
  );
  const index = useMemo(() => new ForecastIndex(cells), [cells]);
  return { cells, index };
}
