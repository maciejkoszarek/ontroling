import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  Anomaly,
  AppFilter,
  AuditEntry,
  BudgetCell,
  Comment,
  ContractOfMandate,
  CycleStatus,
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
} from "./types";
import * as demo from "./lib/demoData";
import { uid } from "./lib/utils";

export interface AppState {
  // ----- reference
  productionUnits: ProductionUnit[];
  marketUnits: MarketUnit[];
  locations: Location[];
  grades: Grade[];
  projects: Project[];

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

  // ----- UI state
  role: Role;
  user: { name: string; email: string };
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

  openCycle: (label: string, periodOpened: Period) => void;
  closeCycle: (id: string) => void;
  /** Move cycle into `editing` — controllers and PU leads can write forecast values. */
  startEditing: (id: string) => void;
  /** Move cycle into `reconciling` — writes are blocked but DQ / commentary continues. */
  startReconciling: (id: string) => void;
  /** Lock the cycle. Snapshots forecast cells. Only `controller` role allowed. */
  lockCycle: (id: string) => void;
  /** Archive a locked cycle. */
  archiveCycle: (id: string) => void;
  /** Pure helper: is this cycle editable by the current role? */
  canEditCycle: (id: string) => boolean;

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

  resetToDemo: () => void;
}

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
  addComment: unknown;
  resolveComment: unknown;
  openCycle: unknown;
  closeCycle: unknown;
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
  runDqChecks: unknown;
  waiveDqCheck: unknown;
  promoteScenario: unknown;
  addScenario: unknown;
  ingest: unknown;
  resetToDemo: unknown;
}> {
  return {
    productionUnits: demo.productionUnits,
    marketUnits: demo.marketUnits,
    locations: demo.locations,
    grades: demo.grades,
    projects: demo.projects,

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

    role: "controller" as Role,
    user: { name: "Maciej Koszarek", email: "maciej.koszarek@gmail.com" },
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
      setTheme: (t) => {
        set({ theme: t });
        if (typeof document !== "undefined") document.documentElement.classList.toggle("dark", t === "dark");
      },
      setDensity: (d) => set({ density: d }),

      setForecastValue: ({ cycleId, puCode, period, metric, value, comment }) => {
        if (!get().canEditCycle(cycleId)) return;
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
          value,
          comment,
          enteredBy: get().user.name,
          enteredAt: now,
          source: "manual",
        };
        const newCells = [...get().forecastCells];
        if (idx >= 0) newCells[idx] = updated;
        else newCells.push(updated);

        const audit: AuditEntry = {
          id: uid("au-"),
          actor: get().user.name,
          entityType: "forecast_cell",
          entityId: `${cycleId}::${puCode}::${metric}::${period}`,
          action: before ? "update" : "create",
          before,
          after: updated,
          ts: now,
        };
        set({ forecastCells: newCells, audit: [audit, ...get().audit].slice(0, 2000) });
      },

      setForecastValuesBulk: ({ cycleId, puCode, values, source = "auto_baseline" }) => {
        if (!get().canEditCycle(cycleId)) return;
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
          const k = keyOf(period, metric);
          const existingIdx = idxByKey.get(k);
          const before = existingIdx !== undefined ? cells[existingIdx] : undefined;
          const updated: ForecastCell = {
            cycleId,
            puCode,
            period,
            metric,
            value,
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

      openCycle: (label, periodOpened) => {
        const active = get().cycles.find((c) => c.status === "open" || c.status === "editing" || c.status === "reconciling");
        const now = new Date().toISOString();
        const newCycles: ForecastCycle[] = get().cycles.map((c) =>
          c.id === active?.id
            ? { ...c, status: "locked", lockedBy: get().user.name, lockedAt: now }
            : c,
        );
        const newCycle: ForecastCycle = {
          id: `fc-${periodOpened}`,
          label,
          periodOpened,
          status: "open",
          openedBy: get().user.name,
          openedAt: now,
          prevCycleId: active?.id,
        };
        set({
          cycles: [newCycle, ...newCycles],
          activeCycleId: newCycle.id,
          previousCycleId: active?.id ?? get().previousCycleId,
        });
      },

      closeCycle: (id) => {
        set({
          cycles: get().cycles.map((c) =>
            c.id === id ? { ...c, status: "locked" as const, lockedBy: get().user.name, lockedAt: new Date().toISOString() } : c,
          ),
        });
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

      canEditCycle: (id) => {
        const cycle = get().cycles.find((c) => c.id === id);
        if (!cycle) return false;
        if (cycle.status !== "editing") return false;
        const role = get().role;
        return role === "controller" || role === "pu_lead";
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
        const withUpdated = get().dqChecks.map((c) => {
          if (c.id === "dq-4") return { ...c, status: duplicates.length === 0 ? ("pass" as const) : ("fail" as const), failingRows: duplicates };
          return c;
        });
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
        set({ ...s });
      },
    }),
    {
      name: "cca-practiceview-v1",
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
      }),
    },
  ),
);

export function puByCode(s: AppState, code: string): ProductionUnit | undefined {
  return s.productionUnits.find((p) => p.code === code);
}
