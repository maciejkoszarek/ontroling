import { Fragment, useEffect, useRef, useState } from "react";
import { cn, formatNumber, formatPct, periodLabel } from "../lib/utils";
import type { ForecastMetric, Period } from "../types";

export interface MetricRow {
  key: ForecastMetric | string;
  label: string;
  emphasis?: boolean;
  format?: "number" | "int" | "pct";
  editable?: boolean;
  tone?: "default" | "muted" | "highlight";
  group?: string;
  computed?: boolean;
  formulaHint?: string;
  indent?: boolean;
}

export interface GridCellValue {
  value: number;
  isActual: boolean;
  isEdited?: boolean;
  comment?: string;
}

export default function MetricGrid({
  rows,
  periods,
  values,
  onCellChange,
  currentPeriod,
  stickyFirstCol = true,
  density = "comfortable",
  onRightClickCell,
}: {
  rows: MetricRow[];
  periods: Period[];
  values: Record<string, Record<string, GridCellValue>>;
  onCellChange?: (row: MetricRow, period: Period, value: number) => void;
  currentPeriod: Period;
  stickyFirstCol?: boolean;
  density?: "comfortable" | "compact";
  onRightClickCell?: (row: MetricRow, period: Period, value: number) => void;
}) {
  const pad = density === "compact" ? "px-1.5 py-0.5" : "px-2 py-1";
  const minWidth = density === "compact" ? 56 : 68;

  return (
    <div className="w-full overflow-auto border border-border rounded-xl bg-bg-card">
      <table className="w-full border-separate border-spacing-0">
        <thead>
          <tr>
            <th
              className={cn(
                "text-left table-th",
                stickyFirstCol && "sticky left-0 z-20 bg-bg-card",
              )}
              style={{ minWidth: 180 }}
            >
              Metric
            </th>
            {periods.map((p) => (
              <th
                key={p}
                className={cn(
                  "table-th text-right",
                  p <= currentPeriod ? "bg-bg-muted/60" : "bg-bg-card",
                )}
                style={{ minWidth }}
                title={periodLabel(p, "long")}
              >
                <div className="flex flex-col items-end leading-tight">
                  <span className="uppercase">{periodLabel(p, "short").split(" ")[0]}</span>
                  <span className="text-[9px] text-fg-subtle">{p.slice(0, 4)}</span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const prevGroup = i > 0 ? rows[i - 1].group : undefined;
            const showGroup = row.group && row.group !== prevGroup;
            return (
              <Fragment key={row.key}>
                {showGroup && (
                  <tr>
                    <td
                      colSpan={periods.length + 1}
                      className={cn(
                        "table-td text-[10px] uppercase tracking-wider font-semibold text-fg-muted bg-bg-muted/60 border-t border-border",
                        stickyFirstCol && "sticky left-0",
                      )}
                    >
                      {row.group}
                    </td>
                  </tr>
                )}
                <tr className={cn(row.emphasis && "font-medium")}>
                  <td
                    className={cn(
                      "table-td",
                      stickyFirstCol && "sticky left-0 z-10 bg-bg-card",
                      row.tone === "muted" && "text-fg-muted",
                      row.tone === "highlight" && "text-brand font-medium",
                      row.indent && "pl-6",
                    )}
                    title={row.formulaHint}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      {row.label}
                      {row.computed && (
                        <span
                          className="text-[9px] font-mono uppercase px-1 py-0 rounded bg-brand/10 text-brand border border-brand/20"
                          title={row.formulaHint ?? "Computed from primitives"}
                        >
                          fx
                        </span>
                      )}
                    </span>
                  </td>
                  {periods.map((p) => {
                    const cell = values[row.key]?.[p];
                    return (
                      <EditableCell
                        key={p}
                        cell={cell}
                        pad={pad}
                        row={row}
                        period={p}
                        isActual={p <= currentPeriod}
                        onChange={onCellChange && row.editable && !row.computed ? (v) => onCellChange(row, p, v) : undefined}
                        onContextMenu={
                          onRightClickCell && cell
                            ? (e) => {
                                e.preventDefault();
                                onRightClickCell(row, p, cell.value);
                              }
                            : undefined
                        }
                      />
                    );
                  })}
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EditableCell({
  cell,
  pad,
  row,
  period: _period,
  isActual,
  onChange,
  onContextMenu,
}: {
  cell?: GridCellValue;
  pad: string;
  row: MetricRow;
  period: Period;
  isActual: boolean;
  onChange?: (v: number) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const format = row.format ?? "number";
  const display = cell
    ? format === "int"
      ? formatNumber(cell.value, 0)
      : format === "pct"
      ? formatPct(cell.value, 1)
      : formatNumber(cell.value, 1)
    : "—";

  const canEdit = !!onChange && !isActual;

  function commit() {
    const n = Number(draft.replace(/[^\d.-]/g, ""));
    if (!isNaN(n) && onChange) onChange(format === "pct" ? n / 100 : n);
    setEditing(false);
  }

  return (
    <td
      onContextMenu={onContextMenu}
      onDoubleClick={() => {
        if (!canEdit) return;
        setDraft(format === "pct" ? String((cell?.value ?? 0) * 100) : String(cell?.value ?? 0));
        setEditing(true);
      }}
      className={cn(
        "table-td text-right tabular-nums text-xs select-none",
        pad,
        isActual ? "bg-bg-muted/40" : "bg-bg-card",
        cell?.isEdited && "outline-1 outline-brand/30 bg-brand/5",
        canEdit && "cursor-text hover:bg-brand/5",
      )}
      title={cell?.comment ?? (isActual ? "Actual" : "Forecast — double-click to edit")}
    >
      {editing && canEdit ? (
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setEditing(false);
          }}
          className="w-full bg-transparent text-right focus:outline-none tabular-nums"
        />
      ) : (
        <span className={cn(cell?.value === 0 && "text-fg-subtle")}>{display}</span>
      )}
    </td>
  );
}
