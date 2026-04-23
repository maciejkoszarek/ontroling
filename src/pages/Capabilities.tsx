import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Pencil, Trash2, Save, X, Search, Tag } from "lucide-react";
import { useAppStore } from "../store";
import { cn } from "../lib/utils";

export default function Capabilities() {
  const capabilities = useAppStore((s) => s.capabilities);
  const employees = useAppStore((s) => s.employees);
  const addCapability = useAppStore((s) => s.addCapability);
  const renameCapability = useAppStore((s) => s.renameCapability);
  const removeCapability = useAppStore((s) => s.removeCapability);
  const setEmployeeCapabilities = useAppStore((s) => s.setEmployeeCapabilities);

  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [q, setQ] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const c of capabilities) if (c.category) set.add(c.category);
    return Array.from(set).sort();
  }, [capabilities]);

  const usageByCap = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of employees) {
      for (const capId of e.capabilities ?? []) {
        map.set(capId, (map.get(capId) ?? 0) + 1);
      }
    }
    return map;
  }, [employees]);

  const filtered = useMemo(() => {
    const qL = q.trim().toLowerCase();
    return capabilities
      .filter((c) => {
        if (categoryFilter && c.category !== categoryFilter) return false;
        if (!qL) return true;
        return c.name.toLowerCase().includes(qL) || (c.category ?? "").toLowerCase().includes(qL);
      })
      .sort((a, b) => {
        const ca = a.category ?? "\uffff";
        const cb = b.category ?? "\uffff";
        if (ca !== cb) return ca.localeCompare(cb);
        return a.name.localeCompare(b.name);
      });
  }, [capabilities, q, categoryFilter]);

  function startEdit(id: string) {
    const c = capabilities.find((x) => x.id === id);
    if (!c) return;
    setEditingId(id);
    setEditName(c.name);
    setEditCategory(c.category ?? "");
  }
  function cancelEdit() {
    setEditingId(null);
    setEditName("");
    setEditCategory("");
  }
  function saveEdit(id: string) {
    if (!editName.trim()) return;
    renameCapability(id, editName, editCategory || undefined);
    cancelEdit();
  }
  function handleRemove(id: string) {
    const used = usageByCap.get(id) ?? 0;
    const name = capabilities.find((c) => c.id === id)?.name ?? "this capability";
    const msg = used > 0
      ? `Remove "${name}"? It's assigned to ${used} ${used === 1 ? "person" : "people"} — they will lose the tag.`
      : `Remove "${name}"?`;
    if (window.confirm(msg)) removeCapability(id);
  }

  function handleAdd() {
    if (!newName.trim()) return;
    addCapability({ name: newName, category: newCategory || undefined });
    setNewName("");
    setNewCategory("");
  }

  function togglePerson(localNumber: string, capId: string) {
    const emp = employees.find((e) => e.localNumber === localNumber);
    if (!emp) return;
    const current = emp.capabilities ?? [];
    const next = current.includes(capId) ? current.filter((x) => x !== capId) : [...current, capId];
    setEmployeeCapabilities(localNumber, next);
  }

  const activeEmployees = useMemo(() => employees.filter((e) => !e.endDate), [employees]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Tag className="w-5 h-5" /> Capabilities
        </h1>
        <p className="text-sm text-fg-muted">
          Define the curated skill taxonomy used to tag people and filter the roster.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_1.6fr] gap-4">
        <section className="card p-4 space-y-3">
          <h2 className="text-sm font-semibold">Define capabilities</h2>

          <div className="flex items-end gap-2 flex-wrap">
            <div className="flex-1 min-w-[160px]">
              <label className="text-[11px] uppercase tracking-wider text-fg-muted">Name</label>
              <input
                className="input mt-1"
                placeholder="e.g. Java"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
              />
            </div>
            <div className="min-w-[140px]">
              <label className="text-[11px] uppercase tracking-wider text-fg-muted">Category (optional)</label>
              <input
                className="input mt-1"
                placeholder="Backend / Cloud / …"
                list="cap-categories"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
              />
              <datalist id="cap-categories">
                {categories.map((c) => <option key={c} value={c} />)}
              </datalist>
            </div>
            <button className="btn-primary" onClick={handleAdd} disabled={!newName.trim()}>
              <Plus className="w-4 h-4" /> Add
            </button>
          </div>

          <div className="flex items-center gap-2 border-t border-border pt-3">
            <Search className="w-4 h-4 text-fg-muted" />
            <input
              className="bg-transparent text-sm focus:outline-none flex-1"
              placeholder="Filter by name…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <select className="input !w-auto" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="">All categories</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="divide-y divide-border max-h-[600px] overflow-auto -mx-4 px-4">
            {filtered.length === 0 && (
              <div className="text-sm text-fg-muted py-6 text-center">No capabilities match.</div>
            )}
            {filtered.map((c) => {
              const used = usageByCap.get(c.id) ?? 0;
              const isEditing = editingId === c.id;
              return (
                <div key={c.id} className="py-2 flex items-center gap-2 group">
                  {isEditing ? (
                    <>
                      <input
                        className="input !w-32"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEdit(c.id);
                          if (e.key === "Escape") cancelEdit();
                        }}
                        autoFocus
                      />
                      <input
                        className="input !w-32"
                        placeholder="Category"
                        value={editCategory}
                        onChange={(e) => setEditCategory(e.target.value)}
                        list="cap-categories"
                      />
                      <button className="btn-primary !px-2 !py-1" onClick={() => saveEdit(c.id)}>
                        <Save className="w-3.5 h-3.5" />
                      </button>
                      <button className="btn !px-2 !py-1" onClick={cancelEdit}>
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{c.name}</div>
                        <div className="text-[11px] text-fg-muted truncate">
                          {c.category ?? "Uncategorised"} · {used} {used === 1 ? "person" : "people"}
                        </div>
                      </div>
                      <button
                        className="btn !px-2 !py-1 opacity-40 group-hover:opacity-100 transition-opacity"
                        title="Rename"
                        onClick={() => startEdit(c.id)}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        className="btn !px-2 !py-1 text-danger opacity-40 group-hover:opacity-100 transition-opacity"
                        title="Delete"
                        onClick={() => handleRemove(c.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section className="card p-4 space-y-3">
          <h2 className="text-sm font-semibold">Assign capabilities to people</h2>
          <p className="text-xs text-fg-muted">
            Click chips to toggle. Active people only — use the People page for bulk edits on a single person.
          </p>

          <AssignMatrix
            capabilities={filtered}
            employees={activeEmployees}
            onToggle={togglePerson}
          />
        </section>
      </div>
    </div>
  );
}

function AssignMatrix({
  capabilities,
  employees,
  onToggle,
}: {
  capabilities: Array<{ id: string; name: string; category?: string }>;
  employees: Array<{ localNumber: string; displayName: string; puCode: string; capabilities?: string[] }>;
  onToggle: (localNumber: string, capId: string) => void;
}) {
  const [q, setQ] = useState("");
  const qL = q.trim().toLowerCase();
  const filtered = employees
    .filter((e) => !qL || e.displayName.toLowerCase().includes(qL) || e.localNumber.toLowerCase().includes(qL))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 border border-border rounded-md px-2 py-1">
        <Search className="w-4 h-4 text-fg-muted" />
        <input
          className="bg-transparent text-sm focus:outline-none flex-1"
          placeholder="Search people by name or ID…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className="max-h-[600px] overflow-auto divide-y divide-border">
        {filtered.slice(0, 200).map((e) => {
          const active = new Set(e.capabilities ?? []);
          return (
            <div key={e.localNumber} className="py-2">
              <div className="flex items-center justify-between gap-2 mb-1">
                <Link to={`/people/${e.localNumber}`} className="text-sm font-medium hover:text-brand">
                  {e.displayName}
                </Link>
                <span className="text-[11px] text-fg-muted font-mono">{e.localNumber}</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {capabilities.map((c) => {
                  const on = active.has(c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() => onToggle(e.localNumber, c.id)}
                      className={cn(
                        "chip !text-[11px] cursor-pointer transition-colors",
                        on ? "bg-brand/15 text-brand border-brand/30" : "opacity-70 hover:opacity-100",
                      )}
                      title={c.category}
                    >
                      {c.name}
                    </button>
                  );
                })}
                {capabilities.length === 0 && <span className="text-xs text-fg-muted">No capabilities defined yet.</span>}
              </div>
            </div>
          );
        })}
        {filtered.length > 200 && (
          <div className="py-2 text-xs text-fg-muted text-center">
            Showing first 200 of {filtered.length} — narrow your search to see more.
          </div>
        )}
        {filtered.length === 0 && (
          <div className="py-6 text-sm text-fg-muted text-center">No people match.</div>
        )}
      </div>
    </div>
  );
}
