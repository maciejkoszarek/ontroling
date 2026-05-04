import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useAppStore } from "../store";

type Notice = { kind: "error" | "info"; text: string };

function slugifyCode(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export default function AdminOrgHierarchy() {
  const sbus = useAppStore((s) => s.sbus);
  const bus = useAppStore((s) => s.bus);
  const mus = useAppStore((s) => s.marketUnits);

  const addSbu = useAppStore((s) => s.addSbu);
  const updateSbu = useAppStore((s) => s.updateSbu);
  const removeSbu = useAppStore((s) => s.removeSbu);
  const addBu = useAppStore((s) => s.addBu);
  const updateBu = useAppStore((s) => s.updateBu);
  const removeBu = useAppStore((s) => s.removeBu);
  const addMarketUnit = useAppStore((s) => s.addMarketUnit);
  const updateMarketUnit = useAppStore((s) => s.updateMarketUnit);
  const removeMarketUnit = useAppStore((s) => s.removeMarketUnit);

  const [notice, setNotice] = useState<Notice | null>(null);

  const sbuByCode = useMemo(() => new Map(sbus.map((s) => [s.code, s])), [sbus]);
  const buByCode = useMemo(() => new Map(bus.map((b) => [b.code, b])), [bus]);

  const flash = (n: Notice) => {
    setNotice(n);
    window.setTimeout(() => setNotice((cur) => (cur === n ? null : cur)), 4000);
  };

  // ---------- SBU section ----------
  const [newSbuCode, setNewSbuCode] = useState("");
  const [newSbuName, setNewSbuName] = useState("");
  const handleAddSbu = () => {
    const code = slugifyCode(newSbuCode || newSbuName);
    if (!code) {
      flash({ kind: "error", text: "Provide a code or display name." });
      return;
    }
    const err = addSbu({ code, displayName: newSbuName || code, sortOrder: (sbus.length + 1) * 10 });
    if (err) flash({ kind: "error", text: err });
    else {
      setNewSbuCode("");
      setNewSbuName("");
      flash({ kind: "info", text: `SBU "${code}" added.` });
    }
  };

  // ---------- BU section ----------
  const [newBuCode, setNewBuCode] = useState("");
  const [newBuName, setNewBuName] = useState("");
  const [newBuSbu, setNewBuSbu] = useState<string>("");
  const handleAddBu = () => {
    const sbuCode = newBuSbu || sbus[0]?.code;
    if (!sbuCode) {
      flash({ kind: "error", text: "Create an SBU first." });
      return;
    }
    const code = slugifyCode(newBuCode || newBuName);
    if (!code) {
      flash({ kind: "error", text: "Provide a code or display name." });
      return;
    }
    const err = addBu({ code, displayName: newBuName || code, sbuCode, sortOrder: (bus.length + 1) * 10 });
    if (err) flash({ kind: "error", text: err });
    else {
      setNewBuCode("");
      setNewBuName("");
      setNewBuSbu("");
      flash({ kind: "info", text: `BU "${code}" added.` });
    }
  };

  // ---------- MU section ----------
  const [newMuCode, setNewMuCode] = useState("");
  const [newMuName, setNewMuName] = useState("");
  const [newMuBu, setNewMuBu] = useState<string>("");
  const handleAddMu = () => {
    const buCode = newMuBu || bus[0]?.code;
    if (!buCode) {
      flash({ kind: "error", text: "Create a BU first." });
      return;
    }
    const code = slugifyCode(newMuCode || newMuName);
    if (!code) {
      flash({ kind: "error", text: "Provide a code or display name." });
      return;
    }
    const err = addMarketUnit({ code, displayName: newMuName || code, buCode });
    if (err) flash({ kind: "error", text: err });
    else {
      setNewMuCode("");
      setNewMuName("");
      setNewMuBu("");
      flash({ kind: "info", text: `MU "${code}" added.` });
    }
  };

  const handleRemoveSbu = (code: string) => {
    const err = removeSbu(code);
    if (err) flash({ kind: "error", text: err });
  };
  const handleRemoveBu = (code: string) => {
    const err = removeBu(code);
    if (err) flash({ kind: "error", text: err });
  };
  const handleRemoveMu = (code: string) => {
    const err = removeMarketUnit(code);
    if (err) flash({ kind: "error", text: err });
  };

  return (
    <div className="card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Org hierarchy</h2>
          <p className="text-[11px] text-fg-muted">SBU → BU → MU. Codes are locked once created; rename via Display.</p>
        </div>
        {notice && (
          <span className={notice.kind === "error" ? "pill-warning" : "pill-success"}>{notice.text}</span>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* SBU */}
        <section className="border border-border rounded-md p-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-muted mb-2">Sub-Business Units</h3>
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="table-th">Code</th>
                <th className="table-th">Display</th>
                <th className="table-th text-right">BUs</th>
                <th className="table-th"></th>
              </tr>
            </thead>
            <tbody>
              {sbus.map((s) => {
                const childCount = bus.filter((b) => b.sbuCode === s.code).length;
                return (
                  <tr key={s.code}>
                    <td className="table-td font-mono text-[11px]">{s.code}</td>
                    <td className="table-td">
                      <input
                        className="input !py-1"
                        value={s.displayName}
                        onChange={(e) => updateSbu(s.code, { displayName: e.target.value })}
                      />
                    </td>
                    <td className="table-td text-right text-fg-muted tabular-nums">{childCount}</td>
                    <td className="table-td text-right">
                      <button
                        className="btn-ghost text-danger"
                        title={childCount > 0 ? "Has BUs attached" : "Delete"}
                        onClick={() => handleRemoveSbu(s.code)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t border-border">
                <td className="table-td">
                  <input
                    className="input !py-1 font-mono text-[11px]"
                    placeholder="CODE"
                    value={newSbuCode}
                    onChange={(e) => setNewSbuCode(e.target.value)}
                  />
                </td>
                <td className="table-td">
                  <input
                    className="input !py-1"
                    placeholder="Display name"
                    value={newSbuName}
                    onChange={(e) => setNewSbuName(e.target.value)}
                  />
                </td>
                <td className="table-td"></td>
                <td className="table-td text-right">
                  <button className="btn" onClick={handleAddSbu} title="Add SBU">
                    <Plus className="w-3.5 h-3.5" /> Add
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* BU */}
        <section className="border border-border rounded-md p-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-muted mb-2">Business Units</h3>
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="table-th">Code</th>
                <th className="table-th">Display</th>
                <th className="table-th">SBU</th>
                <th className="table-th text-right">MUs</th>
                <th className="table-th"></th>
              </tr>
            </thead>
            <tbody>
              {bus.map((b) => {
                const childCount = mus.filter((m) => m.buCode === b.code).length;
                const sbuMissing = !sbuByCode.has(b.sbuCode);
                return (
                  <tr key={b.code}>
                    <td className="table-td font-mono text-[11px]">{b.code}</td>
                    <td className="table-td">
                      <input
                        className="input !py-1"
                        value={b.displayName}
                        onChange={(e) => updateBu(b.code, { displayName: e.target.value })}
                      />
                    </td>
                    <td className="table-td">
                      <select
                        className={"input !py-1 " + (sbuMissing ? "border-danger" : "")}
                        value={b.sbuCode}
                        onChange={(e) => updateBu(b.code, { sbuCode: e.target.value })}
                      >
                        {sbus.map((s) => (
                          <option key={s.code} value={s.code}>{s.displayName}</option>
                        ))}
                        {sbuMissing && <option value={b.sbuCode}>{b.sbuCode} (missing)</option>}
                      </select>
                    </td>
                    <td className="table-td text-right text-fg-muted tabular-nums">{childCount}</td>
                    <td className="table-td text-right">
                      <button
                        className="btn-ghost text-danger"
                        title={childCount > 0 ? "Has MUs attached" : "Delete"}
                        onClick={() => handleRemoveBu(b.code)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t border-border">
                <td className="table-td">
                  <input
                    className="input !py-1 font-mono text-[11px]"
                    placeholder="CODE"
                    value={newBuCode}
                    onChange={(e) => setNewBuCode(e.target.value)}
                  />
                </td>
                <td className="table-td">
                  <input
                    className="input !py-1"
                    placeholder="Display name"
                    value={newBuName}
                    onChange={(e) => setNewBuName(e.target.value)}
                  />
                </td>
                <td className="table-td">
                  <select
                    className="input !py-1"
                    value={newBuSbu}
                    onChange={(e) => setNewBuSbu(e.target.value)}
                  >
                    <option value="">{sbus[0]?.displayName ?? "— pick SBU —"}</option>
                    {sbus.map((s) => (
                      <option key={s.code} value={s.code}>{s.displayName}</option>
                    ))}
                  </select>
                </td>
                <td className="table-td"></td>
                <td className="table-td text-right">
                  <button className="btn" onClick={handleAddBu} title="Add BU" disabled={sbus.length === 0}>
                    <Plus className="w-3.5 h-3.5" /> Add
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* MU */}
        <section className="border border-border rounded-md p-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-muted mb-2">Market Units</h3>
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="table-th">Code</th>
                <th className="table-th">Display</th>
                <th className="table-th">BU</th>
                <th className="table-th"></th>
              </tr>
            </thead>
            <tbody>
              {mus.map((m) => {
                const buMissing = !buByCode.has(m.buCode);
                return (
                  <tr key={m.code}>
                    <td className="table-td font-mono text-[11px]">{m.code}</td>
                    <td className="table-td">
                      <input
                        className="input !py-1"
                        value={m.displayName}
                        onChange={(e) => updateMarketUnit(m.code, { displayName: e.target.value })}
                      />
                    </td>
                    <td className="table-td">
                      <select
                        className={"input !py-1 " + (buMissing ? "border-danger" : "")}
                        value={m.buCode}
                        onChange={(e) => updateMarketUnit(m.code, { buCode: e.target.value })}
                      >
                        {bus.map((b) => (
                          <option key={b.code} value={b.code}>{b.displayName}</option>
                        ))}
                        {buMissing && <option value={m.buCode}>{m.buCode} (missing)</option>}
                      </select>
                    </td>
                    <td className="table-td text-right">
                      <button
                        className="btn-ghost text-danger"
                        title="Delete (blocked if used by projects)"
                        onClick={() => handleRemoveMu(m.code)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t border-border">
                <td className="table-td">
                  <input
                    className="input !py-1 font-mono text-[11px]"
                    placeholder="CODE"
                    value={newMuCode}
                    onChange={(e) => setNewMuCode(e.target.value)}
                  />
                </td>
                <td className="table-td">
                  <input
                    className="input !py-1"
                    placeholder="Display name"
                    value={newMuName}
                    onChange={(e) => setNewMuName(e.target.value)}
                  />
                </td>
                <td className="table-td">
                  <select
                    className="input !py-1"
                    value={newMuBu}
                    onChange={(e) => setNewMuBu(e.target.value)}
                  >
                    <option value="">{bus[0]?.displayName ?? "— pick BU —"}</option>
                    {bus.map((b) => (
                      <option key={b.code} value={b.code}>{b.displayName}</option>
                    ))}
                  </select>
                </td>
                <td className="table-td text-right">
                  <button className="btn" onClick={handleAddMu} title="Add MU" disabled={bus.length === 0}>
                    <Plus className="w-3.5 h-3.5" /> Add
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
