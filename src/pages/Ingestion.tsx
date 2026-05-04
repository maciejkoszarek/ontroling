import { useRef, useState } from "react";
import { CheckCircle2, FileSpreadsheet, Upload, AlertTriangle, Download, Users } from "lucide-react";
import { useAppStore } from "../store";
import { parseWorkbook, exportWorkbook } from "../lib/excelParser";
import { parsePeopleWorkbook } from "../lib/peopleImport";
import { downloadBlob } from "../lib/utils";

interface PeopleImportSummary {
  fileName: string;
  period: string | null;
  employeesBefore: number;
  employeesAfter: number;
  gfsHoursBefore: number;
  gfsHoursAfter: number;
  projectsBefore: number;
  projectsAfter: number;
  removedProjectNumbers: string[];
  warnings: string[];
}

export default function Ingestion() {
  const inputRef = useRef<HTMLInputElement>(null);
  const peopleInputRef = useRef<HTMLInputElement>(null);
  const ingest = useAppStore((s) => s.ingest);
  const replacePeople = useAppStore((s) => s.replacePeopleAndPruneProjects);
  const role = useAppStore((s) => s.role);
  const lastIngest = useAppStore((s) => s.lastIngest);
  const resetDemo = useAppStore((s) => s.resetToDemo);
  const [parsing, setParsing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [peopleParsing, setPeopleParsing] = useState(false);
  const [peopleErr, setPeopleErr] = useState<string | null>(null);
  const [peopleSummary, setPeopleSummary] = useState<PeopleImportSummary | null>(null);

  async function onFile(file: File) {
    setParsing(true);
    setErr(null);
    try {
      const report = await parseWorkbook(file);
      ingest({
        ...report.result,
        fileName: report.fileName,
        sheetNames: report.result.sheetNames,
        rowCounts: report.result.rowCounts,
        warnings: report.result.warnings,
      });
    } catch (e) {
      setErr((e as Error).message || "Failed to parse workbook.");
    }
    setParsing(false);
  }

  async function onPeopleFile(file: File) {
    setPeopleParsing(true);
    setPeopleErr(null);
    setPeopleSummary(null);
    try {
      const parsed = await parsePeopleWorkbook(file);
      if (parsed.employees.length === 0) {
        setPeopleErr("No employees found in the workbook — check the file format.");
        setPeopleParsing(false);
        return;
      }
      const result = replacePeople({
        employees: parsed.employees,
        snapshots: parsed.snapshots,
        joiners: parsed.joiners,
        leavers: parsed.leavers,
        fileName: file.name,
        puCodeToPeopleUnit: parsed.puCodeToPeopleUnit,
      });
      setPeopleSummary({
        fileName: file.name,
        period: parsed.period,
        ...result,
        warnings: parsed.warnings,
      });
    } catch (e) {
      setPeopleErr((e as Error).message || "Failed to import people roster.");
    }
    setPeopleParsing(false);
  }

  function onExport() {
    const state = useAppStore.getState();
    const blob = exportWorkbook({
      employees: state.employees,
      snapshots: state.snapshots,
      gfsHours: state.gfsHours,
      joiners: state.joiners,
      leavers: state.leavers,
      contractOfMandate: state.contractOfMandate,
    });
    downloadBlob(blob, `CCA_PracticeView_Export_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Ingestion</h1>
        <p className="text-sm text-fg-muted">Upload the monthly <code>CCA_PracticeView (N).xlsm</code> or any compatible export. Files are parsed locally in your browser.</p>
      </div>

      <div className="card p-6 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
        <div
          className="border-2 border-dashed border-border-strong rounded-xl p-8 text-center hover:bg-bg-hover transition"
          onDragOver={(e) => {
            e.preventDefault();
            e.currentTarget.classList.add("bg-brand/5");
          }}
          onDragLeave={(e) => e.currentTarget.classList.remove("bg-brand/5")}
          onDrop={(e) => {
            e.preventDefault();
            e.currentTarget.classList.remove("bg-brand/5");
            const f = e.dataTransfer.files[0];
            if (f) onFile(f);
          }}
        >
          <FileSpreadsheet className="w-10 h-10 text-brand mx-auto mb-3" />
          <div className="text-sm">Drop a <b>.xlsm</b> or <b>.xlsx</b> file here, or</div>
          <button className="btn-primary mt-3" onClick={() => inputRef.current?.click()} disabled={parsing}>
            <Upload className="w-4 h-4" /> {parsing ? "Parsing…" : "Choose file"}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xlsm"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />
          <div className="text-[11px] text-fg-muted mt-3">
            Expected sheets: HR_DB · GFS_DB · Joiners_DB · Leavers_DB · Contract_of_mandate_DB
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Quick actions</h3>
          <button className="btn w-full" onClick={onExport}>
            <Download className="w-4 h-4" /> Export current data to .xlsx
          </button>
          <button className="btn w-full" onClick={resetDemo}>
            Reset to demo dataset
          </button>
          <div className="text-[11px] text-fg-muted">
            Demo mode uses synthetic data seeded from the CCA workbook structure (~670 employees, 9 PUs, 24 months).
          </div>
        </div>
      </div>

      {err && (
        <div className="card p-4 border-danger/40 text-sm text-danger flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> {err}
        </div>
      )}

      <div className="card p-6 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
        <div className="space-y-2">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Users className="w-4 h-4 text-brand" /> Replace people roster (CCA_People.xlsx)
          </h2>
          <p className="text-[13px] text-fg-muted">
            Wipes the current employees, snapshots, joiners and leavers and rebuilds them from a
            single-sheet CCA_People-style export. Project references are rebuilt by Employee Number:
            <code> gfsHours</code> rows for missing employees are dropped, and any project that
            ends up with zero references is removed.
          </p>
          <div className="flex items-center gap-2 mt-2">
            <button
              className="btn-primary"
              onClick={() => peopleInputRef.current?.click()}
              disabled={peopleParsing || role !== "controller"}
              title={role !== "controller" ? "Controller role required" : undefined}
            >
              <Upload className="w-4 h-4" /> {peopleParsing ? "Importing…" : "Choose people file"}
            </button>
            <input
              ref={peopleInputRef}
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onPeopleFile(e.target.files[0])}
            />
            {role !== "controller" && (
              <span className="text-[11px] text-fg-muted">Switch to Controller role in Admin to enable.</span>
            )}
          </div>
          {peopleErr && (
            <div className="text-sm text-danger flex items-center gap-2 mt-2">
              <AlertTriangle className="w-4 h-4" /> {peopleErr}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <h3 className="text-[12px] uppercase tracking-wider text-fg-muted">Expected columns</h3>
          <ul className="text-[12px] text-fg-muted space-y-0.5">
            <li>Month · Employee Number · First/Last Name</li>
            <li>Production Unit · People Unit · Grade</li>
            <li>Date of employment · Date of termination</li>
            <li>Part time (FTE) · Location · Job type</li>
            <li>Joiner? · Leaver</li>
          </ul>
        </div>
      </div>

      {peopleSummary && (
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="w-5 h-5 text-success" />
            <h3 className="text-sm font-semibold">People roster imported</h3>
            <span className="chip ml-auto">{peopleSummary.fileName}</span>
          </div>
          <dl className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-sm">
            <div>
              <dt className="text-[11px] text-fg-muted uppercase tracking-wider">Period</dt>
              <dd className="font-medium">{peopleSummary.period ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-fg-muted uppercase tracking-wider">Employees</dt>
              <dd className="font-medium tabular-nums">
                {peopleSummary.employeesBefore} → {peopleSummary.employeesAfter}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-fg-muted uppercase tracking-wider">GFS hours rows</dt>
              <dd className="font-medium tabular-nums">
                {peopleSummary.gfsHoursBefore} → {peopleSummary.gfsHoursAfter}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-fg-muted uppercase tracking-wider">Projects</dt>
              <dd className="font-medium tabular-nums">
                {peopleSummary.projectsBefore} → {peopleSummary.projectsAfter}
                {peopleSummary.removedProjectNumbers.length > 0 && (
                  <span className="text-fg-muted">
                    {" "}
                    (−{peopleSummary.removedProjectNumbers.length})
                  </span>
                )}
              </dd>
            </div>
          </dl>
          {peopleSummary.warnings.length > 0 && (
            <ul className="mt-3 space-y-1 text-[13px]">
              {peopleSummary.warnings.map((w, i) => (
                <li key={i} className="flex items-center gap-1.5 text-warning">
                  <AlertTriangle className="w-3.5 h-3.5" /> {w}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {lastIngest && (
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="w-5 h-5 text-success" />
            <h3 className="text-sm font-semibold">Last ingestion</h3>
            <span className="chip ml-auto">{new Date(lastIngest.at).toLocaleString()}</span>
          </div>
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div>
              <dt className="text-[11px] text-fg-muted uppercase tracking-wider">File</dt>
              <dd className="font-medium truncate">{lastIngest.fileName}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-fg-muted uppercase tracking-wider">Sheets detected</dt>
              <dd className="font-medium">{lastIngest.sheetNames.length}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-fg-muted uppercase tracking-wider">Warnings</dt>
              <dd className="font-medium">{lastIngest.warnings.length}</dd>
            </div>
          </dl>
          <div className="mt-3">
            <div className="text-[11px] uppercase text-fg-subtle tracking-wider mb-1">Row counts</div>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(lastIngest.rowCounts).map(([k, v]) => (
                <span key={k} className="chip">
                  <b>{k}:</b>&nbsp;{v}
                </span>
              ))}
            </div>
          </div>
          {lastIngest.warnings.length > 0 && (
            <ul className="mt-3 space-y-1 text-[13px]">
              {lastIngest.warnings.map((w, i) => (
                <li key={i} className="flex items-center gap-1.5 text-warning">
                  <AlertTriangle className="w-3.5 h-3.5" /> {w}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="card p-4">
        <h3 className="text-sm font-semibold mb-2">Supported sources</h3>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="table-th">Source</th>
              <th className="table-th">Format</th>
              <th className="table-th">Frequency</th>
              <th className="table-th">Owner</th>
            </tr>
          </thead>
          <tbody>
            <tr><td className="table-td">HR Report</td><td className="table-td">.xlsx</td><td className="table-td">Monthly · day 3</td><td className="table-td">HR ops</td></tr>
            <tr><td className="table-td">GFS Report</td><td className="table-td">.xlsx</td><td className="table-td">Monthly · day 4</td><td className="table-td">Practice controller</td></tr>
            <tr><td className="table-td">Joiners</td><td className="table-td">.xlsx</td><td className="table-td">Weekly</td><td className="table-td">TA / Recruiting</td></tr>
            <tr><td className="table-td">Leavers</td><td className="table-td">.xlsx</td><td className="table-td">Weekly</td><td className="table-td">HR ops</td></tr>
            <tr><td className="table-td">Contract of mandate (UZ)</td><td className="table-td">.xlsx</td><td className="table-td">Monthly</td><td className="table-td">Legal/HR</td></tr>
            <tr><td className="table-td text-fg-muted">Payroll cost feed</td><td className="table-td">.csv</td><td className="table-td">Monthly</td><td className="table-td">Finance (planned)</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
