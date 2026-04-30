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
  HrImport,
  HrImportRowDecision,
  HrImportWarning,
  HrMappingEntry,
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
import { inferPuCode } from "./lib/parseUtils";
import { DEFAULT_COMMIT_PROBABILITY } from "./lib/projectHelpers";
import { clamp, uid } from "./lib/utils";
import { defaultEntryForPeriod, seedWorkingCalendar } from "./lib/workingCalendar";
import type { HrImportPreview, HrEmployeeDiff } from "./lib/hrImportDiff";

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

  // ----- HR import (see hr_database_import.md)
  hrMappings: HrMappingEntry[];
  hrImports: HrImport[];
  lastHrImport?: { id: string; month: Period; importedAt: string; importedBy: string };

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

  resetToDemo: () => void;
  /**
   * Applies an import patch (subset of AppState slices) after the user
   * confirmed a dry-run. Only the provided slices are replaced; the rest is
   * untouched. Appends a single audit entry.
   */
  applyImportPatch: (patch: Partial<AppState>, source: string) => void;

  // ----- HR import actions
  addHrMapping: (entry: Omit<HrMappingEntry, "id" | "createdAt" | "createdBy" | "active">) => void;
  updateHrMapping: (id: string, patch: Partial<HrMappingEntry>) => void;
  removeHrMapping: (id: string) => void;
  resolveHrMapping: (kind: HrMappingEntry["kind"], source: string) => string | undefined;
  canImportHr: (role: Role) => boolean;
  canOverrideStaleness: (role: Role) => boolean;
  /**
   * Build a `ResolvePuFn` closure over the current `hrMappings` and the
   * `inferPuCode` heuristic fallback. The HR parser consumes this; the UI
   * does not have to assemble it. See hr_database_import.md §11.4.
   */
  buildResolvePuFn: () => HrResolvePuFn;
  /**
   * Commit an HR import preview after the reviewer has decided on every
   * non-rejected diff. Throws `Error("STALE_IMPORT")` when the file month is
   * older than `lastHrImport.month` and no override reason was provided.
   * See hr_database_import.md §7.3, §15, §18.4.
   */
  commitHrImport: (args: CommitHrImportArgs) => { id: string };
}

export type HrResolvePuFn = (rawValue: string) => {
  code: string;
  via: "mapping" | "heuristic" | "none";
};

export interface CommitHrImportArgs {
  preview: HrImportPreview;
  decisions: HrImportRowDecision[];
  fileName: string;
  fileSize: number;
  durationMs: number;
  reportGeneratedAt: string | null;
  warnings: HrImportWarning[];
  stalenessOverrideReason?: string;
}

/**
 * localStorage wrapper that, on QuotaExceededError, trims the persisted
 * `audit[]` to the most recent 200 entries and retries once. Audit is the only
 * unbounded slice — `.slice(0, 2000)` in-memory still dwarfs the 5MB quota
 * when combined with demo forecast cells. If the retry still fails, we log
 * and give up silently rather than crash the app.
 */
const AUDIT_TRIM_LIMIT = 200;
const STORAGE_KEY = "cca-practiceview-v3";
const LEGACY_STORAGE_KEY = "cca-practiceview-v2";

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
    getItem: (k) => {
      const direct = base.getItem(k);
      if (direct !== null) return direct;
      // First boot under v3: pick up a stale v2 envelope so users don't lose
      // their persisted state when the schema bumps. We re-wrap it as a v3
      // envelope (after migration) and remove the legacy key so we never
      // double-read on subsequent boots.
      if (k === STORAGE_KEY) {
        try {
          const legacy = base.getItem(LEGACY_STORAGE_KEY);
          if (!legacy) return null;
          const envelope = JSON.parse(legacy) as { state?: unknown; version?: number };
          if (!envelope || typeof envelope !== "object" || !envelope.state) return null;
          const migrated = migratePersistedState(envelope.state, envelope.version ?? 2);
          base.removeItem(LEGACY_STORAGE_KEY);
          return JSON.stringify({ state: migrated, version: 3 });
        } catch (err) {
          console.warn("[store] failed to migrate legacy v2 state; falling back to seed", err);
          return null;
        }
      }
      return null;
    },
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

/**
 * Persistence migration from older `cca-practiceview-vN` schemas to the
 * current `version: 3`. Exported so tests can exercise it directly without
 * round-tripping through `localStorage`.
 */
export function migratePersistedState(
  persisted: unknown,
  version: number,
): AppState {
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
  if (version < 3) {
    if (!Array.isArray(s.hrMappings)) s.hrMappings = [];
    if (!Array.isArray(s.hrImports)) s.hrImports = [];
  }
  return s as unknown as AppState;
}

/**
 * On first boot under `cca-practiceview-v3`, look for an existing v2 envelope
 * left behind by an earlier release. If found, run it through
 * `migratePersistedState` and remove the legacy key. Returns `null` when no
 * legacy state exists or the read fails — the caller falls back to the
 * normal initialState seed in that case. See hr_database_import.md §18.3.
 */
export function migrateFromLegacyLocalStorage(): Partial<AppState> | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return null;
    const envelope = JSON.parse(raw) as { state?: unknown; version?: number };
    if (!envelope || typeof envelope !== "object" || !envelope.state) return null;
    const migrated = migratePersistedState(envelope.state, envelope.version ?? 2);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    return migrated as unknown as Partial<AppState>;
  } catch (err) {
    console.warn("[store] failed to migrate legacy v2 state; falling back to seed", err);
    return null;
  }
}

/**
 * Seed identity HrMappingEntry rows for every non-virtual PU. Each PU gets up
 * to three rows: one each for `code`, `shortName`, `displayName`, all
 * targeting the PU's own `code`. This covers the ~80% well-formed file case
 * out of the box (hr_database_import.md §11.5).
 */
export function seedHrMappings(units: ProductionUnit[]): HrMappingEntry[] {
  const out: HrMappingEntry[] = [];
  const now = new Date().toISOString();
  for (const pu of units) {
    if (pu.isVirtual) continue;
    const sources = new Set([pu.code, pu.shortName, pu.displayName].filter(Boolean));
    for (const source of sources) {
      out.push({
        id: uid("hrm-"),
        kind: "production_unit",
        source,
        targetCode: pu.code,
        createdAt: now,
        createdBy: "system",
        active: true,
      });
    }
  }
  return out;
}

/**
 * The set of `Employee` fields that the HR Database file is authoritative for.
 * Used by `commitHrImport` to merge file values onto an existing employee
 * while preserving user-managed fields (`capabilities`, `germanSpeaker`,
 * `clearanceLevel`, `ggid`, `skills`). Mirrors `HR_MAPPED_FIELDS` in
 * `hrImportDiff.ts`. See hr_database_import.md §7.3.
 */
const HR_MERGE_FIELDS: Array<keyof Employee> = [
  "firstName",
  "lastName",
  "displayName",
  "puCode",
  "gradeCode",
  "jobFunction",
  "locationCode",
  "startDate",
  "endDate",
  "fteCapacity",
  "engagement",
  "email",
  "sex",
  "hrFileNumber",
  "contractEndDate",
  "releaseDate",
  "practice",
  "pnlUnit",
  "qualification",
  "jobNameModel",
  "positionPl",
  "positionEn",
  "contractManagerName",
  "contractManagerLocalNumber",
  "contractManagerEmail",
  "directSupervisorName",
  "directSupervisorLocalNumber",
  "directSupervisorEmail",
  "workExperience",
  "currentEmployeeType",
  "separationsFlag",
  "org1Name",
  "org1Code",
  "org2Name",
  "org3Code",
];

/**
 * Merge a parsed HR row's mapped fields onto an existing `Employee`, applying
 * any `decision.edits` overrides on top. Preserves user-managed fields (see
 * `NEVER_DIFF_FIELDS` in `hrImportDiff.ts`). Returns the new employee object.
 */
function mergeEmployeeFromRow(
  current: Employee,
  parsed: Partial<Employee>,
  edits?: Record<string, unknown>,
): Employee {
  const next: Employee = { ...current };
  for (const key of HR_MERGE_FIELDS) {
    const v = parsed[key];
    if (v === undefined || v === "" || v === null) continue;
    (next as unknown as Record<string, unknown>)[key as string] = v as unknown;
  }
  if (edits) {
    for (const [k, v] of Object.entries(edits)) {
      if (v === undefined) continue;
      (next as unknown as Record<string, unknown>)[k] = v;
    }
  }
  // Re-derive displayName when not explicitly edited and the parser has both
  // first/last names — keeps existing behaviour from `addEmployee`.
  if (!edits || edits.displayName === undefined) {
    const fn = (next.firstName ?? "").trim();
    const ln = (next.lastName ?? "").trim();
    if (fn || ln) next.displayName = `${fn} ${ln}`.trim();
  }
  return next;
}

/**
 * Build a brand-new `Employee` from a parsed HR row + optional edits.
 * Defaults for fields the parser doesn't cover (`engagement`, `skills`,
 * `fteCapacity`) match the existing `addEmployee` action.
 */
function newEmployeeFromRow(
  localNumber: string,
  parsed: Partial<Employee>,
  edits?: Record<string, unknown>,
): Employee {
  const fn = (parsed.firstName ?? "").trim();
  const ln = (parsed.lastName ?? "").trim();
  const seed: Employee = {
    localNumber,
    firstName: fn,
    lastName: ln,
    displayName: parsed.displayName?.trim() || `${fn} ${ln}`.trim(),
    puCode: parsed.puCode ?? "",
    gradeCode: parsed.gradeCode ?? "",
    jobFunction: parsed.jobFunction ?? "CSS",
    locationCode: parsed.locationCode ?? "",
    startDate: parsed.startDate ?? "",
    endDate: parsed.endDate ?? null,
    fteCapacity: parsed.fteCapacity ?? 1,
    engagement: parsed.engagement ?? "",
    skills: [],
  };
  for (const key of HR_MERGE_FIELDS) {
    if (key in seed) continue;
    const v = parsed[key];
    if (v === undefined || v === "" || v === null) continue;
    (seed as unknown as Record<string, unknown>)[key as string] = v as unknown;
  }
  if (edits) {
    for (const [k, v] of Object.entries(edits)) {
      if (v === undefined) continue;
      (seed as unknown as Record<string, unknown>)[k] = v;
    }
  }
  return seed;
}

interface PerEmployeeAuditPlan {
  diff: HrEmployeeDiff;
  decision: HrImportRowDecision;
  before: Partial<Employee> | undefined;
  after: Partial<Employee>;
  action: "create" | "update";
}

function buildAuditSubset(emp: Employee, fields: Array<keyof Employee>): Partial<Employee> {
  const out: Partial<Employee> = {};
  for (const f of fields) {
    if (emp[f] !== undefined) (out as unknown as Record<string, unknown>)[f as string] = emp[f] as unknown;
  }
  return out;
}

/**
 * Implementation of `commitHrImport`. Lives outside the store factory so the
 * action body inside `create()` stays a one-liner. See hr_database_import.md
 * §7.3 (writes), §15 (audit fan-out), §18.4.
 */
function commitHrImportImpl(
  get: () => AppState,
  set: (patch: Partial<AppState>) => void,
  args: CommitHrImportArgs,
): { id: string } {
  const state = get();

  // Permission gate (§3) — store is authoritative even if the UI hides the
  // upload control. Throws so the UI can surface a user-readable message.
  if (!state.canImportHr(state.role)) {
    throw new Error("FORBIDDEN_HR_IMPORT");
  }

  const {
    preview,
    decisions,
    fileName,
    fileSize,
    durationMs,
    reportGeneratedAt,
    warnings,
    stalenessOverrideReason,
  } = args;

  // Staleness guard (F08) — store is authoritative even if UI pre-checks.
  if (
    state.lastHrImport &&
    preview.fileMonth < state.lastHrImport.month &&
    !stalenessOverrideReason
  ) {
    throw new Error("STALE_IMPORT");
  }

  const importId = uid("hri-");
  const now = new Date().toISOString();
  const actor = state.user.email || state.user.name || "system";

  const decisionByLocal = new Map<string, HrImportRowDecision>();
  for (const d of decisions) decisionByLocal.set(d.localNumber, d);

  // Snapshots are keyed by (localNumber, fileMonth); replace any existing one.
  const snapshotKey = (ln: string, p: string) => `${ln}::${p}`;
  const snapshotIndex = new Map<string, number>();
  const snapshotsNext: EmployeeMonthSnapshot[] = [...state.snapshots];
  for (let i = 0; i < snapshotsNext.length; i++) {
    snapshotIndex.set(
      snapshotKey(snapshotsNext[i].employeeLocalNumber, snapshotsNext[i].period),
      i,
    );
  }

  const employeesNext: Employee[] = [...state.employees];
  const employeeIdx = new Map<string, number>();
  for (let i = 0; i < employeesNext.length; i++) {
    employeeIdx.set(employeesNext[i].localNumber, i);
  }

  const joinersNext: Joiner[] = [...state.joiners];
  const leaversNext: Leaver[] = [...state.leavers];

  const counts = {
    rowsRead: preview.counts.rowsRead,
    rowsSkipped: 0,
    rowsRejected: preview.counts.rowsRejected,
    warnings: warnings.length,
    new: 0,
    changed: 0,
    unchanged: 0,
    leavers: 0,
    joiners: 0,
    rehires: 0,
    transfers: 0,
    missingFromFile: preview.counts.missingFromFile,
  };

  const auditPlans: PerEmployeeAuditPlan[] = [];

  for (const diff of preview.diffs) {
    if (diff.diffKind === "missing-from-file") continue; // informational only

    const decision = decisionByLocal.get(diff.localNumber);
    if (!decision) continue;
    if (decision.action === "skip") {
      counts.rowsSkipped += 1;
      continue;
    }

    const parsed = diff.parsedRow?.employee;
    const fileMonth = preview.fileMonth;

    if (diff.diffKind === "new-employee" && parsed) {
      const created = newEmployeeFromRow(diff.localNumber, parsed, decision.edits);
      employeesNext.push(created);
      employeeIdx.set(created.localNumber, employeesNext.length - 1);
      counts.new += 1;
      // Narrow the audit payload to the fields the diff identified as touched
      // (PII like `email`/`sex` is omitted unless it actually carried a value).
      const touchedNew = diff.fieldDiffs.map((d) => d.field);
      auditPlans.push({
        diff,
        decision,
        before: undefined,
        after: buildAuditSubset(created, touchedNew),
        action: "create",
      });
      // Snapshot
      writeSnapshot(snapshotsNext, snapshotIndex, created, fileMonth, true, false);
      // Joiner — trust the parser's `willCreateJoiner` flag (Hired YES/NO ||
      // Joiner?). Don't override it just because the start date sits in the
      // file month: the parser already considered that.
      if (diff.willCreateJoiner) {
        joinersNext.push({
          id: `j-hr-${importId}-${diff.localNumber}`,
          employeeLocalNumber: created.localNumber,
          firstName: created.firstName,
          lastName: created.lastName,
          puCode: created.puCode,
          gradeCode: created.gradeCode,
          locationCode: created.locationCode,
          role: created.jobFunction === "CSS" ? "CSS" : created.jobFunction,
          startDate: created.startDate,
          source: "HR",
          status: "actual",
        });
        counts.joiners += 1;
      }
      continue;
    }

    if (diff.diffKind === "changed" && parsed && diff.currentEmployee) {
      const before = diff.currentEmployee;
      const merged = mergeEmployeeFromRow(before, parsed, decision.edits);
      const idx = employeeIdx.get(diff.localNumber);
      if (idx !== undefined) employeesNext[idx] = merged;
      counts.changed += 1;
      const touched = diff.fieldDiffs.map((d) => d.field);
      auditPlans.push({
        diff,
        decision,
        before: buildAuditSubset(before, touched),
        after: buildAuditSubset(merged, touched),
        action: "update",
      });
      if (touched.includes("puCode") && before.puCode !== merged.puCode) {
        counts.transfers += 1;
      }
      writeSnapshot(snapshotsNext, snapshotIndex, merged, fileMonth, false, false);
      continue;
    }

    if (diff.diffKind === "re-hire" && parsed && diff.currentEmployee) {
      const before = diff.currentEmployee;
      const fileStart = parsed.startDate;
      const merged = mergeEmployeeFromRow(before, parsed, decision.edits);
      // Clear endDate (rehired) and apply new startDate when file provided one.
      merged.endDate = null;
      if (fileStart && (decision.edits?.startDate === undefined)) {
        merged.startDate = fileStart;
      }
      const idx = employeeIdx.get(diff.localNumber);
      if (idx !== undefined) employeesNext[idx] = merged;
      counts.rehires += 1;
      counts.changed += 1;
      const touched = Array.from(
        new Set([...diff.fieldDiffs.map((d) => d.field), "endDate" as keyof Employee, "startDate" as keyof Employee]),
      );
      auditPlans.push({
        diff,
        decision,
        before: buildAuditSubset(before, touched),
        after: buildAuditSubset(merged, touched),
        action: "update",
      });
      joinersNext.push({
        id: `j-hr-${importId}-${diff.localNumber}`,
        employeeLocalNumber: merged.localNumber,
        firstName: merged.firstName,
        lastName: merged.lastName,
        puCode: merged.puCode,
        gradeCode: merged.gradeCode,
        locationCode: merged.locationCode,
        role: merged.jobFunction === "CSS" ? "CSS" : merged.jobFunction,
        startDate: merged.startDate,
        source: "HR",
        status: "actual",
      });
      counts.joiners += 1;
      writeSnapshot(snapshotsNext, snapshotIndex, merged, fileMonth, true, false);
      continue;
    }

    if (diff.diffKind === "terminating" && parsed && diff.currentEmployee) {
      const before = diff.currentEmployee;
      const merged = mergeEmployeeFromRow(before, parsed, decision.edits);
      const term = diff.parsedRow?.dateOfTermination ?? null;
      if (term) merged.endDate = term;
      const idx = employeeIdx.get(diff.localNumber);
      if (idx !== undefined) employeesNext[idx] = merged;
      counts.leavers += 1;
      counts.changed += 1;
      const touched = Array.from(
        new Set([...diff.fieldDiffs.map((d) => d.field), "endDate" as keyof Employee]),
      );
      auditPlans.push({
        diff,
        decision,
        before: buildAuditSubset(before, touched),
        after: buildAuditSubset(merged, touched),
        action: "update",
      });
      const editedTerminationMethod = decision.edits?.terminationMethod as
        | string
        | undefined;
      const terminationMethod =
        editedTerminationMethod ??
        diff.parsedRow?.parsedTerminationMethod ??
        undefined;
      leaversNext.push({
        id: `l-hr-${importId}-${diff.localNumber}`,
        employeeLocalNumber: merged.localNumber,
        firstName: merged.firstName,
        lastName: merged.lastName,
        puCode: merged.puCode,
        gradeCode: merged.gradeCode,
        startDate: merged.startDate,
        endDate: term ?? merged.endDate ?? "",
        reason: "voluntary",
        engagement: before.engagement,
        terminationMethod,
      });
      writeSnapshot(snapshotsNext, snapshotIndex, merged, fileMonth, false, true);
      continue;
    }

    if (diff.diffKind === "unchanged" && diff.currentEmployee) {
      counts.unchanged += 1;
      writeSnapshot(snapshotsNext, snapshotIndex, diff.currentEmployee, fileMonth, false, false);
      continue;
    }
  }

  // Audit fan-out.
  const audits: AuditEntry[] = [];
  // Per-employee entries, newest-first within the import (file-order).
  for (const plan of auditPlans) {
    audits.push({
      id: uid("audit-"),
      actor,
      entityType: "employee",
      entityId: plan.diff.localNumber,
      action: plan.action,
      kind: "hr_import",
      before: plan.before,
      after: plan.after,
      ts: now,
      importId,
    });
  }
  // Umbrella entry — pushed last so it lands ABOVE per-employee entries when
  // we prepend the array (newest-first ordering).
  audits.push({
    id: uid("audit-"),
    actor,
    entityType: "import",
    entityId: importId,
    action: "create",
    kind: "hr_import",
    after: {
      fileName,
      fileMonth: preview.fileMonth,
      counts,
      stalenessOverrideReason,
    },
    ts: now,
    importId,
  });

  const hrImport: HrImport = {
    id: importId,
    fileName,
    fileMonth: preview.fileMonth,
    reportGeneratedAt: reportGeneratedAt ?? undefined,
    importedAt: now,
    importedBy: actor,
    durationMs,
    counts,
    warnings,
    // Re-stamp importId on every persisted decision so they back-reference the
    // umbrella record (§18.2). The walker hard-codes a "pending" placeholder.
    rowDecisions: decisions.map((d) => ({ ...d, importId })),
    stalenessOverrideReason,
  };
  void fileSize; // currently not persisted; reserved for §13 file panel.

  set({
    employees: employeesNext,
    snapshots: snapshotsNext,
    joiners: joinersNext,
    leavers: leaversNext,
    hrImports: [hrImport, ...state.hrImports],
    lastHrImport: {
      id: importId,
      month: preview.fileMonth,
      importedAt: now,
      importedBy: actor,
    },
    audit: [...audits.reverse(), ...state.audit].slice(0, 2000),
  });

  return { id: importId };
}

function writeSnapshot(
  snapshots: EmployeeMonthSnapshot[],
  index: Map<string, number>,
  emp: Employee,
  fileMonth: string,
  isJoiner: boolean,
  isLeaver: boolean,
) {
  const key = `${emp.localNumber}::${fileMonth}`;
  const snap: EmployeeMonthSnapshot = {
    employeeLocalNumber: emp.localNumber,
    period: fileMonth,
    puCode: emp.puCode,
    gradeCode: emp.gradeCode,
    fteAssigned: emp.fteCapacity ?? 1,
    bfte: 0,
    arve: 0,
    projectHours: 0,
    vacationHours: 0,
    learningHours: 0,
    managementHours: 0,
    isJoiner,
    isLeaver,
    isMover: false,
  };
  const idx = index.get(key);
  if (idx !== undefined) snapshots[idx] = snap;
  else {
    snapshots.push(snap);
    index.set(key, snapshots.length - 1);
  }
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
  addHrMapping: unknown;
  updateHrMapping: unknown;
  removeHrMapping: unknown;
  resolveHrMapping: unknown;
  canImportHr: unknown;
  canOverrideStaleness: unknown;
  buildResolvePuFn: unknown;
  commitHrImport: unknown;
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

    hrMappings: seedHrMappings(demo.productionUnits),
    hrImports: [],
    lastHrImport: undefined,

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
        const state = get();
        const employee: Employee = {
          ...e,
          displayName: e.displayName ?? `${e.firstName} ${e.lastName}`,
          skills: e.skills ?? [],
        };
        const audit: AuditEntry = {
          id: uid("audit-"),
          actor: state.user.email,
          entityType: "employee",
          entityId: employee.localNumber,
          action: "create",
          kind: "user_edit",
          after: employee,
          ts: now,
        };
        set({ employees: [employee, ...state.employees], audit: [audit, ...state.audit].slice(0, 2000) });
      },

      addJoiner: (j) => {
        const now = new Date().toISOString();
        const state = get();
        const joiner: Joiner = { ...j, id: uid("j-") };
        const audit: AuditEntry = {
          id: uid("audit-"),
          actor: state.user.email,
          entityType: "employee",
          entityId: joiner.employeeLocalNumber ?? joiner.id,
          action: "create",
          kind: "joiner",
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
        const state = get();
        const leaver: Leaver = { ...l, id: uid("l-") };
        const employees = state.employees.map((e) =>
          e.localNumber === leaver.employeeLocalNumber ? { ...e, endDate: leaver.endDate } : e,
        );
        const audit: AuditEntry = {
          id: uid("audit-"),
          actor: state.user.email,
          entityType: "employee",
          entityId: leaver.employeeLocalNumber,
          action: "create",
          kind: "leaver",
          after: leaver,
          ts: now,
        };
        set({
          leavers: [leaver, ...state.leavers],
          employees,
          audit: [audit, ...state.audit].slice(0, 2000),
        });
      },

      transferEmployee: ({ localNumber, toPuCode, effectivePeriod, reason }) => {
        const state = get();
        const emp = state.employees.find((e) => e.localNumber === localNumber);
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
          recordedBy: state.user.name,
          reason,
        };
        const employees = state.employees.map((e) =>
          e.localNumber === localNumber ? { ...e, puCode: toPuCode } : e,
        );
        const audit: AuditEntry = {
          id: uid("audit-"),
          actor: state.user.email,
          entityType: "employee",
          entityId: localNumber,
          action: "update",
          kind: "transfer",
          before: { puCode: emp.puCode },
          after: { puCode: toPuCode, effectivePeriod, reason },
          ts: now,
        };
        set({
          transfers: [transfer, ...state.transfers],
          employees,
          audit: [audit, ...state.audit].slice(0, 2000),
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
        const state = get();
        const emp = state.employees.find((e) => e.localNumber === localNumber);
        if (!emp) return;
        const before = emp.capabilities ?? [];
        const after = [...capabilityIds];
        const audit: AuditEntry = {
          id: uid("audit-"),
          actor: state.user.email,
          entityType: "employee",
          entityId: localNumber,
          action: "update",
          kind: "capability_change",
          before,
          after,
          ts: new Date().toISOString(),
        };
        set({
          employees: state.employees.map((e) =>
            e.localNumber === localNumber ? { ...e, capabilities: after } : e,
          ),
          audit: [audit, ...state.audit].slice(0, 2000),
        });
      },

      setEmployeeGermanSpeaker: (localNumber, v) => {
        const state = get();
        const emp = state.employees.find((e) => e.localNumber === localNumber);
        if (!emp) return;
        const audit: AuditEntry = {
          id: uid("audit-"),
          actor: state.user.email,
          entityType: "employee",
          entityId: localNumber,
          action: "update",
          kind: "user_edit",
          before: { germanSpeaker: emp.germanSpeaker },
          after: { germanSpeaker: v },
          ts: new Date().toISOString(),
        };
        set({
          employees: state.employees.map((e) =>
            e.localNumber === localNumber ? { ...e, germanSpeaker: v } : e,
          ),
          audit: [audit, ...state.audit].slice(0, 2000),
        });
      },

      setEmployeeClearanceLevel: (localNumber, v) => {
        const state = get();
        const emp = state.employees.find((e) => e.localNumber === localNumber);
        if (!emp) return;
        const audit: AuditEntry = {
          id: uid("audit-"),
          actor: state.user.email,
          entityType: "employee",
          entityId: localNumber,
          action: "update",
          kind: "user_edit",
          before: { clearanceLevel: emp.clearanceLevel },
          after: { clearanceLevel: v },
          ts: new Date().toISOString(),
        };
        set({
          employees: state.employees.map((e) =>
            e.localNumber === localNumber ? { ...e, clearanceLevel: v } : e,
          ),
          audit: [audit, ...state.audit].slice(0, 2000),
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
        set({ ...s });
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

      addHrMapping: (entry) => {
        if (get().role !== "controller") return;
        const state = get();
        const source = entry.source.trim();
        if (!source) return;
        const normalized = source.toLowerCase();
        const dup = state.hrMappings.some(
          (m) => m.kind === entry.kind && m.source.trim().toLowerCase() === normalized && m.active,
        );
        if (dup) return;
        const now = new Date().toISOString();
        const created: HrMappingEntry = {
          id: uid("hrm-"),
          kind: entry.kind,
          source,
          targetCode: entry.targetCode,
          note: entry.note,
          createdAt: now,
          createdBy: state.user.email || state.user.name || "system",
          active: true,
        };
        set({ hrMappings: [...state.hrMappings, created] });
      },

      updateHrMapping: (id, patch) => {
        if (get().role !== "controller") return;
        const state = get();
        if (!state.hrMappings.some((m) => m.id === id)) return;
        set({
          hrMappings: state.hrMappings.map((m) =>
            m.id === id
              ? {
                  ...m,
                  ...patch,
                  id: m.id,
                  createdAt: m.createdAt,
                  createdBy: m.createdBy,
                  source: patch.source !== undefined ? patch.source.trim() : m.source,
                }
              : m,
          ),
        });
      },

      removeHrMapping: (id) => {
        if (get().role !== "controller") return;
        set({ hrMappings: get().hrMappings.filter((m) => m.id !== id) });
      },

      resolveHrMapping: (kind, source) => {
        const needle = source.trim().toLowerCase();
        if (!needle) return undefined;
        const hit = get().hrMappings.find(
          (m) => m.active && m.kind === kind && m.source.trim().toLowerCase() === needle,
        );
        return hit?.targetCode;
      },

      canImportHr: (role) => role === "controller" || role === "hr",

      canOverrideStaleness: (role) => role === "controller",

      buildResolvePuFn: () => {
        const mappings = get().hrMappings;
        return (rawValue: string) => {
          const needle = rawValue.trim().toLowerCase();
          if (!needle) return { code: "", via: "none" as const };
          const hit = mappings.find(
            (m) => m.active && m.kind === "production_unit" && m.source.trim().toLowerCase() === needle,
          );
          if (hit) return { code: hit.targetCode, via: "mapping" as const };
          const heuristic = inferPuCode(rawValue);
          return { code: heuristic, via: "heuristic" as const };
        };
      },

      commitHrImport: (args) => commitHrImportImpl(get, set, args),
    }),
    {
      name: STORAGE_KEY,
      version: 3,
      storage: createJSONStorage(() => quotaSafeStorage()),
      migrate: (persisted, version) => migratePersistedState(persisted, version),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        if (!Array.isArray(state.workingCalendar) || state.workingCalendar.length === 0) {
          state.workingCalendar = seedWorkingCalendar(2024, 2028);
        }
        if (Array.isArray(state.projects)) {
          state.projects = state.projects.map((p) => ({ ...p, kind: p.kind ?? "project" }));
        }
        if (!Array.isArray(state.hrMappings) || state.hrMappings.length === 0) {
          state.hrMappings = seedHrMappings(state.productionUnits);
        }
        if (!Array.isArray(state.hrImports)) state.hrImports = [];
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
        workingCalendar: s.workingCalendar,
        hrMappings: s.hrMappings,
        hrImports: s.hrImports,
        lastHrImport: s.lastHrImport,
      }),
    },
  ),
);

