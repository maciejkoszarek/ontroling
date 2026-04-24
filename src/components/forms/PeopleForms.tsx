import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "../../store";
import { leafPuCodes, puByCode, rollingPeriods } from "../../lib/demoData";
import { uid, currentPeriod, cn } from "../../lib/utils";
import { hoursForPeriod } from "../../lib/workingCalendar";
import type { ClearanceLevel, Employee, JobFunction, Period } from "../../types";
import Modal, { FieldRow } from "../Modal";

type CommonProps = { open: boolean; onClose: () => void };

function puOptions() {
  return leafPuCodes.map((code) => {
    const pu = puByCode.get(code);
    return { code, label: pu ? `${pu.shortName} · ${pu.displayName}` : code };
  });
}

/* -------------------- Add person -------------------- */

export function AddPersonModal({ open, onClose }: CommonProps) {
  const addEmployee = useAppStore((s) => s.addEmployee);
  const grades = useAppStore((s) => s.grades);
  const locations = useAppStore((s) => s.locations);
  const capabilitiesCatalog = useAppStore((s) => s.capabilities);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [localNumber, setLocalNumber] = useState(() => uid("P").toUpperCase().slice(0, 8));
  const [puCode, setPuCode] = useState(leafPuCodes[0] ?? "");
  const [gradeCode, setGradeCode] = useState(grades[1]?.code ?? "B1");
  const [jobFunction, setJobFunction] = useState<JobFunction>("CSS");
  const [locationCode, setLocationCode] = useState(locations[0]?.code ?? "");
  const [startDate, setStartDate] = useState<string>(`${currentPeriod()}-01`);
  const [fteCapacity, setFteCapacity] = useState<number>(1);
  const [engagement, setEngagement] = useState<string>("UoP");
  const [skills, setSkills] = useState<string>("");
  const [capabilities, setCapabilities] = useState<string[]>([]);
  const [germanSpeaker, setGermanSpeaker] = useState<boolean>(false);
  const [clearanceLevel, setClearanceLevel] = useState<ClearanceLevel>("none");

  function toggleCap(id: string) {
    setCapabilities((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  function submit() {
    if (!firstName.trim() || !lastName.trim()) return;
    addEmployee({
      localNumber,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      puCode,
      gradeCode,
      jobFunction,
      locationCode,
      startDate,
      fteCapacity,
      engagement,
      skills: skills
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      capabilities,
      germanSpeaker,
      clearanceLevel,
    });
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add person"
      subtitle="Register a new employee in the practice."
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={!firstName || !lastName}>
            Add person
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <FieldRow label="First name" required>
          <input className="input" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </FieldRow>
        <FieldRow label="Last name" required>
          <input className="input" value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </FieldRow>
        <FieldRow label="Local number" required>
          <input className="input font-mono" value={localNumber} onChange={(e) => setLocalNumber(e.target.value)} />
        </FieldRow>
        <FieldRow label="PU" required>
          <select className="input" value={puCode} onChange={(e) => setPuCode(e.target.value)}>
            {puOptions().map((o) => (
              <option key={o.code} value={o.code}>{o.label}</option>
            ))}
          </select>
        </FieldRow>
        <FieldRow label="Grade">
          <select className="input" value={gradeCode} onChange={(e) => setGradeCode(e.target.value)}>
            {grades.map((g) => (
              <option key={g.code} value={g.code}>{g.code} · {g.family}</option>
            ))}
          </select>
        </FieldRow>
        <FieldRow label="Job function">
          <select className="input" value={jobFunction} onChange={(e) => setJobFunction(e.target.value as JobFunction)}>
            <option value="CSS">CSS</option>
            <option value="EEC">EEC</option>
            <option value="Z">Z</option>
          </select>
        </FieldRow>
        <FieldRow label="Location">
          <select className="input" value={locationCode} onChange={(e) => setLocationCode(e.target.value)}>
            {locations.map((l) => (
              <option key={l.code} value={l.code}>{l.displayName} ({l.code})</option>
            ))}
          </select>
        </FieldRow>
        <FieldRow label="Start date">
          <input type="date" className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </FieldRow>
        <FieldRow label="FTE capacity">
          <input
            type="number"
            step="0.1"
            min={0}
            max={1}
            className="input"
            value={fteCapacity}
            onChange={(e) => setFteCapacity(parseFloat(e.target.value) || 0)}
          />
        </FieldRow>
        <FieldRow label="Engagement" hint="UoP, B2B, Contract, …">
          <input className="input" value={engagement} onChange={(e) => setEngagement(e.target.value)} />
        </FieldRow>
        <div className="col-span-2">
          <FieldRow label="Skills" hint="Free-form, comma-separated">
            <input className="input" value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="React, Node, Java" />
          </FieldRow>
        </div>
        <FieldRow label="German speaker" hint="Relevant for DE / AT / CH market work">
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={germanSpeaker}
              onChange={(e) => setGermanSpeaker(e.target.checked)}
              className="h-4 w-4"
            />
            <span>Speaks German</span>
          </label>
        </FieldRow>
        <FieldRow label="Clearance level" hint="Security certification">
          <select className="input" value={clearanceLevel} onChange={(e) => setClearanceLevel(e.target.value as ClearanceLevel)}>
            <option value="none">None</option>
            <option value="SU1">SU1</option>
            <option value="SU2">SU2</option>
          </select>
        </FieldRow>
        <div className="col-span-2">
          <FieldRow label="Capabilities" hint="Click chips to toggle">
            <div className="flex flex-wrap gap-1 max-h-36 overflow-auto border border-border rounded-md p-2">
              {capabilitiesCatalog.length === 0 && (
                <span className="text-xs text-fg-muted">No capabilities defined yet — add them on the Capabilities page.</span>
              )}
              {capabilitiesCatalog.map((c) => {
                const on = capabilities.includes(c.id);
                return (
                  <button
                    type="button"
                    key={c.id}
                    onClick={() => toggleCap(c.id)}
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
            </div>
          </FieldRow>
        </div>
      </div>
    </Modal>
  );
}

/* -------------------- Add joiner -------------------- */

export function AddJoinerModal({ open, onClose }: CommonProps) {
  const addJoiner = useAppStore((s) => s.addJoiner);
  const grades = useAppStore((s) => s.grades);
  const locations = useAppStore((s) => s.locations);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [employeeLocalNumber, setEmployeeLocalNumber] = useState("");
  const [puCode, setPuCode] = useState(leafPuCodes[0] ?? "");
  const [gradeCode, setGradeCode] = useState(grades[1]?.code ?? "B1");
  const [locationCode, setLocationCode] = useState(locations[0]?.code ?? "");
  const [role, setRole] = useState("Developer");
  const [startDate, setStartDate] = useState<string>(`${currentPeriod()}-15`);
  const [source, setSource] = useState<"ATS" | "HR" | "referral" | "pipeline">("ATS");
  const [status, setStatus] = useState<"planned" | "actual">("planned");

  function submit() {
    if (!firstName.trim() || !lastName.trim()) return;
    addJoiner({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      employeeLocalNumber: employeeLocalNumber.trim() || undefined,
      puCode,
      gradeCode,
      locationCode,
      role,
      startDate,
      source,
      status,
    });
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add joiner"
      subtitle="Planned or actual joiner — becomes an employee when marked actual with a local number."
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={!firstName || !lastName}>
            Add joiner
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <FieldRow label="First name" required>
          <input className="input" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </FieldRow>
        <FieldRow label="Last name" required>
          <input className="input" value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </FieldRow>
        <FieldRow label="Local number" hint="Optional; required to materialise Employee when status is actual">
          <input className="input font-mono" value={employeeLocalNumber} onChange={(e) => setEmployeeLocalNumber(e.target.value)} />
        </FieldRow>
        <FieldRow label="Start date">
          <input type="date" className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </FieldRow>
        <FieldRow label="PU" required>
          <select className="input" value={puCode} onChange={(e) => setPuCode(e.target.value)}>
            {puOptions().map((o) => (
              <option key={o.code} value={o.code}>{o.label}</option>
            ))}
          </select>
        </FieldRow>
        <FieldRow label="Grade">
          <select className="input" value={gradeCode} onChange={(e) => setGradeCode(e.target.value)}>
            {grades.map((g) => (
              <option key={g.code} value={g.code}>{g.code} · {g.family}</option>
            ))}
          </select>
        </FieldRow>
        <FieldRow label="Location">
          <select className="input" value={locationCode} onChange={(e) => setLocationCode(e.target.value)}>
            {locations.map((l) => (
              <option key={l.code} value={l.code}>{l.displayName} ({l.code})</option>
            ))}
          </select>
        </FieldRow>
        <FieldRow label="Role">
          <input className="input" value={role} onChange={(e) => setRole(e.target.value)} />
        </FieldRow>
        <FieldRow label="Source">
          <select className="input" value={source} onChange={(e) => setSource(e.target.value as typeof source)}>
            <option value="ATS">ATS</option>
            <option value="HR">HR</option>
            <option value="referral">referral</option>
            <option value="pipeline">pipeline</option>
          </select>
        </FieldRow>
        <FieldRow label="Status">
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="planned">planned</option>
            <option value="actual">actual</option>
          </select>
        </FieldRow>
      </div>
    </Modal>
  );
}

/* -------------------- Add leaver -------------------- */

export function AddLeaverModal({
  open,
  onClose,
  preselectLocalNumber,
}: CommonProps & { preselectLocalNumber?: string }) {
  const addLeaver = useAppStore((s) => s.addLeaver);
  const employees = useAppStore((s) => s.employees);

  const active = useMemo(() => employees.filter((e) => !e.endDate), [employees]);
  const [localNumber, setLocalNumber] = useState<string>(preselectLocalNumber ?? active[0]?.localNumber ?? "");
  const [endDate, setEndDate] = useState<string>(`${currentPeriod()}-28`);
  const [reason, setReason] = useState<"voluntary" | "involuntary" | "contract_end" | "other">("voluntary");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return active.slice(0, 80);
    return active
      .filter(
        (e) =>
          e.displayName.toLowerCase().includes(q) ||
          e.localNumber.toLowerCase().includes(q),
      )
      .slice(0, 80);
  }, [active, query]);

  function submit() {
    const emp = employees.find((e) => e.localNumber === localNumber);
    if (!emp) return;
    addLeaver({
      employeeLocalNumber: emp.localNumber,
      firstName: emp.firstName,
      lastName: emp.lastName,
      puCode: emp.puCode,
      gradeCode: emp.gradeCode,
      startDate: emp.startDate,
      endDate,
      reason,
      engagement: emp.engagement,
    });
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Mark as leaver"
      subtitle="Records an end date on the employee and adds a Leaver entry."
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={!localNumber}>
            Add leaver
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {!preselectLocalNumber && (
          <FieldRow label="Search employee">
            <input
              className="input"
              placeholder="Name or local number"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </FieldRow>
        )}
        <FieldRow label="Employee" required>
          <select className="input" value={localNumber} onChange={(e) => setLocalNumber(e.target.value)}>
            <option value="">— select —</option>
            {filtered.map((e) => (
              <option key={e.localNumber} value={e.localNumber}>
                {e.displayName} · {e.localNumber} · {e.puCode}
              </option>
            ))}
          </select>
        </FieldRow>
        <div className="grid grid-cols-2 gap-3">
          <FieldRow label="End date" required>
            <input type="date" className="input" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </FieldRow>
          <FieldRow label="Reason">
            <select className="input" value={reason} onChange={(e) => setReason(e.target.value as typeof reason)}>
              <option value="voluntary">voluntary</option>
              <option value="involuntary">involuntary</option>
              <option value="contract_end">contract end</option>
              <option value="other">other</option>
            </select>
          </FieldRow>
        </div>
      </div>
    </Modal>
  );
}

/* -------------------- Transfer -------------------- */

export function TransferModal({
  open,
  onClose,
  preselectLocalNumber,
}: CommonProps & { preselectLocalNumber?: string }) {
  const transferEmployee = useAppStore((s) => s.transferEmployee);
  const employees = useAppStore((s) => s.employees);
  const active = useMemo(() => employees.filter((e) => !e.endDate), [employees]);

  const [localNumber, setLocalNumber] = useState<string>(preselectLocalNumber ?? "");
  const [toPuCode, setToPuCode] = useState<string>(leafPuCodes[0] ?? "");
  const [effectivePeriod, setEffectivePeriod] = useState<Period>(currentPeriod());
  const [reason, setReason] = useState("");
  const [query, setQuery] = useState("");

  const emp = employees.find((e) => e.localNumber === localNumber);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return active.slice(0, 80);
    return active
      .filter((e) => e.displayName.toLowerCase().includes(q) || e.localNumber.toLowerCase().includes(q))
      .slice(0, 80);
  }, [active, query]);

  function submit() {
    if (!localNumber || !toPuCode || !emp || emp.puCode === toPuCode) return;
    transferEmployee({ localNumber, toPuCode, effectivePeriod, reason: reason || undefined });
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Transfer employee"
      subtitle="Move a person between Production Units and keep an auditable trail."
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary"
            onClick={submit}
            disabled={!emp || !toPuCode || emp.puCode === toPuCode}
          >
            Transfer
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {!preselectLocalNumber && (
          <FieldRow label="Search employee">
            <input
              className="input"
              placeholder="Name or local number"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </FieldRow>
        )}
        <FieldRow label="Employee" required>
          <select className="input" value={localNumber} onChange={(e) => setLocalNumber(e.target.value)}>
            <option value="">— select —</option>
            {filtered.map((e) => (
              <option key={e.localNumber} value={e.localNumber}>
                {e.displayName} · {e.localNumber} · {e.puCode}
              </option>
            ))}
          </select>
        </FieldRow>
        <div className="grid grid-cols-2 gap-3">
          <FieldRow label="From PU">
            <input className="input" value={emp?.puCode ?? ""} disabled />
          </FieldRow>
          <FieldRow label="To PU" required>
            <select className="input" value={toPuCode} onChange={(e) => setToPuCode(e.target.value)}>
              {puOptions().map((o) => (
                <option key={o.code} value={o.code}>{o.label}</option>
              ))}
            </select>
          </FieldRow>
        </div>
        <FieldRow label="Effective period" required>
          <select className="input" value={effectivePeriod} onChange={(e) => setEffectivePeriod(e.target.value)}>
            {rollingPeriods.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </FieldRow>
        <FieldRow label="Reason" hint="Optional note for audit">
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
        </FieldRow>
      </div>
    </Modal>
  );
}

/* -------------------- Assign to project -------------------- */

export function AssignProjectModal({
  open,
  onClose,
  preselectLocalNumber,
  preselectProjectNumber,
}: CommonProps & { preselectLocalNumber?: string; preselectProjectNumber?: string }) {
  const assign = useAppStore((s) => s.assignEmployeeToProject);
  const projects = useAppStore((s) => s.projects);
  const employees = useAppStore((s) => s.employees);
  const workingCalendar = useAppStore((s) => s.workingCalendar);
  const active = useMemo(() => employees.filter((e: Employee) => !e.endDate), [employees]);

  const [localNumber, setLocalNumber] = useState(preselectLocalNumber ?? "");
  const [projectNumber, setProjectNumber] = useState(preselectProjectNumber ?? projects[0]?.projectNumber ?? "");
  const [period, setPeriod] = useState<Period>(currentPeriod());
  const [fte, setFte] = useState<number>(1);
  const [query, setQuery] = useState("");

  // Sync preselected values when the modal opens or the preselect changes.
  useEffect(() => {
    if (!open) return;
    if (preselectLocalNumber) setLocalNumber(preselectLocalNumber);
    if (preselectProjectNumber) setProjectNumber(preselectProjectNumber);
    setFte(1);
    setPeriod(currentPeriod());
  }, [open, preselectLocalNumber, preselectProjectNumber]);

  const preselectedEmployee = preselectLocalNumber
    ? employees.find((e) => e.localNumber === preselectLocalNumber)
    : undefined;

  const filteredEmployees = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return active.slice(0, 80);
    return active
      .filter((e) => e.displayName.toLowerCase().includes(q) || e.localNumber.toLowerCase().includes(q))
      .slice(0, 80);
  }, [active, query]);

  const fullHours = hoursForPeriod(workingCalendar, period);
  const hours = Math.round(fte * fullHours);

  function submit() {
    if (!localNumber || !projectNumber || fte <= 0) return;
    assign({ localNumber, projectNumber, period, hours, projectType: "DEL" });
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Assign to project"
      subtitle="Upsert monthly FTE for a person on a project. Drives ARVE and project demand."
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={!localNumber || !projectNumber || fte <= 0}>
            Assign
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <FieldRow label="Employee" required>
          {preselectedEmployee ? (
            <div className="input flex items-center justify-between bg-bg-muted/60">
              <span className="font-medium">{preselectedEmployee.displayName}</span>
              <span className="text-[11px] text-fg-muted font-mono">
                {preselectedEmployee.localNumber} · {preselectedEmployee.puCode}
              </span>
            </div>
          ) : (
            <>
              <input
                className="input mb-1"
                placeholder="Search by name or local number…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <select className="input" value={localNumber} onChange={(e) => setLocalNumber(e.target.value)}>
                <option value="">— select —</option>
                {filteredEmployees.map((e) => (
                  <option key={e.localNumber} value={e.localNumber}>
                    {e.displayName} · {e.localNumber} · {e.puCode}
                  </option>
                ))}
              </select>
            </>
          )}
        </FieldRow>
        <FieldRow label="Project" required>
          <select className="input" value={projectNumber} onChange={(e) => setProjectNumber(e.target.value)}>
            {projects.map((p) => (
              <option key={p.projectNumber} value={p.projectNumber}>
                {p.name} · {p.projectNumber} · {p.customer}
              </option>
            ))}
          </select>
        </FieldRow>
        <div className="grid grid-cols-2 gap-3">
          <FieldRow label="Period" required>
            <select className="input" value={period} onChange={(e) => setPeriod(e.target.value)}>
              {rollingPeriods.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </FieldRow>
          <FieldRow label="FTE" required hint={`= ${hours} h / month (160 h = 1.0 FTE)`}>
            <input
              type="number"
              step="0.1"
              min={0}
              max={1.2}
              className="input"
              value={fte}
              onChange={(e) => setFte(parseFloat(e.target.value) || 0)}
            />
          </FieldRow>
        </div>
      </div>
    </Modal>
  );
}
