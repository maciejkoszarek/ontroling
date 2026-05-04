import { useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { useAppStore } from "../../store";
import type { HrMappingEntry, ProductionUnit } from "../../types";

type Kind = "production_unit" | "people_unit";

const SECTION_TITLES: Record<Kind, string> = {
  production_unit: "Production Unit",
  people_unit: "People Unit",
};

const UNMAPPED_WARNING_CODE: Record<Kind, "R01" | "R07"> = {
  production_unit: "R01",
  people_unit: "R07",
};

export default function HrMappingEditor() {
  const role = useAppStore((s) => s.role);
  const hrMappings = useAppStore((s) => s.hrMappings);
  const productionUnits = useAppStore((s) => s.productionUnits);
  const hrImports = useAppStore((s) => s.hrImports);
  const lastHrImport = useAppStore((s) => s.lastHrImport);

  const canEdit = role === "controller";

  const targetOptions = useMemo(
    () =>
      productionUnits
        .filter((p) => p.active && !p.isVirtual)
        .slice()
        .sort((a, b) => a.code.localeCompare(b.code)),
    [productionUnits],
  );

  return (
    <div className="space-y-4">
      <MappingSection
        kind="production_unit"
        canEdit={canEdit}
        mappings={hrMappings}
        targetOptions={targetOptions}
        hrImports={hrImports}
        lastImportId={lastHrImport?.id}
      />
      <MappingSection
        kind="people_unit"
        canEdit={canEdit}
        mappings={hrMappings}
        targetOptions={targetOptions}
        hrImports={hrImports}
        lastImportId={lastHrImport?.id}
      />
      {!canEdit && (
        <p className="text-[11px] text-fg-muted">
          Read-only view. Only <strong>controller</strong> can add, edit, or remove HR mappings.
        </p>
      )}
    </div>
  );
}

interface SectionProps {
  kind: Kind;
  canEdit: boolean;
  mappings: HrMappingEntry[];
  targetOptions: ProductionUnit[];
  hrImports: ReturnType<typeof useAppStore.getState>["hrImports"];
  lastImportId: string | undefined;
}

function MappingSection({
  kind,
  canEdit,
  mappings,
  targetOptions,
  hrImports,
  lastImportId,
}: SectionProps) {
  const addHrMapping = useAppStore((s) => s.addHrMapping);
  const updateHrMapping = useAppStore((s) => s.updateHrMapping);
  const removeHrMapping = useAppStore((s) => s.removeHrMapping);

  const rows = useMemo(
    () =>
      mappings
        .filter((m) => m.kind === kind && m.active)
        .slice()
        .sort((a, b) => a.source.localeCompare(b.source)),
    [mappings, kind],
  );

  const targetByCode = useMemo(() => {
    const map = new Map<string, ProductionUnit>();
    for (const pu of targetOptions) map.set(pu.code, pu);
    return map;
  }, [targetOptions]);

  const unmappedValues = useMemo(() => {
    if (!lastImportId) return [] as string[];
    const imp = hrImports.find((i) => i.id === lastImportId);
    if (!imp) return [];
    const code = UNMAPPED_WARNING_CODE[kind];
    const seen = new Set<string>();
    for (const w of imp.warnings) {
      if (w.code !== code) continue;
      const m = /"([^"]+)"/.exec(w.message);
      const value = m ? m[1] : w.message;
      if (value) seen.add(value);
    }
    return Array.from(seen);
  }, [hrImports, lastImportId, kind]);

  const [addSource, setAddSource] = useState("");
  const [addTarget, setAddTarget] = useState<string>(targetOptions[0]?.code ?? "");
  const [addNote, setAddNote] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<string>("");
  const [editNote, setEditNote] = useState<string>("");
  const [editError, setEditError] = useState<string | null>(null);

  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);

  const isDuplicateSource = (source: string, ignoreId?: string) => {
    const needle = source.trim().toLowerCase();
    if (!needle) return false;
    return mappings.some(
      (m) =>
        m.id !== ignoreId &&
        m.active &&
        m.kind === kind &&
        m.source.trim().toLowerCase() === needle,
    );
  };

  const onSubmitAdd = () => {
    setAddError(null);
    const trimmed = addSource.trim();
    if (!trimmed) {
      setAddError("Source value is required.");
      return;
    }
    if (!targetByCode.has(addTarget)) {
      setAddError("Pick a target production unit.");
      return;
    }
    if (isDuplicateSource(trimmed)) {
      setAddError(`A mapping for "${trimmed}" already exists.`);
      return;
    }
    addHrMapping({
      kind,
      source: trimmed,
      targetCode: addTarget,
      note: addNote.trim() || undefined,
    });
    setAddSource("");
    setAddNote("");
  };

  const startEdit = (row: HrMappingEntry) => {
    setEditingId(row.id);
    setEditTarget(row.targetCode);
    setEditNote(row.note ?? "");
    setEditError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditError(null);
  };

  const saveEdit = (row: HrMappingEntry) => {
    setEditError(null);
    if (!targetByCode.has(editTarget)) {
      setEditError("Pick a target production unit.");
      return;
    }
    updateHrMapping(row.id, {
      targetCode: editTarget,
      note: editNote.trim() || undefined,
    });
    setEditingId(null);
  };

  const onDelete = (row: HrMappingEntry) => {
    const ok = window.confirm(
      `Delete mapping "${row.source}" → ${row.targetCode}?\nHeuristic resolution will resume for this source.`,
    );
    if (!ok) return;
    removeHrMapping(row.id);
  };

  const prefillFromUnmapped = (value: string) => {
    setAddSource(value);
    setAddError(null);
  };

  const formInvalid =
    !addSource.trim() ||
    !targetByCode.has(addTarget) ||
    isDuplicateSource(addSource.trim());

  return (
    <div className="card p-4">
      <h3 className="text-sm font-semibold mb-3">HR Mapping — {SECTION_TITLES[kind]}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="table-th">Source value (HR)</th>
              <th className="table-th">Mapped to (App)</th>
              <th className="table-th">Note</th>
              {canEdit && <th className="table-th text-right w-24"></th>}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td className="table-td text-fg-muted" colSpan={canEdit ? 4 : 3}>
                  No mappings yet.
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const isEditing = editingId === row.id;
              const target = targetByCode.get(row.targetCode);
              const targetLabel = target
                ? `${target.code} — ${target.shortName}`
                : row.targetCode;
              const noteExpanded = expandedNoteId === row.id;
              return (
                <tr key={row.id} className="hover:bg-bg-hover">
                  <td className="table-td font-mono text-[12px]">{row.source}</td>
                  <td className="table-td">
                    {isEditing ? (
                      <select
                        className="input !w-auto"
                        value={editTarget}
                        onChange={(e) => setEditTarget(e.target.value)}
                        aria-label="Edit target production unit"
                      >
                        {targetOptions.map((pu) => (
                          <option key={pu.code} value={pu.code}>
                            {pu.code} — {pu.shortName}
                          </option>
                        ))}
                      </select>
                    ) : (
                      targetLabel
                    )}
                  </td>
                  <td className="table-td text-fg-muted">
                    {isEditing ? (
                      <input
                        className="input"
                        value={editNote}
                        onChange={(e) => setEditNote(e.target.value)}
                        placeholder="Optional note"
                        aria-label="Edit mapping note"
                      />
                    ) : row.note ? (
                      <button
                        type="button"
                        className="text-left max-w-[18rem] truncate hover:underline"
                        onClick={() =>
                          setExpandedNoteId(noteExpanded ? null : row.id)
                        }
                        title={row.note}
                      >
                        {noteExpanded ? row.note : row.note}
                      </button>
                    ) : (
                      <span className="text-[11px]">—</span>
                    )}
                    {isEditing && editError && (
                      <div className="text-[11px] text-danger mt-1">{editError}</div>
                    )}
                  </td>
                  {canEdit && (
                    <td className="table-td text-right">
                      {isEditing ? (
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            className="btn-ghost"
                            onClick={() => saveEdit(row)}
                            aria-label="Save mapping"
                            title="Save"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            className="btn-ghost"
                            onClick={cancelEdit}
                            aria-label="Cancel edit"
                            title="Cancel"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            className="btn-ghost"
                            onClick={() => startEdit(row)}
                            aria-label={`Edit mapping for ${row.source}`}
                            title="Edit"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            className="btn-ghost"
                            onClick={() => onDelete(row)}
                            aria-label={`Delete mapping for ${row.source}`}
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <div className="mt-3 border-t border-border pt-3">
          <div className="text-[11px] uppercase tracking-wider text-fg-muted mb-2">
            Add mapping
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[14rem]">
              <label className="text-[11px] text-fg-muted">Source value (HR)</label>
              <input
                className="input mt-1"
                value={addSource}
                onChange={(e) => {
                  setAddSource(e.target.value);
                  if (addError) setAddError(null);
                }}
                placeholder={
                  kind === "production_unit"
                    ? "e.g. CCA Software Engineers 2"
                    : "e.g. CCA SE 2 (Wrocław)"
                }
                aria-label={`Add ${SECTION_TITLES[kind]} source value`}
              />
            </div>
            <div className="min-w-[12rem]">
              <label className="text-[11px] text-fg-muted">Mapped to (App)</label>
              <select
                className="input mt-1"
                value={addTarget}
                onChange={(e) => setAddTarget(e.target.value)}
                aria-label={`Add ${SECTION_TITLES[kind]} target`}
              >
                {targetOptions.map((pu) => (
                  <option key={pu.code} value={pu.code}>
                    {pu.code} — {pu.shortName}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1 min-w-[12rem]">
              <label className="text-[11px] text-fg-muted">Note</label>
              <input
                className="input mt-1"
                value={addNote}
                onChange={(e) => setAddNote(e.target.value)}
                placeholder="Why this mapping exists"
                aria-label={`Add ${SECTION_TITLES[kind]} note`}
              />
            </div>
            <button
              className="btn-primary"
              onClick={onSubmitAdd}
              disabled={formInvalid}
              aria-label={`Save ${SECTION_TITLES[kind]} mapping`}
            >
              <Plus className="w-4 h-4" /> Save
            </button>
          </div>
          {addError && (
            <div className="text-[11px] text-danger mt-2" role="alert">
              {addError}
            </div>
          )}
        </div>
      )}

      <div className="mt-4 border-t border-border pt-3">
        <div className="text-[11px] uppercase tracking-wider text-fg-muted mb-2">
          Unmapped values seen in last import
        </div>
        {unmappedValues.length === 0 ? (
          <p className="text-[11px] text-fg-muted">
            No unmapped values yet — appears here after the next HR import.
          </p>
        ) : (
          <ul className="space-y-1">
            {unmappedValues.map((value) => (
              <li key={value} className="flex items-center gap-2 text-sm">
                <span className="font-mono text-[12px]">&ldquo;{value}&rdquo;</span>
                {canEdit && (
                  <button
                    className="btn-ghost text-[11px]"
                    onClick={() => prefillFromUnmapped(value)}
                  >
                    Map…
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
