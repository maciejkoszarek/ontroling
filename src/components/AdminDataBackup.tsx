import { useRef, useState } from "react";
import { useAppStore } from "../store";
import { downloadBlob } from "../lib/utils";
import {
  buildExportFilename,
  exportStateToJsonBlob,
  exportWorkbookToBlob,
} from "../lib/dataExport";
import {
  readWorkbookFromFile,
  validateWorkbook,
  type ImportReport,
} from "../lib/dataImport";
import { Download, FileSpreadsheet, Database, Upload, AlertTriangle, Check } from "lucide-react";

/**
 * Data & Backup panel.
 *
 * - Export: the full store as Excel workbook, SQLite database, or JSON.
 * - Import: a dry-run pass over an Excel workbook, with a preview report the
 *   user must confirm before anything touches the store.
 */
export default function AdminDataBackup() {
  const getState = useAppStore.getState;
  const applyImportPatch = useAppStore((s) => s.applyImportPatch);
  const role = useAppStore((s) => s.role);

  const [busy, setBusy] = useState<null | "xlsx" | "sqlite" | "json" | "import">(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canImport = role === "controller";

  async function onExportXlsx() {
    setExportError(null);
    setBusy("xlsx");
    try {
      const blob = exportWorkbookToBlob(getState());
      downloadBlob(blob, buildExportFilename("xlsx"));
    } catch (e) {
      setExportError(`Excel export failed: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  async function onExportJson() {
    setExportError(null);
    setBusy("json");
    try {
      const blob = exportStateToJsonBlob(getState());
      downloadBlob(blob, buildExportFilename("json"));
    } catch (e) {
      setExportError(`JSON export failed: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  async function onExportSqlite() {
    setExportError(null);
    setBusy("sqlite");
    try {
      const { exportStateToSqliteBlob } = await import("../lib/sqliteExport");
      const blob = await exportStateToSqliteBlob(getState());
      downloadBlob(blob, buildExportFilename("db"));
    } catch (e) {
      setExportError(`SQLite export failed: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  async function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFile(file);
    setReport(null);
    setBusy("import");
    try {
      const wb = await readWorkbookFromFile(file);
      setReport(validateWorkbook(wb));
    } catch (err) {
      setReport({
        ok: false,
        tables: [],
        errors: [`Failed to read workbook: ${(err as Error).message}`],
        warnings: [],
        patch: {},
        meta: {},
      });
    } finally {
      setBusy(null);
    }
  }

  function onApplyImport() {
    if (!report?.ok || !importFile) return;
    applyImportPatch(report.patch, importFile.name);
    setReport(null);
    setImportFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function onCancelImport() {
    setReport(null);
    setImportFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="card p-4">
      <h2 className="text-sm font-semibold mb-1">Data &amp; backup</h2>
      <p className="text-xs text-fg-muted mb-4">
        Relational escape hatch. Export the full store as Excel, SQLite, or JSON.
        Excel can be edited externally and re-imported — a recovery path when the
        UI fails or data needs manual repair.
      </p>

      <div className="flex flex-wrap gap-2 mb-4">
        <button className="btn-secondary" onClick={onExportXlsx} disabled={busy !== null}>
          <FileSpreadsheet className="w-4 h-4" />
          {busy === "xlsx" ? "Exporting…" : "Export Excel (.xlsx)"}
        </button>
        <button className="btn-secondary" onClick={onExportSqlite} disabled={busy !== null}>
          <Database className="w-4 h-4" />
          {busy === "sqlite" ? "Building…" : "Export SQLite (.db)"}
        </button>
        <button className="btn-secondary" onClick={onExportJson} disabled={busy !== null}>
          <Download className="w-4 h-4" />
          {busy === "json" ? "Exporting…" : "Export JSON"}
        </button>
      </div>

      {exportError && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-4">
          {exportError}
        </div>
      )}

      <div className="border-t border-border pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-muted mb-2">
          Import from Excel
        </h3>
        {!canImport ? (
          <p className="text-xs text-fg-muted">
            Only <strong>controller</strong> can import. Current role: {role}.
          </p>
        ) : (
          <>
            <label className="btn-secondary cursor-pointer inline-flex">
              <Upload className="w-4 h-4" />
              {busy === "import" ? "Reading…" : "Choose .xlsx file"}
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={onFileChosen}
                disabled={busy !== null}
              />
            </label>
            {importFile && (
              <span className="ml-2 text-xs text-fg-muted">{importFile.name}</span>
            )}

            {report && (
              <div className="mt-3 space-y-2">
                {report.errors.length > 0 && (
                  <div className="text-xs bg-red-50 border border-red-200 text-red-700 rounded-md px-3 py-2">
                    <div className="font-semibold flex items-center gap-1 mb-1">
                      <AlertTriangle className="w-3 h-3" /> Errors
                    </div>
                    <ul className="list-disc ml-4">
                      {report.errors.map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {report.warnings.length > 0 && (
                  <div className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-md px-3 py-2">
                    <div className="font-semibold mb-1">Warnings</div>
                    <ul className="list-disc ml-4">
                      {report.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="text-xs border border-border rounded-md overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-bg-muted">
                      <tr>
                        <th className="table-th text-left">Table</th>
                        <th className="table-th text-right">Rows</th>
                        <th className="table-th text-right">Kept</th>
                        <th className="table-th text-right">Skipped</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.tables.map((t) => (
                        <tr key={t.name}>
                          <td className="table-td">{t.name}</td>
                          <td className="table-td text-right tabular-nums">{t.rowCount}</td>
                          <td className="table-td text-right tabular-nums">{t.kept}</td>
                          <td className="table-td text-right tabular-nums">{t.skipped}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    className="btn-primary"
                    onClick={onApplyImport}
                    disabled={!report.ok}
                  >
                    <Check className="w-4 h-4" />
                    Apply import
                  </button>
                  <button className="btn-secondary" onClick={onCancelImport}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
