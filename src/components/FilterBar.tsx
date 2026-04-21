import { X } from "lucide-react";
import { useAppStore } from "../store";
import { puLabel } from "../lib/demoData";

export default function FilterBar() {
  const pus = useAppStore((s) => s.productionUnits);
  const mus = useAppStore((s) => s.marketUnits);
  const locations = useAppStore((s) => s.locations);
  const grades = useAppStore((s) => s.grades);
  const filter = useAppStore((s) => s.filter);
  const setFilter = useAppStore((s) => s.setFilter);

  const activeFilters = Object.entries(filter).filter(([, v]) => !!v);

  return (
    <div className="flex items-center gap-2 px-3 lg:px-4 h-11 border-b border-border bg-bg-card/60 overflow-x-auto">
      <span className="text-[11px] uppercase tracking-wider text-fg-subtle shrink-0">Filters</span>

      <FilterSelect
        label="PU"
        value={filter.pu}
        onChange={(v) => setFilter({ pu: v })}
        options={pus.filter((p) => !p.isVirtual).map((p) => ({ value: p.code, label: puLabel(p.code) }))}
      />
      <FilterSelect
        label="Market Unit"
        value={filter.mu}
        onChange={(v) => setFilter({ mu: v })}
        options={mus.map((m) => ({ value: m.code, label: m.displayName }))}
      />
      <FilterSelect
        label="Location"
        value={filter.location}
        onChange={(v) => setFilter({ location: v })}
        options={locations.map((l) => ({ value: l.code, label: l.displayName }))}
      />
      <FilterSelect
        label="Grade"
        value={filter.grade}
        onChange={(v) => setFilter({ grade: v })}
        options={grades.map((g) => ({ value: g.code, label: g.code }))}
      />
      <FilterSelect
        label="Role"
        value={filter.role}
        onChange={(v) => setFilter({ role: v as "CSS" | "EEC" | "Z" | undefined })}
        options={[
          { value: "CSS", label: "CSS" },
          { value: "EEC", label: "EEC" },
          { value: "Z", label: "Z (UZ)" },
        ]}
      />

      {activeFilters.length > 0 && (
        <button
          className="btn-ghost shrink-0"
          onClick={() =>
            setFilter({ pu: undefined, mu: undefined, location: undefined, grade: undefined, role: undefined })
          }
        >
          <X className="w-3.5 h-3.5" /> Clear
        </button>
      )}

      <div className="flex-1" />
      <span className="text-[11px] text-fg-subtle shrink-0">{activeFilters.length} active</span>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value?: string;
  onChange: (v: string | undefined) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-fg-muted shrink-0">
      <span>{label}</span>
      <select
        className="px-2 py-1 rounded-md border border-border bg-bg-card text-fg text-xs focus:outline-none focus:ring-2 focus:ring-brand/40"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || undefined)}
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
