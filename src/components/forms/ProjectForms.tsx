import { useEffect, useState } from "react";
import { useAppStore } from "../../store";
import type { Project } from "../../types";
import Modal, { FieldRow } from "../Modal";

type CommonProps = { open: boolean; onClose: () => void };

type ProjectStatus = Project["status"];

const STATUS_OPTIONS: Array<{ value: ProjectStatus; label: string }> = [
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "unknown", label: "Unknown" },
];

function nextProjectNumber(existing: ReadonlyArray<Project>): string {
  const numeric = existing
    .map((p) => Number(p.projectNumber))
    .filter((n) => Number.isFinite(n) && n > 0);
  const max = numeric.length ? Math.max(...numeric) : 80000000;
  return String(max + 1);
}

export function ProjectFormModal({
  open,
  onClose,
  editing,
}: CommonProps & { editing?: Project }) {
  const projects = useAppStore((s) => s.projects);
  const mus = useAppStore((s) => s.marketUnits);
  const addProject = useAppStore((s) => s.addProject);
  const updateProject = useAppStore((s) => s.updateProject);

  const isEdit = !!editing;

  const [projectNumber, setProjectNumber] = useState("");
  const [name, setName] = useState("");
  const [customer, setCustomer] = useState("");
  const [marketUnit, setMarketUnit] = useState("");
  const [isBillable, setIsBillable] = useState(true);
  const [status, setStatus] = useState<ProjectStatus>("active");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setProjectNumber(editing.projectNumber);
      setName(editing.name);
      setCustomer(editing.customer);
      setMarketUnit(editing.marketUnit);
      setIsBillable(editing.isBillable);
      setStatus(editing.status);
      setStartDate(editing.startDate ?? "");
      setEndDate(editing.endDate ?? "");
      setDescription(editing.description ?? "");
    } else {
      setProjectNumber(nextProjectNumber(projects));
      setName("");
      setCustomer("");
      setMarketUnit(mus[0]?.code ?? "");
      setIsBillable(true);
      setStatus("active");
      setStartDate("");
      setEndDate("");
      setDescription("");
    }
  }, [open, editing, projects, mus]);

  const duplicate =
    !isEdit && projects.some((p) => p.projectNumber === projectNumber.trim());

  const canSubmit =
    projectNumber.trim().length > 0 &&
    name.trim().length > 0 &&
    customer.trim().length > 0 &&
    marketUnit.length > 0 &&
    !duplicate;

  function submit() {
    if (!canSubmit) return;
    if (isEdit && editing) {
      updateProject(editing.projectNumber, {
        name,
        customer,
        marketUnit,
        isBillable,
        status,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        description,
      });
    } else {
      addProject({
        projectNumber: projectNumber.trim(),
        name,
        customer,
        marketUnit,
        isBillable,
        status,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        description,
      });
    }
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit project" : "New project"}
      subtitle={
        isEdit
          ? "Update project details, market unit, status, and description."
          : "Register a new project in the practice catalogue."
      }
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={!canSubmit}>
            {isEdit ? "Save changes" : "Create project"}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <FieldRow label="Project number" required hint={duplicate ? "Already in use" : undefined}>
          <input
            className="input font-mono"
            value={projectNumber}
            onChange={(e) => setProjectNumber(e.target.value)}
            disabled={isEdit}
          />
        </FieldRow>
        <FieldRow label="Customer" required>
          <input className="input" value={customer} onChange={(e) => setCustomer(e.target.value)} />
        </FieldRow>
        <div className="col-span-2">
          <FieldRow label="Project name" required>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </FieldRow>
        </div>
        <FieldRow label="Market unit" required>
          <select className="input" value={marketUnit} onChange={(e) => setMarketUnit(e.target.value)}>
            <option value="">— select —</option>
            {mus.map((m) => (
              <option key={m.code} value={m.code}>
                {m.displayName} ({m.code})
              </option>
            ))}
          </select>
        </FieldRow>
        <FieldRow label="Status" required>
          <select
            className="input"
            value={status}
            onChange={(e) => setStatus(e.target.value as ProjectStatus)}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </FieldRow>
        <FieldRow label="Start date">
          <input type="date" className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </FieldRow>
        <FieldRow label="End date" hint="Leave empty for ongoing projects">
          <input type="date" className="input" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </FieldRow>
        <FieldRow label="Billable">
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isBillable}
              onChange={(e) => setIsBillable(e.target.checked)}
              className="h-4 w-4"
            />
            <span>Revenue-bearing engagement</span>
          </label>
        </FieldRow>
        <div className="col-span-2">
          <FieldRow label="Description" hint="What is happening on this project — scope, phase, blockers">
            <textarea
              className="input min-h-[96px] resize-y"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Discovery phase, two-sprint MVP, delivery expected Q3, key risks…"
            />
          </FieldRow>
        </div>
      </div>
    </Modal>
  );
}
