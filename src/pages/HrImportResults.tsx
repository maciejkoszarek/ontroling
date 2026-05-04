import { Link, useParams } from "react-router-dom";
import { ArrowLeft, AlertTriangle, Download } from "lucide-react";
import { useAppStore } from "../store";
import HrImportResultsPanel from "../components/hr-import/HrImportResultsPanel";

export default function HrImportResults() {
  const { importId = "" } = useParams<{ importId: string }>();
  const hrImports = useAppStore((s) => s.hrImports);
  const employees = useAppStore((s) => s.employees);
  const joiners = useAppStore((s) => s.joiners);
  const leavers = useAppStore((s) => s.leavers);

  const hrImport = hrImports.find((i) => i.id === importId);

  if (!hrImport) {
    return (
      <div className="card p-6 text-sm">
        <h1 className="text-xl font-semibold mb-2">Import not found</h1>
        <p>No HR import with id {importId} was found.</p>
        <Link to="/admin" className="text-brand underline mt-3 inline-block">
          Back to Admin
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link to="/admin" className="btn-ghost text-sm" aria-label="Back to Admin">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <h1 className="text-xl font-semibold">HR Import — Results</h1>
      </div>

      <div className="card p-4">
        <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
          <Field label="File">{hrImport.fileName}</Field>
          <Field label="Month">{hrImport.fileMonth}</Field>
          <Field label="Imported by">{hrImport.importedBy}</Field>
          <Field label="At">{new Date(hrImport.importedAt).toLocaleString()}</Field>
          <Field label="Duration">{(hrImport.durationMs / 1000).toFixed(1)}s</Field>
          {hrImport.reportGeneratedAt && (
            <Field label="Report generated at">{hrImport.reportGeneratedAt}</Field>
          )}
        </dl>
        {hrImport.stalenessOverrideReason && (
          <div className="mt-3 border border-warning/40 rounded-md p-2 text-sm flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-warning mt-0.5" />
            <div>
              <strong>Staleness override:</strong> {hrImport.stalenessOverrideReason}
            </div>
          </div>
        )}
        <div className="mt-3 flex gap-2">
          <button
            className="btn"
            disabled
            title="Coming soon"
            aria-label="Download as Excel (coming soon)"
          >
            <Download className="w-4 h-4" /> Download as Excel
          </button>
        </div>
      </div>

      <HrImportResultsPanel
        hrImport={hrImport}
        employees={employees}
        joiners={joiners}
        leavers={leavers}
      />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] text-fg-muted uppercase tracking-wider">{label}</dt>
      <dd className="font-medium truncate">{children}</dd>
    </div>
  );
}
