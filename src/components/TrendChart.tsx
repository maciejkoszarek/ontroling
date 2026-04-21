import ReactECharts from "echarts-for-react";
import { periodLabel } from "../lib/utils";

export interface TrendSeries {
  name: string;
  type?: "line" | "bar";
  data: number[];
  stack?: string;
  color?: string;
  yAxisIndex?: number;
  smooth?: boolean;
}

export default function TrendChart({
  periods,
  series,
  markPeriod,
  height = 320,
  dualAxis = false,
  title,
}: {
  periods: string[];
  series: TrendSeries[];
  markPeriod?: string;
  height?: number;
  dualAxis?: boolean;
  title?: string;
}) {
  const xAxisData = periods.map((p) => periodLabel(p, "short"));
  const markIndex = markPeriod ? periods.indexOf(markPeriod) : -1;

  const option = {
    title: title ? { text: title, textStyle: { fontSize: 13, fontWeight: 500 }, left: 0, top: 0 } : undefined,
    grid: { left: 40, right: 20, top: title ? 40 : 20, bottom: 30 },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      backgroundColor: "rgba(15,23,42,0.92)",
      borderColor: "transparent",
      textStyle: { color: "#fff", fontSize: 12 },
    },
    legend: { top: title ? 10 : 0, right: 0, textStyle: { fontSize: 11 }, itemWidth: 12, itemHeight: 8 },
    xAxis: {
      type: "category",
      data: xAxisData,
      axisLine: { lineStyle: { color: "rgba(148,163,184,0.4)" } },
      axisLabel: { fontSize: 10, color: "rgb(var(--fg-muted))" },
    },
    yAxis: dualAxis
      ? [
          { type: "value", axisLine: { show: false }, splitLine: { lineStyle: { color: "rgba(148,163,184,0.15)" } }, axisLabel: { fontSize: 10, color: "rgb(var(--fg-muted))" } },
          { type: "value", axisLine: { show: false }, splitLine: { show: false }, axisLabel: { fontSize: 10, color: "rgb(var(--fg-muted))", formatter: "{value}%" } },
        ]
      : {
          type: "value",
          axisLine: { show: false },
          splitLine: { lineStyle: { color: "rgba(148,163,184,0.15)" } },
          axisLabel: { fontSize: 10, color: "rgb(var(--fg-muted))" },
        },
    series: series.map((s) => ({
      name: s.name,
      type: s.type ?? "line",
      data: s.data,
      smooth: s.smooth ?? s.type !== "bar",
      symbol: "circle",
      symbolSize: 4,
      stack: s.stack,
      yAxisIndex: s.yAxisIndex ?? 0,
      color: s.color,
      lineStyle: { width: 2 },
      areaStyle: s.type === "bar" || s.stack ? undefined : { opacity: 0.05 },
      barMaxWidth: 18,
      markLine:
        markIndex >= 0
          ? {
              symbol: "none",
              silent: true,
              lineStyle: { color: "rgba(148,163,184,0.8)", type: "dashed" },
              data: [{ xAxis: markIndex, label: { show: false } }],
            }
          : undefined,
    })),
  };

  return <ReactECharts option={option} style={{ height }} notMerge lazyUpdate />;
}
