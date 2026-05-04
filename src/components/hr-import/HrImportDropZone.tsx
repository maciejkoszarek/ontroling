import { useRef } from "react";
import { FileSpreadsheet, Upload } from "lucide-react";

interface Props {
  onFile: (file: File) => void;
  busy?: boolean;
}

/**
 * Reusable drop zone for the HR Database file. Visual mirror of the legacy
 * `Ingestion` page drop zone (brand-colour highlight, FileSpreadsheet icon)
 * but scoped to a single .xlsx/.xlsm pick.
 */
export default function HrImportDropZone({ onFile, busy }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
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
      <div className="text-sm">
        Drop the monthly <b>HR Database</b> file here, or
      </div>
      <button
        className="btn-primary mt-3"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
      >
        <Upload className="w-4 h-4" /> {busy ? "Working…" : "Choose file"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xlsm"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
      />
      <div className="text-[11px] text-fg-muted mt-3">
        Single sheet, ~50 columns, one row per employee. See spec §5.
      </div>
    </div>
  );
}
