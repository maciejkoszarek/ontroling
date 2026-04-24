import ReactECharts from "echarts-for-react";
import { useMemo } from "react";
import { periodLabel } from "../lib/utils";

export interface HeatmapCell {
  row: string;
  col: string;
  value: number;
}

// ECharts callback shape — only `data` is typed; other fields exist but aren't used here.
type HeatmapEChartsParam = { data: [number, number, number] };

export default function Heatmap({
  rows,
  cols,
  cells,
  min,
  max,
  diverging = false,
  height = 360,
  onCellClick,
  valueFormatter,
  centerZero = false,
  rowLabelFn,
  colLabelFn,
}: {
  rows: string[];
  cols: string[];
  cells: HeatmapCell[];
  min?: number;
  max?: number;
  diverging?: boolean;
  height?: number;
  onCellClick?: (row: string, col: string, value: number) => void;
  valueFormatter?: (v: number) => string;
  centerZero?: boolean;
  rowLabelFn?: (r: string) => string;
  colLabelFn?: (c: string) => string;
}) {
  const data = useMemo(() => {
    return cells
      .map((c) => {
        const x = cols.indexOf(c.col);
        const y = rows.indexOf(c.row);
        if (x < 0 || y < 0) return null;
        return [x, y, c.value];
      })
      .filter(Boolean) as number[][];
  }, [cells, rows, cols]);

  const values = cells.map((c) => c.value);
  const autoMin = min ?? Math.min(...values, 0);
  const autoMax = max ?? Math.max(...values, 0);
  const bound = Math.max(Math.abs(autoMin), Math.abs(autoMax));

  const visualMap = diverging || centerZero
    ? {
        type: "continuous" as const,
        min: -bound,
        max: bound,
        calculable: true,
        orient: "horizontal" as const,
        left: "center",
        bottom: 0,
        text: ["+", "−"],
        textStyle: { color: "rgb(var(--fg-muted))" },
        inRange: {
          color: ["#dc2626", "#fca5a5", "#f3f4f6", "#93c5fd", "#1d4ed8"],
        },
      }
    : {
        type: "continuous" as const,
        min: autoMin,
        max: autoMax,
        calculable: true,
        orient: "horizontal" as const,
        left: "center",
        bottom: 0,
        textStyle: { color: "rgb(var(--fg-muted))" },
        inRange: { color: ["#e0f2fe", "#60a5fa", "#1d4ed8", "#1e3a8a"] },
      };

  const option = {
    grid: { top: 10, left: 110, right: 10, bottom: 50 },
    tooltip: {
      position: "top",
      backgroundColor: "rgba(15,23,42,0.92)",
      borderColor: "transparent",
      textStyle: { color: "#fff", fontSize: 12 },
      formatter: (params: HeatmapEChartsParam) => {
        const [x, y, v] = params.data;
        const rowLabel = rowLabelFn?.(rows[y]) ?? rows[y];
        const colLabel = colLabelFn?.(cols[x]) ?? cols[x];
        const val = valueFormatter ? valueFormatter(v) : Number(v).toLocaleString(undefined, { maximumFractionDigits: 1 });
        return `<div><b>${rowLabel}</b> — ${colLabel}<br/>${val}</div>`;
      },
    },
    xAxis: {
      type: "category",
      data: cols,
      axisLabel: {
        fontSize: 10,
        color: "rgb(var(--fg-muted))",
        formatter: (v: string) => (colLabelFn ? colLabelFn(v) : periodLabel(v, "short")),
      },
      splitArea: { show: false },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    yAxis: {
      type: "category",
      data: rows,
      axisLabel: {
        fontSize: 11,
        color: "rgb(var(--fg))",
        formatter: (v: string) => (rowLabelFn ? rowLabelFn(v) : v),
      },
      splitArea: { show: false },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    visualMap,
    series: [
      {
        type: "heatmap",
        data,
        label: {
          show: rows.length <= 12 && cols.length <= 24,
          fontSize: 9,
          formatter: (p: HeatmapEChartsParam) => (valueFormatter ? valueFormatter(p.data[2]) : String(Math.round(p.data[2] * 10) / 10)),
        },
        itemStyle: { borderWidth: 1, borderColor: "rgb(var(--bg))" },
      },
    ],
  };

  const onEvents = onCellClick
    ? {
        click: (params: HeatmapEChartsParam) => {
          const [x, y, v] = params.data;
          onCellClick(rows[y], cols[x], v);
        },
      }
    : undefined;

  return <ReactECharts option={option} style={{ height }} notMerge lazyUpdate onEvents={onEvents} />;
}
