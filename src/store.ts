import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  Anomaly,
  AppFilter,
  AuditEntry,
  BudgetCell,
  Capability,
  ClearanceLevel,
  Comment,
  ContractOfMandate,
  DQCheckResult,
  Employee,
  EmployeeMonthSnapshot,
  ForecastCell,
  ForecastCycle,
  ForecastMetric,
  GfsHours,
  Grade,
  Joiner,
  Leaver,
  Location,
  MarketUnit,
  Period,
  PipelineOpportunity,
  ProductionUnit,
  Project,
  ProjectDemandForecast,
  Role,
  Scenario,
  Transfer,
  WorkingCalendarEntry,
} from "./types";
import * as demo from "./lib/demoData";
import { checkArithmeticIdentities, validateForecastCell } from "./lib/forecast";
import { DEFAULT_COMMIT_PROBABILITY } from "./lib/projectHelpers";
import { clamp, uid } from "./lib/utils";
import { defaultEntryForPeriod, seedWorkingCalendar } from "./lib/workingCalendar";

export interface AppState {
  // ----- reference
  productionUnits: ProductionUnit[];
  marketUnits: MarketUnit[];
  locations: Location[];
  grades: Grade[];
  projects: Project[];
  capabilities: Capability[];

  // ----- facts
  employees: Employee[];
  snapshots: EmployeeMonthSnapshot[];
  gfsHours: GfsHours[];
  joiners: Joiner[];
  leavers: Leaver[];
  contractOfMandate: ContractOfMandate[];
  transfers: Transfer[];

  // ----- forecast & planning
  cycles: ForecastCycle[];
  activeCycleId: string;
  previousCycleId: string;
  forecastCells: ForecastCell[];
  /** Frozen snapshots of forecast cells keyed by cycleId. Populated on `lockCycle`. */
  lockedSnapshots: Record<string, ForecastCell[]>;
  budget: BudgetCell[];
  pipeline: PipelineOpportunity[];
  projectDemand: ProjectDemandForecast[];
  scenarios: Scenario[];

  // ----- cross-cutting
  comments: Comment[];
  audit: AuditEntry[];
  anomalies: Anomaly[];
  dqChecks: DQCheckResult[];

  // ----- configuration
  workingCalendar: WorkingCalendarEntry[];

  // ----- UI state
  role: Role;
  user: { name: string; email: string; puCode?: string };
  filter: AppFilter;
  theme: "light" | "dark";
  density: "comfortable" | "compact";
  // ephemeral: ingestion feedback
  lastIngest?: { fileName: string; sheetNames: string[]; rowCounts: Record<string, number>; warnings: string[]; at: string };

  // ----- actions
  setActiveCycle: (id: string) => void;
  setFilter: (f: Partial<AppFilter>) => void;
  setRole: (r: Role) => void;
  setTheme: (t: "light" | "dark") => void;
  setDensity: (d: "comfortable" | "compact") => void;

  setForecastValue: (args: {
    cycleId: string;
    puCode: string;
    period: Period;
    metric: ForecastMetric;
    value: number;
    comment?: string;
  }) => void;

  setForecastValuesBulk: (args: {
    cycleId: string;
    puCode: string;
    values: Array<{ period: Period; metric: ForecastMetric; value: number }>;
    source?: "manual" | "auto_baseline" | "scenario_promote";
  }) => void;

  addComment: (c: Omit<Comment, "id" | "createdAt" | "author">) => void;
  resolveComment: (id: string) => void;

  addEmployee: (e: Omit<Employee, "displayName"> & { displayName?: string }) => void;
  addJoiner: (j: Omit<Joiner, "id">) => void;
  addLeaver: (l: Omit<Leaver, "id">) => void;
  transferEmployee: (args: {
    localNumber: string;
    toPuCode: string;
    effectivePeriod: Period;
    reason?: string;
  }) => void;
  assignEmployeeToProject: (args: {
    localNumber: string;
    projectNumber: string;
    period: Period;
    hours: number;
    projectType?: string;
  }) => void;
  unassignEmployeeFromProject: (args: {
    localNumber: string;
    projectNumber: string;
    period: Period;
  }) => void;

  addProject: (p: Omit<Project, "tags"> & { tags?: string[] }) => void;
  updateProject: (projectNumber: string, patch: Partial<Omit<Project, "projectNumber">>) => void;

  setWorkingCalendarEntry: (period: Period, patch: Partial<Omit<WorkingCalendarEntry, "period">>) => void;
  resetWorkingCalendar: (fromYear?: number, toYear?: number) => void;

  addCapability: (args: { name: string; category?: string }) => void;
  renameCapability: (id: string, name: string, category?: string) => void;
  removeCapability: (id: string) => void;
  setEmployeeCapabilities: (localNumber: string, capabilityIds: string[]) => void;
  setEmployeeGermanSpeaker: (localNumber: string, v: boolean) => void;
  setEmployeeClearanceLevel: (localNumber: string, v: ClearanceLevel) => void;

  openCycle: (label: string, periodOpened: Period) => boolean;
  /** Move cycle into `editing` — controllers and PU leads can write forecast values. */
  startEditing: (id: string) => void;
  /** Move cycle into `reconciling` — writes are blocked but DQ / commentary continues. */
  startReconciling: (id: string) => void;
  /** Lock the cycle. Snapshots forecast cells. Only `controller` role allowed. */
  lockCycle: (id: string) => void;
  /** Archive a locked cycle. */
  archiveCycle: (id: string) => void;
  /**
   * Pure helper: is this cycle editable by the current role for this PU? PU scope
   * is enforced for `pu_lead` — they can only write cells for their own PU.
   */
  canEditCycle: (id: string, puCode: string) => boolean;

  runDqChecks: () => void;
  waiveDqCheck: (id: string, comment: string) => void;

  promoteScenario: (id: string) => void;
  addScenario: (s: Omit<Scenario, "id" | "createdAt">) => void;

  ingest: (payload: {
    employees: Employee[];
    snapshots: EmployeeMonthSnapshot[];
    gfsHours: GfsHours[];
    joiners: Joiner[];
    leavers: Leaver[];
    contractOfMandate: ContractOfMandate[];
    fileName: string;
    sheetNames: string[];
    rowCounts: Record<string, number>;
    warnings: string[];
  }) => void;

  /**
   * Replaces the people roster from a CCA_People-style import. Rebuilds
   * project references by employee id: gfsHours rows whose employee is no
   * longer present are dropped, and any project that ends up with zero
   * gfsHours rows AND zero projectDemand rows is removed. Controller-only.
   */
  replacePeopleAndPruneProjects: (payload: {
    employees: Employee[];
    snapshots: EmployeeMonthSnapshot[];
    joiners: Joiner[];
    leavers: Leaver[];
    fileName: string;
    /** Optional hints from the parser: puCode → People Unit display name. */
    puCodeToPeopleUnit?: Record<string, string>;
  }) => {
    employeesBefore: number;
    employeesAfter: number;
    gfsHoursBefore: number;
    gfsHoursAfter: number;
    projectsBefore: number;
    projectsAfter: number;
    removedProjectNumbers: string[];
  };

  resetToDemo: () => void;
  /**
   * Applies an import patch (subset of AppState slices) after the user
   * confirmed a dry-run. Only the provided slices are replaced; the rest is
   * untouched. Appends a single audit entry.
   */
  applyImportPatch: (patch: Partial<AppState>, source: string) => void;
}

/**
 * localStorage wrapper that, on QuotaExceededError, trims the persisted
 * `audit[]` to the most recent 200 entries and retries once. Audit is the only
 * unbounded slice — `.slice(0, 2000)` in-memory still dwarfs the 5MB quota
 * when combined with demo forecast cells. If the retry still fails, we log
 * and give up silently rather than crash the app.
 */
const AUDIT_TRIM_LIMIT = 200;
function quotaSafeStorage(): Storage {
  if (typeof localStorage === "undefined") {
    return {
      length: 0,
      clear: () => {},
      getItem: () => null,
      key: () => null,
      removeItem: () => {},
      setItem: () => {},
    };
  }
  const base = localStorage;
  return {
    get length() {
      return base.length;
    },
    clear: () => base.clear(),
    getItem: (k) => base.getItem(k),
    key: (i) => base.key(i),
    removeItem: (k) => base.removeItem(k),
    setItem: (k, v) => {
      try {
        base.setItem(k, v);
      } catch (err) {
        console.warn("[store] localStorage quota exceeded; trimming audit log and retrying", err);
        try {
          const parsed = JSON.parse(v) as { state?: { audit?: unknown[] } };
          if (parsed?.state?.audit && Array.isArray(parsed.state.audit)) {
            parsed.state.audit = parsed.state.audit.slice(0, AUDIT_TRIM_LIMIT);
            base.setItem(k, JSON.stringify(parsed));
            return;
          }
        } catch (retryErr) {
          console.warn("[store] trim + retry failed; persistence skipped this cycle", retryErr);
        }
      }
    },
  };
}

const SEED_CAPABILITIES: Capability[] = [
  { id: "cap-java", name: "Java", category: "Backend" },
  { id: "cap-dotnet", name: ".NET", category: "Backend" },
  { id: "cap-nodejs", name: "Node.js", category: "Backend" },
  { id: "cap-python", name: "Python", category: "Backend" },
  { id: "cap-go", name: "Go", category: "Backend" },
  { id: "cap-angular", name: "Angular", category: "Frontend" },
  { id: "cap-react", name: "React", category: "Frontend" },
  { id: "cap-vue", name: "Vue", category: "Frontend" },
  { id: "cap-typescript", name: "TypeScript", category: "Frontend" },
  { id: "cap-aws", name: "AWS", category: "Cloud" },
  { id: "cap-azure", name: "Azure", category: "Cloud" },
  { id: "cap-gcp", name: "GCP", category: "Cloud" },
  { id: "cap-kubernetes", name: "Kubernetes", category: "Cloud" },
  { id: "cap-terraform", name: "Terraform", category: "Cloud" },
  { id: "cap-sap", name: "SAP", category: "Enterprise" },
  { id: "cap-salesforce", name: "Salesforce", category: "Enterprise" },
  { id: "cap-data-eng", name: "Data Engineering", category: "Data" },
  { id: "cap-ml", name: "Machine Learning", category: "Data" },
  { id: "cap-sql", name: "SQL", category: "Data" },
  { id: "cap-devops", name: "DevOps", category: "Platform" },
  { id: "cap-security", name: "Cyber Security", category: "Platform" },
  { id: "cap-qa", name: "QA / Test Automation", category: "Quality" },
];

function buildInitialLockedSnapshots(): Record<string, ForecastCell[]> {
  const snapshots: Record<string, ForecastCell[]> = {};
  for (const cycle of demo.forecastCycles) {
    if (cycle.status === "locked" || cycle.status === "archived") {
      snapshots[cycle.id] = demo.forecastCells.filter((c) => c.cycleId === cycle.id);
    }
  }
  return snapshots;
}

function initialState(): Omit<AppState, keyof {
  setActiveCycle: unknown;
  setFilter: unknown;
  setRole: unknown;
  setTheme: unknown;
  setDensity: unknown;
  setForecastValue: unknown;
  setForecastValuesBulk: unknown;
  addComment: unknown;
  resolveComment: unknown;
  openCycle: unknown;
  startEditing: unknown;
  startReconciling: unknown;
  lockCycle: unknown;
  archiveCycle: unknown;
  canEditCycle: unknown;
  addEmployee: unknown;
  addJoiner: unknown;
  addLeaver: unknown;
  transferEmployee: unknown;
  assignEmployeeToProject: unknown;
  unassignEmployeeFromProject: unknown;
  addProject: unknown;
  updateProject: unknown;
  setWorkingCalendarEntry: unknown;
  resetWorkingCalendar: unknown;
  addCapability: unknown;
  renameCapability: unknown;
  removeCapability: unknown;
  setEmployeeCapabilities: unknown;
  setEmployeeGermanSpeaker: unknown;
  setEmployeeClearanceLevel: unknown;
  runDqChecks: unknown;
  waiveDqCheck: unknown;
  promoteScenario: unknown;
  addScenario: unknown;
  ingest: unknown;
  resetToDemo: unknown;
  applyImportPatch: unknown;
  replacePeopleAndPruneProjects: unknown;
}> {
  return {
    productionUnits: demo.productionUnits,
    marketUnits: demo.marketUnits,
    locations: demo.locations,
    grades: demo.grades,
    projects: demo.projects,
    capabilities: SEED_CAPABILITIES,

    employees: demo.employees,
    snapshots: demo.snapshots,
    gfsHours: demo.gfsHours,
    joiners: demo.joiners,
    leavers: demo.leavers,
    contractOfMandate: demo.contractOfMandate,
    transfers: [],

    cycles: demo.forecastCycles,
    activeCycleId: "fc-2026-04",
    previousCycleId: "fc-2026-03",
    forecastCells: demo.forecastCells,
    lockedSnapshots: buildInitialLockedSnapshots(),
    budget: demo.budget,
    pipeline: demo.pipeline,
    projectDemand: demo.projectDemand,
    scenarios: demo.scenarios,

    comments: demo.comments,
    audit: [],
    anomalies: demo.anomalies,
    dqChecks: demo.dqChecks,

    workingCalendar: seedWorkingCalendar(2024, 2028),

    role: "controller" as Role,
    user: { name: "Maciej Koszarek", email: "maciej.koszarek@gmail.com", puCode: "PL01NC03" },
    filter: {},
    theme: "light" as const,
    density: "comfortable" as const,
  };
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      ...initialState(),

      setActiveCycle: (id) => {
        const cycle = get().cycles.find((c) => c.id === id);
        const prev = cycle?.prevCycleId ?? get().previousCycleId;
        set({ activeCycleId: id, previousCycleId: prev });
      },

      setFilter: (f) => set((s) => ({ filter: { ...s.filter, ...f } })),
      setRole: (r) => set({ role: r }),
      setTheme: (t) => set({ theme: t }),
      setDensity: (d) => set({ density: d }),

      setForecastValue: ({ cycleId, puCode, period, metric, value, comment }) => {
        if (!get().canEditCycle(cycleId, puCode)) return;
        const check = validateForecastCell(value, metric);
        const idx = get().forecastCells.findIndex(
          (c) => c.cycleId === cycleId && c.puCode === puCode && c.period === period && c.metric === metric,
        );
        const before = idx >= 0 ? get().forecastCells[idx] : undefined;
        const now = new Date().toISOString();
        const updated: ForecastCell = {
          cycleId,
          puCode,
          period,
          metric,
          value: check.value,
          comment,
          enteredBy: get().user.name,
          enteredAt: now,
          source: "manual",
        };
        const newCells = [...get().forecastCells];
        if (idx >= 0) newCells[idx] = updated;
        else newCells.push(updated);

        const audits: AuditEntry[] = [
          {
            id: uid("au-"),
            actor: get().user.name,
            entityType: "forecast_cell",
            entityId: `${cycleId}::${puCode}::${metric}::${period}`,
            action: before ? "update" : "create",
            before,
            after: updated,
            ts: now,
          },
        ];
        if (check.clamped) {
          audits.push({
            id: uid("au-"),
            actor: get().user.name,
            entityType: "validation-clamp",
            entityId: `${cycleId}::${puCode}::${metric}::${period}`,
            action: "update",
            before: { value },
            after: { value: check.value, reason: check.reason },
            ts: now,
          });
        }
        set({ forecastCells: newCells, audit: [...audits, ...get().audit].slice(0, 2000) });
      },

      setForecastValuesBulk: ({ cycleId, puCode, values, source = "auto_baseline" }) => {
        if (!get().canEditCycle(cycleId, puCode)) return;
        const now = new Date().toISOString();
        const actor = get().user.name;
        const cells = [...get().forecastCells];
        const keyOf = (period: Period, metric: ForecastMetric) =>
          `${cycleId}::${puCode}::${metric}::${period}`;
        const idxByKey = new Map<string, number>();
        for (let i = 0; i < cells.length; i++) {
          const c = cells[i];
          if (!c.grade && !c.mu) {
            idxByKey.set(keyOf(c.period, c.metric), i);
          }
        }
        const audits: AuditEntry[] = [];
        for (const { period, metric, value } of values) {
          const check = validateForecastCell(value, metric);
          const k = keyOf(period, metric);
          const existingIdx = idxByKey.get(k);
          const before = existingIdx !== undefined ? cells[existingIdx] : undefined;
          const updated: ForecastCell = {
            cycleId,
            puCode,
            period,
            metric,
            value: check.value,
            enteredBy: actor,
            enteredAt: now,
            source,
          };
          if (existingIdx !== undefined) cells[existingIdx] = updated;
          else {
            idxByKey.set(k, cells.length);
            cells.push(updated);
          }
          audits.push({
            id: uid("au-"),
            actor,
            entityType: "forecast_cell",
            entityId: `${cycleId}::${puCode}::${metric}::${period}`,
            action: before ? "update" : "create",
            before,
            after: updated,
            ts: now,
          });
          if (check.clamped) {
            audits.push({
              id: uid("au-"),
              actor,
              entityType: "validation-clamp",
              entityId: `${cycleId}::${puCode}::${metric}::${period}`,
              action: "update",
              before: { value },
              after: { value: check.value, reason: check.reason },
              ts: now,
            });
          }
        }
        set({ forecastCells: cells, audit: [...audits, ...get().audit].slice(0, 2000) });
      },

      addComment: (c) => {
        const comment: Comment = {
          ...c,
          id: uid("c-"),
          createdAt: new Date().toISOString(),
          author: get().user.name,
        };
        set({ comments: [comment, ...get().comments] });
      },

      resolveComment: (id) =>
        set((s) => ({
          comments: s.comments.map((c) => (c.id === id ? { ...c, resolvedAt: new Date().toISOString() } : c)),
        })),

      addEmployee: (e) => {
        const now = new Date().toISOString();
        const employee: Employee = {
          ...e,
          displayName: e.displayName ?? `${e.firstName} ${e.lastName}`,
          skills: e.skills ?? [],
        };
        const audit: AuditEntry = {
          id: uid("au-"),
          actor: get().user.name,
          entityType: "employee",
          entityId: employee.localNumber,
          action: "create",
          after: employee,
          ts: now,
        };
        set({ employees: [employee, ...get().employees], audit: [audit, ...get().audit].slice(0, 2000) });
      },

      addJoiner: (j) => {
        const now = new Date().toISOString();
        const joiner: Joiner = { ...j, id: uid("j-") };
        const audit: AuditEntry = {
          id: uid("au-"),
          actor: get().user.name,
          entityType: "joiner",
          entityId: joiner.id,
          action: "create",
          after: joiner,
          ts: now,
        };
        const patch: Partial<AppState> = {
          joiners: [joiner, ...get().joiners],
          audit: [audit, ...get().audit].slice(0, 2000),
        };
        // If status = actual and we have a local number, materialise Employee too (no duplicate).
        if (joiner.status === "actual" && joiner.employeeLocalNumber) {
          const exists = get().employees.some((e) => e.localNumber === joiner.employeeLocalNumber);
          if (!exists) {
            const employee: Employee = {
              localNumber: joiner.employeeLocalNumber,
              firstName: joiner.firstName,
              lastName: joiner.lastName,
              displayName: `${joiner.firstName} ${joiner.lastName}`,
              puCode: joiner.puCode,
              gradeCode: joiner.gradeCode,
              jobFunction: "CSS",
              locationCode: joiner.locationCode,
              startDate: joiner.startDate,
              fteCapacity: 1,
              engagement: "UoP",
              skills: [],
            };
            patch.employees = [employee, ...get().employees];
          }
        }
        set(patch as AppState);
      },

      addLeaver: (l) => {
        const now = new Date().toISOString();
        const leaver: Leaver = { ...l, id: uid("l-") };
        const employees = get().employees.map((e) =>
          e.localNumber === leaver.employeeLocalNumber ? { ...e, endDate: leaver.endDate } : e,
        );
        const audit: AuditEntry = {
          id: uid("au-"),
          actor: get().user.name,
          entityType: "leaver",
          entityId: leaver.id,
          action: "create",
          after: leaver,
          ts: now,
        };
        set({
          leavers: [leaver, ...get().leavers],
          employees,
          audit: [audit, ...get().audit].slice(0, 2000),
        });
      },

      transferEmployee: ({ localNumber, toPuCode, effectivePeriod, reason }) => {
        const emp = get().employees.find((e) => e.localNumber === localNumber);
        if (!emp) return;
        if (emp.puCode === toPuCode) return;
        const now = new Date().toISOString();
        const transfer: Transfer = {
          id: uid("tr-"),
          employeeLocalNumber: localNumber,
          fromPuCode: emp.puCode,
          toPuCode,
          effectivePeriod,
          recordedAt: now,
          recordedBy: get().user.name,
          reason,
        };
        const employees = get().employees.map((e) =>
          e.localNumber === localNumber ? { ...e, puCode: toPuCode } : e,
        );
        const audit: AuditEntry = {
          id: uid("au-"),
          actor: get().user.name,
          entityType: "employee",
          entityId: localNumber,
          action: "update",
          before: { puCode: emp.puCode },
          after: { puCode: toPuCode, effectivePeriod, reason },
          ts: now,
        };
        set({
          transfers: [transfer, ...get().transfers],
          employees,
          audit: [audit, ...get().audit].slice(0, 2000),
        });
      },

      assignEmployeeToProject: ({ localNumber, projectNumber, period, hours, projectType }) => {
        const existing = get().gfsHours;
        const idx = existing.findIndex(
          (h) => h.employeeLocalNumber === localNumber && h.projectNumber === projectNumber && h.period === period,
        );
        const row: GfsHours = {
          employeeLocalNumber: localNumber,
          period,
          projectNumber,
          projectType: projectType ?? "DEL",
          hours,
        };
        const next = [...existing];
        if (idx >= 0) next[idx] = row;
        else next.push(row);
        const audit: AuditEntry = {
          id: uid("au-"),
          actor: get().user.name,
          entityType: "gfs_hours",
          entityId: `${localNumber}::${projectNumber}::${period}`,
          action: idx >= 0 ? "update" : "create",
          after: row,
          ts: new Date().toISOString(),
        };
        set({ gfsHours: next, audit: [audit, ...get().audit].slice(0, 2000) });
      },

      unassignEmployeeFromProject: ({ localNumber, projectNumber, period }) => {
        const existing = get().gfsHours;
        const row = existing.find(
          (h) => h.employeeLocalNumber === localNumber && h.projectNumber === projectNumber && h.period === period,
        );
        if (!row) return;
        const next = existing.filter((h) => h !== row);
        const audit: AuditEntry = {
          id: uid("au-"),
          actor: get().user.name,
          entityType: "gfs_hours",
          entityId: `${localNumber}::${projectNumber}::${period}`,
          action: "delete",
          before: row,
          ts: new Date().toISOString(),
        };
        set({ gfsHours: next, audit: [audit, ...get().audit].slice(0, 2000) });
      },

      addProject: (p) => {
        const trimmedNumber = p.projectNumber.trim();
        if (!trimmedNumber) return;
        if (get().projects.some((x) => x.projectNumber === trimmedNumber)) return;
        const now = new Date().toISOString();
        const kind = p.kind ?? "project";
        const commitProbability = kind === "project"
          ? 1.0
          : clamp(p.commitProbability ?? DEFAULT_COMMIT_PROBABILITY[kind], 0, 1);
        const project: Project = {
          projectNumber: trimmedNumber,
          name: p.name.trim(),
          customer: p.customer.trim(),
          marketUnit: p.marketUnit,
          kind,
          isBillable: p.isBillable,
          status: p.status,
          startDate: p.startDate,
          endDate: p.endDate,
          description: p.description?.trim() || undefined,
          tags: p.tags ?? [],
          commitProbability,
        };
        const audit: AuditEntry = {
          id: uid("au-"),
          actor: get().user.name,
          entityType: "project",
          entityId: project.projectNumber,
          action: "create",
          after: project,
          ts: now,
        };
        set({ projects: [project, ...get().projects], audit: [audit, ...get().audit].slice(0, 2000) });
      },

      updateProject: (projectNumber, patch) => {
        const before = get().projects.find((p) => p.projectNumber === projectNumber);
        if (!before) return;
        const now = new Date().toISOString();
        const actor = get().user.name;
        const audits: AuditEntry[] = [];

        const kindChanging = patch.kind !== undefined && patch.kind !== before.kind;
        const nextKind = patch.kind ?? before.kind;

        let nextCommit: number;
        if (kindChanging) {
          nextCommit = nextKind === "project" ? 1.0 : DEFAULT_COMMIT_PROBABILITY[nextKind];
        } else if (patch.commitProbability !== undefined) {
          if (nextKind === "project") {
            nextCommit = 1.0;
          } else {
            const raw = patch.commitProbability;
            const clamped = Number.isFinite(raw) ? clamp(raw, 0, 1) : 0;
            if (!Number.isFinite(raw) || raw < 0 || raw > 1) {
              audits.push({
                id: uid("au-"),
                actor,
                entityType: "validation-clamp",
                entityId: projectNumber,
                action: "update",
                before: { entity: "project", field: "commitProbability", value: raw },
                after: { entity: "project", field: "commitProbability", value: clamped, reason: "I30 range" },
                ts: now,
              });
            }
            nextCommit = clamped;
          }
        } else {
          nextCommit = before.commitProbability ?? DEFAULT_COMMIT_PROBABILITY[nextKind];
          if (nextKind === "project") nextCommit = 1.0;
        }

        const after: Project = {
          ...before,
          ...patch,
          kind: nextKind,
          name: patch.name !== undefined ? patch.name.trim() : before.name,
          customer: patch.customer !== undefined ? patch.customer.trim() : before.customer,
          description:
            patch.description !== undefined
              ? patch.description.trim() || undefined
              : before.description,
          commitProbability: nextCommit,
        };
        audits.unshift({
          id: uid("au-"),
          actor,
          entityType: "project",
          entityId: projectNumber,
          action: "update",
          before,
          after,
          ts: now,
        });
        set({
          projects: get().projects.map((p) => (p.projectNumber === projectNumber ? after : p)),
          audit: [...audits, ...get().audit].slice(0, 2000),
        });
      },

      setWorkingCalendarEntry: (period, patch) => {
        const entries = get().workingCalendar;
        const idx = entries.findIndex((e) => e.period === period);
        const before = idx >= 0 ? entries[idx] : undefined;
        const base = before ?? defaultEntryForPeriod(period);
        const next: WorkingCalendarEntry = {
          period,
          workingDays: Math.max(0, patch.workingDays !== undefined ? patch.workingDays : base.workingDays),
          workingHours: Math.max(0, patch.workingHours !== undefined ? patch.workingHours : base.workingHours),
        };
        if (before && before.workingDays === next.workingDays && before.workingHours === next.workingHours) {
          return;
        }
        const out = [...entries];
        if (idx >= 0) out[idx] = next;
        else out.push(next);
        out.sort((a, b) => a.period.localeCompare(b.period));
        const audit: AuditEntry = {
          id: uid("au-"),
          actor: get().user.name,
          entityType: "working_calendar",
          entityId: period,
          action: before ? "update" : "create",
          before,
          after: next,
          ts: new Date().toISOString(),
        };
        set({ workingCalendar: out, audit: [audit, ...get().audit].slice(0, 2000) });
      },

      resetWorkingCalendar: (fromYear = 2024, toYear = 2028) => {
        const before = get().workingCalendar;
        const after = seedWorkingCalendar(fromYear, toYear);
        const audit: AuditEntry = {
          id: uid("au-"),
          actor: get().user.name,
          entityType: "working_calendar",
          entityId: `reset:${fromYear}-${toYear}`,
          action: "update",
          before: { count: before.length },
          after: { count: after.length, fromYear, toYear },
          ts: new Date().toISOString(),
        };
        set({ workingCalendar: after, audit: [audit, ...get().audit].slice(0, 2000) });
      },

      addCapability: ({ name, category }) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        if (get().capabilities.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) return;
        const cap: Capability = { id: uid("cap-"), name: trimmed, category: category?.trim() || undefined };
        set({ capabilities: [...get().capabilities, cap] });
      },

      renameCapability: (id, name, category) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        set({
          capabilities: get().capabilities.map((c) =>
            c.id === id ? { ...c, name: trimmed, category: category?.trim() || undefined } : c,
          ),
        });
      },

      removeCapability: (id) => {
        const employees = get().employees.map((e) =>
          e.capabilities?.includes(id)
            ? { ...e, capabilities: e.capabilities.filter((cid) => cid !== id) }
            : e,
        );
        set({
          capabilities: get().capabilities.filter((c) => c.id !== id),
          employees,
        });
      },

      setEmployeeCapabilities: (localNumber, capabilityIds) => {
        set({
          employees: get().employees.map((e) =>
            e.localNumber === localNumber ? { ...e, capabilities: [...capabilityIds] } : e,
          ),
        });
      },

      setEmployeeGermanSpeaker: (localNumber, v) => {
        set({
          employees: get().employees.map((e) =>
            e.localNumber === localNumber ? { ...e, germanSpeaker: v } : e,
          ),
        });
      },

      setEmployeeClearanceLevel: (localNumber, v) => {
        set({
          employees: get().employees.map((e) =>
            e.localNumber === localNumber ? { ...e, clearanceLevel: v } : e,
          ),
        });
      },

      openCycle: (label, periodOpened) => {
        if (get().role !== "controller") return false;
        const active = get().cycles.find((c) => c.status === "open" || c.status === "editing" || c.status === "reconciling");
        const now = new Date().toISOString();
        const actor = get().user.name;
        const audits: AuditEntry[] = [];
        let nextCycles = get().cycles;
        let nextSnapshots = get().lockedSnapshots;
        if (active) {
          const snapshot = get().forecastCells.filter((c) => c.cycleId === active.id);
          nextCycles = nextCycles.map((c) =>
            c.id === active.id ? { ...c, status: "locked" as const, lockedBy: actor, lockedAt: now } : c,
          );
          nextSnapshots = { ...nextSnapshots, [active.id]: snapshot };
          audits.push({
            id: uid("au-"),
            actor,
            entityType: "cycle",
            entityId: active.id,
            action: "lock" as const,
            before: { status: active.status, cells: snapshot.length },
            after: { status: "locked", cells: snapshot.length },
            ts: now,
          });
        }
        const newCycle: ForecastCycle = {
          id: `fc-${periodOpened}`,
          label,
          periodOpened,
          status: "open",
          openedBy: actor,
          openedAt: now,
          prevCycleId: active?.id,
        };
        audits.push({
          id: uid("au-"),
          actor,
          entityType: "cycle",
          entityId: newCycle.id,
          action: "open" as const,
          after: { status: "open", label, periodOpened },
          ts: now,
        });
        set({
          cycles: [newCycle, ...nextCycles],
          lockedSnapshots: nextSnapshots,
          activeCycleId: newCycle.id,
          previousCycleId: active?.id ?? get().previousCycleId,
          audit: [...audits, ...get().audit].slice(0, 2000),
        });
        return true;
      },

      startEditing: (id) => {
        const role = get().role;
        if (role !== "controller" && role !== "pu_lead") return;
        const cycle = get().cycles.find((c) => c.id === id);
        if (!cycle || cycle.status !== "open") return;
        const now = new Date().toISOString();
        set({
          cycles: get().cycles.map((c) => (c.id === id ? { ...c, status: "editing" as const } : c)),
          audit: [
            {
              id: uid("au-"),
              actor: get().user.name,
              entityType: "cycle",
              entityId: id,
              action: "start_editing" as const,
              before: { status: cycle.status },
              after: { status: "editing" },
              ts: now,
            },
            ...get().audit,
          ].slice(0, 2000),
        });
      },

      startReconciling: (id) => {
        const role = get().role;
        if (role !== "controller" && role !== "pu_lead") return;
        const cycle = get().cycles.find((c) => c.id === id);
        if (!cycle || cycle.status !== "editing") return;
        const now = new Date().toISOString();
        set({
          cycles: get().cycles.map((c) => (c.id === id ? { ...c, status: "reconciling" as const } : c)),
          audit: [
            {
              id: uid("au-"),
              actor: get().user.name,
              entityType: "cycle",
              entityId: id,
              action: "start_reconciling" as const,
              before: { status: cycle.status },
              after: { status: "reconciling" },
              ts: now,
            },
            ...get().audit,
          ].slice(0, 2000),
        });
      },

      lockCycle: (id) => {
        if (get().role !== "controller") return;
        const cycle = get().cycles.find((c) => c.id === id);
        if (!cycle) return;
        if (cycle.status !== "reconciling" && cycle.status !== "editing") return;
        const now = new Date().toISOString();
        const snapshot = get().forecastCells.filter((c) => c.cycleId === id);
        set({
          cycles: get().cycles.map((c) =>
            c.id === id ? { ...c, status: "locked" as const, lockedBy: get().user.name, lockedAt: now } : c,
          ),
          lockedSnapshots: { ...get().lockedSnapshots, [id]: snapshot },
          audit: [
            {
              id: uid("au-"),
              actor: get().user.name,
              entityType: "cycle",
              entityId: id,
              action: "lock" as const,
              before: { status: cycle.status, cells: snapshot.length },
              after: { status: "locked", cells: snapshot.length },
              ts: now,
            },
            ...get().audit,
          ].slice(0, 2000),
        });
      },

      archiveCycle: (id) => {
        if (get().role !== "controller") return;
        const cycle = get().cycles.find((c) => c.id === id);
        if (!cycle || cycle.status !== "locked") return;
        const now = new Date().toISOString();
        set({
          cycles: get().cycles.map((c) =>
            c.id === id ? { ...c, status: "archived" as const, archivedBy: get().user.name, archivedAt: now } : c,
          ),
          audit: [
            {
              id: uid("au-"),
              actor: get().user.name,
              entityType: "cycle",
              entityId: id,
              action: "archive" as const,
              before: { status: cycle.status },
              after: { status: "archived" },
              ts: now,
            },
            ...get().audit,
          ].slice(0, 2000),
        });
      },

      canEditCycle: (id, puCode) => {
        const cycle = get().cycles.find((c) => c.id === id);
        if (!cycle) return false;
        if (cycle.status !== "editing") return false;
        const role = get().role;
        if (role === "controller") return true;
        if (role === "pu_lead") return get().user.puCode === puCode;
        return false;
      },

      runDqChecks: () => {
        // Re-run lightweight checks: existence of employees in snapshots, no duplicate PU per employee/month, etc.
        const snaps = get().snapshots;
        const seen = new Set<string>();
        const duplicates: unknown[] = [];
        for (const s of snaps) {
          const k = `${s.employeeLocalNumber}::${s.period}`;
          if (seen.has(k)) duplicates.push({ employee: s.employeeLocalNumber, period: s.period });
          seen.add(k);
        }
        const violations = checkArithmeticIdentities(get().forecastCells);
        const existingIds = new Set(get().dqChecks.map((c) => c.id));
        const identityCheck: DQCheckResult = {
          id: "dq-arithmetic",
          name: "Arithmetic identities",
          description: "HC_END, F_TOTAL, FTE_CSS, ARVE_BASE match their component sums; BFTE ≤ FTE.",
          severity: "warning",
          status: violations.length === 0 ? "pass" : "fail",
          failingRows: violations.slice(0, 50),
        };
        const withUpdated = get().dqChecks.map((c) => {
          if (c.id === "dq-4") return { ...c, status: duplicates.length === 0 ? ("pass" as const) : ("fail" as const), failingRows: duplicates };
          if (c.id === "dq-arithmetic") return identityCheck;
          return c;
        });
        if (!existingIds.has("dq-arithmetic")) withUpdated.push(identityCheck);
        set({ dqChecks: withUpdated });
      },

      waiveDqCheck: (id, comment) =>
        set((s) => ({
          dqChecks: s.dqChecks.map((c) => (c.id === id ? { ...c, status: "waived" as const, waivedBy: s.user.name, waivedComment: comment } : c)),
        })),

      promoteScenario: (id) => {
        const sc = get().scenarios.find((s) => s.id === id);
        if (!sc) return;
        set({
          scenarios: get().scenarios.map((s) => (s.id === id ? { ...s, status: "promoted" as const } : s)),
        });
      },

      addScenario: (s) =>
        set({
          scenarios: [{ ...s, id: uid("sc-"), createdAt: new Date().toISOString() }, ...get().scenarios],
        }),

      ingest: (payload) => {
        set({
          employees: payload.employees.length ? payload.employees : get().employees,
          snapshots: payload.snapshots.length ? payload.snapshots : get().snapshots,
          gfsHours: payload.gfsHours.length ? payload.gfsHours : get().gfsHours,
          joiners: payload.joiners.length ? payload.joiners : get().joiners,
          leavers: payload.leavers.length ? payload.leavers : get().leavers,
          contractOfMandate: payload.contractOfMandate.length ? payload.contractOfMandate : get().contractOfMandate,
          lastIngest: {
            fileName: payload.fileName,
            sheetNames: payload.sheetNames,
            rowCounts: payload.rowCounts,
            warnings: payload.warnings,
            at: new Date().toISOString(),
          },
        });
      },

      resetToDemo: () => {
        const s = initialState();
        demo.setLivePuIndex(s.productionUnits);
        set({ ...s });
      },

      replacePeopleAndPruneProjects: (payload) => {
        const state = get();
        const employeesBefore = state.employees.length;
        const gfsBefore = state.gfsHours.length;
        const projectsBefore = state.projects.length;
        const newIds = new Set(payload.employees.map((e) => e.localNumber));

        // 0. Augment taxonomies for any unseen codes referenced by the imported
        //    roster. Without this, lookups (puLabel, grade dropdown, location
        //    name) silently fall back to the raw code which looks like a bug
        //    even though the underlying data is correct.
        const knownPu = new Set(state.productionUnits.map((p) => p.code));
        const newPus: ProductionUnit[] = [];
        const puNameHint = payload.puCodeToPeopleUnit ?? {};
        for (const e of payload.employees) {
          if (!knownPu.has(e.puCode)) {
            knownPu.add(e.puCode);
            const friendly = puNameHint[e.puCode]?.trim();
            const shortName = friendly
              ? friendly.replace(/\s+/g, "_").replace(/[^A-Za-z0-9_]/g, "")
              : e.puCode;
            newPus.push({
              code: e.puCode,
              shortName: shortName || e.puCode,
              displayName: friendly || e.puCode,
              sbu: state.productionUnits[0]?.sbu ?? "",
              bu: state.productionUnits[0]?.bu ?? "CCA",
              sortOrder:
                Math.max(0, ...state.productionUnits.map((p) => p.sortOrder)) +
                10 +
                newPus.length,
              active: true,
            });
          }
        }
        const productionUnits = newPus.length
          ? [...state.productionUnits, ...newPus]
          : state.productionUnits;
        if (newPus.length) demo.setLivePuIndex(productionUnits);

        const knownGrades = new Set(state.grades.map((g) => g.code));
        const newGrades: Grade[] = [];
        for (const e of payload.employees) {
          if (!e.gradeCode || knownGrades.has(e.gradeCode)) continue;
          knownGrades.add(e.gradeCode);
          // Heuristic: the first letter implies the family — D/E ≈ management,
          // C ≈ senior, B ≈ dev, A ≈ intern, anything else falls back to dev.
          const head = e.gradeCode.charAt(0).toUpperCase();
          const family: Grade["family"] =
            head === "D" || head === "E"
              ? "management"
              : head === "C"
                ? "senior"
                : head === "B"
                  ? "dev"
                  : head === "A"
                    ? "intern"
                    : "dev";
          newGrades.push({
            code: e.gradeCode,
            family,
            sortOrder:
              Math.max(0, ...state.grades.map((g) => g.sortOrder)) +
              10 +
              newGrades.length,
            isContractor: false,
          });
        }
        const grades = newGrades.length ? [...state.grades, ...newGrades] : state.grades;

        const knownLocations = new Set(state.locations.map((l) => l.code));
        const newLocations: Location[] = [];
        const locDisplay: Record<string, string> = {
          KAT: "Katowice",
          OPO: "Opole",
        };
        for (const e of payload.employees) {
          if (!e.locationCode || knownLocations.has(e.locationCode)) continue;
          knownLocations.add(e.locationCode);
          newLocations.push({
            code: e.locationCode,
            displayName: locDisplay[e.locationCode] ?? e.locationCode,
            country: "PL",
          });
        }
        const locations = newLocations.length
          ? [...state.locations, ...newLocations]
          : state.locations;

        // 1. Filter gfsHours by surviving Employee IDs.
        const gfsHours = state.gfsHours.filter((h) => newIds.has(h.employeeLocalNumber));

        // 2. Set of project numbers that still have a reference.
        const referencedProjects = new Set<string>();
        for (const h of gfsHours) referencedProjects.add(h.projectNumber);
        for (const d of state.projectDemand) referencedProjects.add(d.projectNumber);

        // 3. Drop projects with no remaining links.
        const projects = state.projects.filter((p) => referencedProjects.has(p.projectNumber));
        const survivingProjectNumbers = new Set(projects.map((p) => p.projectNumber));
        const removedProjectNumbers = state.projects
          .map((p) => p.projectNumber)
          .filter((n) => !survivingProjectNumbers.has(n));
        const projectDemand = state.projectDemand.filter((d) =>
          survivingProjectNumbers.has(d.projectNumber),
        );

        // 4. Snapshots: replace with the file's snapshots — they describe
        //    the imported month authoritatively.
        const snapshots = payload.snapshots;

        // 5. contractOfMandate / transfers — drop rows for gone employees.
        const contractOfMandate = state.contractOfMandate.filter((c) =>
          newIds.has(c.employeeLocalNumber),
        );
        const transfers = state.transfers.filter((t) => newIds.has(t.employeeLocalNumber));

        const now = new Date().toISOString();
        const audit: AuditEntry = {
          id: uid("au-"),
          actor: state.user.name,
          entityType: "import",
          entityId: payload.fileName,
          action: "update",
          before: {
            employees: employeesBefore,
            gfsHours: gfsBefore,
            projects: projectsBefore,
          },
          after: {
            employees: payload.employees.length,
            gfsHours: gfsHours.length,
            projects: projects.length,
            removedProjects: removedProjectNumbers.length,
            source: "CCA_People",
          },
          ts: now,
        };

        set({
          productionUnits,
          grades,
          locations,
          employees: payload.employees,
          snapshots,
          joiners: payload.joiners,
          leavers: payload.leavers,
          gfsHours,
          projects,
          projectDemand,
          contractOfMandate,
          transfers,
          lastIngest: {
            fileName: payload.fileName,
            sheetNames: [],
            rowCounts: {
              employees: payload.employees.length,
              snapshots: snapshots.length,
              gfsHours_kept: gfsHours.length,
              projects_kept: projects.length,
              taxonomy_added:
                newPus.length + newGrades.length + newLocations.length,
              projects_removed: removedProjectNumbers.length,
            },
            warnings: [],
            at: now,
          },
          audit: [audit, ...state.audit].slice(0, 2000),
        });

        return {
          employeesBefore,
          employeesAfter: payload.employees.length,
          gfsHoursBefore: gfsBefore,
          gfsHoursAfter: gfsHours.length,
          projectsBefore,
          projectsAfter: projects.length,
          removedProjectNumbers,
        };
      },

      applyImportPatch: (patch, source) => {
        if (get().role !== "controller") return;
        const safeKeys: ReadonlyArray<keyof AppState> = [
          "productionUnits",
          "marketUnits",
          "locations",
          "grades",
          "capabilities",
          "projects",
          "employees",
          "workingCalendar",
          "snapshots",
          "gfsHours",
          "joiners",
          "leavers",
          "contractOfMandate",
          "transfers",
          "cycles",
          "forecastCells",
          "budget",
          "pipeline",
          "projectDemand",
          "scenarios",
          "comments",
          "anomalies",
          "dqChecks",
        ];
        const applied: Partial<AppState> = {};
        for (const k of safeKeys) {
          if (patch[k] !== undefined) {
            (applied as Record<string, unknown>)[k as string] = patch[k] as unknown;
          }
        }
        if (Object.keys(applied).length === 0) return;
        const state = get();
        const entry: AuditEntry = {
          id: uid("audit-"),
          actor: state.user.email || state.user.name || "import",
          entityType: "import",
          entityId: source,
          action: "update",
          after: { tables: Object.keys(applied), source },
          ts: new Date().toISOString(),
        };
        set({ ...(applied as Partial<AppState>), audit: [entry, ...state.audit].slice(0, 2000) });
      },
    }),
    {
      name: "cca-practiceview-v2",
      version: 2,
      storage: createJSONStorage(() => quotaSafeStorage()),
      migrate: (persisted, version) => {
        if (!persisted || typeof persisted !== "object") return persisted as AppState;
        const s = persisted as Record<string, unknown>;
        if (version < 2) {
          if (!Array.isArray(s.workingCalendar) || (s.workingCalendar as unknown[]).length === 0) {
            s.workingCalendar = seedWorkingCalendar(2024, 2028);
          }
          if (Array.isArray(s.projects)) {
            s.projects = (s.projects as Record<string, unknown>[]).map((p) => ({
              ...p,
              kind: (p.kind as string | undefined) ?? "project",
            }));
          }
        }
        return s as unknown as AppState;
      },
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        if (!Array.isArray(state.workingCalendar) || state.workingCalendar.length === 0) {
          state.workingCalendar = seedWorkingCalendar(2024, 2028);
        }
        if (Array.isArray(state.projects)) {
          state.projects = state.projects.map((p) => ({ ...p, kind: p.kind ?? "project" }));
        }
        if (Array.isArray(state.productionUnits)) {
          demo.setLivePuIndex(state.productionUnits);
        }
      },
      partialize: (s) => ({
        activeCycleId: s.activeCycleId,
        previousCycleId: s.previousCycleId,
        filter: s.filter,
        theme: s.theme,
        density: s.density,
        role: s.role,
        forecastCells: s.forecastCells,
        lockedSnapshots: s.lockedSnapshots,
        cycles: s.cycles,
        comments: s.comments,
        audit: s.audit,
        scenarios: s.scenarios,
        employees: s.employees,
        joiners: s.joiners,
        leavers: s.leavers,
        transfers: s.transfers,
        gfsHours: s.gfsHours,
        capabilities: s.capabilities,
        projects: s.projects,
        productionUnits: s.productionUnits,
        grades: s.grades,
        locations: s.locations,
        workingCalendar: s.workingCalendar,
      }),
    },
  ),
);

