import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import ReactECharts from "echarts-for-react";
import { cn, formatDelta, formatNumber } from "../lib/utils";

export interface KpiCardProps {
  label: string;
  value: number | null;
  fractionDigits?: number;
  unit?: string;
  delta?: number | null;
  deltaLabel?: string;
  series?: number[];
  tone?: "default" | "success" | "warning" | "danger";
  onClick?: () => void;
  invertDelta?: boolean;
}

export default function KpiCard({
  label,
  value,
  fractionDigits = 1,
  unit,
  delta,
  deltaLabel,
  series,
  tone = "default",
  onClick,
  invertDelta = false,
}: KpiCardProps) {
  const deltaTone =
    delta == null || delta === 0
      ? "neutral"
      : (invertDelta ? -delta : delta) > 0
      ? "positive"
      : "negative";

  const toneMap: Record<string, string> = {
    default: "border-border",
    success: "border-success/40",
    warning: "border-warning/40",
    danger: "border-danger/40",
  };

  return (
    <button
      className={cn("card text-left p-4 hover:shadow-soft transition-all border", toneMap[tone])}
      onClick={onClick}
      type="button"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs font-medium text-fg-muted uppercase tracking-wider">{label}</div>
        {delta !== undefined && delta !== null && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-[11px] px-1.5 py-0.5 rounded-full font-medium",
              deltaTone === "positive" && "bg-success/10 text-success",
              deltaTone === "negative" && "bg-danger/10 text-danger",
              deltaTone === "neutral" && "bg-fg-subtle/10 text-fg-muted",
            )}
          >
            {deltaTone === "positive" ? (
              <ArrowUpRight className="w-3 h-3" />
            ) : deltaTone === "negative" ? (
              <ArrowDownRight className="w-3 h-3" />
            ) : (
              <Minus className="w-3 h-3" />
            )}
            {formatDelta(delta, fractionDigits)}
          </span>
        )}
      </div>
      <div className="mt-1.5 flex items-baseline gap-1">
        <span className="text-2xl font-semibold tracking-tight">{formatNumber(value, fractionDigits)}</span>
        {unit && <span className="text-xs text-fg-muted">{unit}</span>}
      </div>
      {deltaLabel && <div className="text-[11px] text-fg-subtle mt-0.5">{deltaLabel}</div>}
      {series && series.length > 1 && (
        <div className="mt-2 -mx-1 h-10">
          <ReactECharts
            style={{ height: 40, width: "100%" }}
            option={{
              grid: { top: 0, bottom: 0, left: 0, right: 0 },
              xAxis: { type: "category", show: false, data: series.map((_, i) => i) },
              yAxis: { type: "value", show: false, scale: true },
              tooltip: { show: false },
              series: [
                {
                  type: "line",
                  data: series,
                  smooth: true,
                  symbol: "none",
                  lineStyle: { width: 2 },
                  areaStyle: { opacity: 0.12 },
                  color: tone === "danger" ? "#dc2626" : tone === "warning" ? "#d97706" : tone === "success" ? "#16a34a" : "#2563eb",
                },
              ],
            }}
            notMerge
            lazyUpdate
          />
        </div>
      )}
    </button>
  );
}
