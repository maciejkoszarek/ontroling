// Domain model for CCA PracticeView
// All ids are short codes where possible to keep payloads readable.

export type Period = string; // "YYYY-MM"

export type Role = "controller" | "pu_lead" | "finance" | "hr" | "viewer";

export interface ProductionUnit {
  code: string; // e.g. "PL01NC03"
  shortName: string; // "CCA_SE1"
  displayName: string; // "CCA_Developers1"
  sbu: string;
  bu: string;
  parentCode?: string | null; // for CCA_SE_total rolling up SE1..SE5
  sortOrder: number;
  active: boolean;
  isVirtual?: boolean; // CCA_SE_total / CCA_Total
}

export interface Sbu {
  code: string;
  displayName: string;
  sortOrder?: number;
}

export interface Bu {
  code: string;
  displayName: string;
  sbuCode: string;
  sortOrder?: number;
}

export interface MarketUnit {
  code: string;
  displayName: string;
  buCode: string;
}

export interface WorkingCalendarEntry {
  period: Period;
  workingDays: number;
  workingHours: number;
}

export interface Location {
  code: string;
  displayName: string;
  country: string;
}

export interface Grade {
  code: string; // A5, B1, C1, NG, Z, …
  family: "intern" | "dev" | "senior" | "contractor" | "management";
  sortOrder: number;
  isContractor: boolean;
}

export type JobFunction = "CSS" | "EEC" | "Z";

export type ProjectKind = "project" | "opportunity" | "ambition";

export interface Project {
  projectNumber: string;
  name: string;
  customer: string;
  marketUnit: string;
  kind: ProjectKind;
  isBillable: boolean;
  status: "active" | "completed" | "unknown";
  startDate?: string;
  endDate?: string;
  tags: string[];
  description?: string;
  /**
   * Probability that this engagement's FTE demand materializes. In [0, 1].
   * Kind `project` is always 1.0 (committed); `opportunity` defaults to 0.5;
   * `ambition` defaults to 0.3. Resolve via `getCommitProbability`. I30.
   */
  commitProbability?: number;
}

export type ClearanceLevel = "none" | "SU1" | "SU2";

export interface Capability {
  id: string;
  name: string;
  category?: string;
}

export interface Employee {
  localNumber: string; // P0028743
  ggid?: string;
  firstName: string;
  lastName: string;
  displayName: string;
  puCode: string;
  gradeCode: string;
  jobFunction: JobFunction;
  locationCode: string;
  startDate: string;
  endDate?: string | null;
  fteCapacity: number;
  engagement: string;
  skills: string[];
  capabilities?: string[]; // Capability ids
  germanSpeaker?: boolean;
  clearanceLevel?: ClearanceLevel;
  /**
   * Forecast-only placeholder for unstaffed demand on `ambition` /
   * `opportunity` projects (e.g. "Senior consultant we don't have yet").
   * Excluded from practice headcount, attrition, and the People directory;
   * still flows into project FTE demand and the project ARVE chart.
   */
  isPlaceholder?: boolean;
  /** Free-text role label, e.g. "Senior consultant", "Cloud architect". Only meaningful when `isPlaceholder`. */
  placeholderRole?: string;

  // Optional fields populated from HR Database import (see hr_database_import.md §8).
  // All optional so existing data still typechecks.
  email?: string;
  sex?: "M" | "F" | "Other";
  hrFileNumber?: string;
  contractEndDate?: string | null;
  releaseDate?: string | null;
  practice?: string;
  pnlUnit?: string;
  qualification?: string;
  jobNameModel?: string;
  positionPl?: string;
  positionEn?: string;
  contractManagerName?: string;
  contractManagerLocalNumber?: string;
  contractManagerEmail?: string;
  directSupervisorName?: string;
  directSupervisorLocalNumber?: string;
  directSupervisorEmail?: string;
  workExperience?: string;
  currentEmployeeType?: string;
  separationsFlag?: string;
  org1Name?: string;
  org1Code?: string;
  org2Name?: string;
  org3Code?: string;
}

export interface EmployeeMonthSnapshot {
  employeeLocalNumber: string;
  period: Period;
  puCode: string;
  gradeCode: string;
  fteAssigned: number;
  bfte: number;
  arve: number; // 0..1.2
  projectHours: number;
  vacationHours: number;
  learningHours: number;
  managementHours: number;
  isJoiner: boolean;
  isLeaver: boolean;
  isMover: boolean;
}

export type ForecastMetric =
  | "HC_BEGIN"
  | "HC_END"
  | "JOINERS"
  | "LEAVERS"
  | "FTE"
  | "BFTE"
  | "F1"
  | "F2"
  | "F_TOTAL"
  | "ARVE_PCT"
  // Overlays on HC→FTE (Excel rows 98-107)
  | "FTE_LOST"
  | "OVERTIME_FTE"
  | "UNPAID_LEAVE_FTE"
  | "VACATION_FTE"
  | "SICKNESS_FTE"
  | "FTE_CSS" // FTE after overtime/unpaid leave, before vacation
  | "ARVE_BASE" // FTE_CSS − vacation − unpaid leave (row 107)
  // IDC / non-billable breakdown (Excel rows 123-138)
  | "BENCH_FTE"
  | "LND_FTE" // Learning & Development (Standard + Onboarding)
  | "RECRUITMENT_FTE"
  | "MAN_FTE" // Management reserve/other/storm
  | "RESERVE_FTE"
  | "BDC_SOLD_FTE"
  | "BDC_PL_FTE"
  | "INTERNAL_PROJECTS_FTE"
  // Students / intern bucket
  | "STUDENTS_HC"
  // Ratios (0..1)
  | "BENCH_PCT"
  | "LND_PCT"
  | "VACATION_PCT"
  | "ARVI_PCT";

export interface ForecastCell {
  cycleId: string;
  puCode: string;
  period: Period;
  metric: ForecastMetric;
  value: number;
  grade?: string; // optional grade axis; undefined means "all grades"
  mu?: string; // optional MU axis; undefined means "all MUs"
  enteredBy?: string;
  enteredAt?: string;
  comment?: string;
  source: "manual" | "auto_baseline" | "scenario_promote" | "ingestion" | "seed";
}

export interface BudgetCell {
  year: number;
  puCode: string;
  period: Period;
  metric: ForecastMetric;
  value: number;
}

export type CycleStatus = "open" | "editing" | "reconciling" | "locked" | "archived";

export interface ForecastCycle {
  id: string;
  label: string; // "FC April 2026"
  periodOpened: Period;
  status: CycleStatus;
  prevCycleId?: string;
  openedBy: string;
  openedAt?: string;
  lockedBy?: string;
  lockedAt?: string;
  archivedBy?: string;
  archivedAt?: string;
  // legacy fields kept for backwards compatibility with seeded data
  closedBy?: string;
  closedAt?: string;
}

export interface Joiner {
  id: string;
  employeeLocalNumber?: string;
  firstName: string;
  lastName: string;
  puCode: string;
  gradeCode: string;
  locationCode: string;
  role: string;
  startDate: string;
  source: "ATS" | "HR" | "referral" | "pipeline";
  status: "planned" | "actual";
}

export interface Leaver {
  id: string;
  employeeLocalNumber: string;
  firstName: string;
  lastName: string;
  puCode: string;
  gradeCode: string;
  startDate: string;
  endDate: string;
  reason: "voluntary" | "involuntary" | "contract_end" | "other";
  engagement: string;
  /** HR file column 15: "The method of contract termination" (§8). */
  terminationMethod?: string;
}

export interface ContractOfMandate {
  employeeLocalNumber: string;
  period: Period;
  puCode: string;
  locationCode: string;
  active: boolean;
}

export interface Transfer {
  id: string;
  employeeLocalNumber: string;
  fromPuCode: string;
  toPuCode: string;
  effectivePeriod: Period;
  recordedAt: string;
  recordedBy: string;
  reason?: string;
}

export interface Promotion {
  id: string;
  employeeLocalNumber: string;
  fromGradeCode: string;
  toGradeCode: string;
  effectivePeriod: Period;
  recordedAt: string;
  recordedBy: string;
  reason?: string;
}

export interface PipelineOpportunity {
  id: string;
  name: string;
  marketUnit: string;
  period: Period;
  fteDemand: number;
  winProbability: number; // 0..1
  weightedFte: number; // derived
  owner: string;
  status: "lead" | "qualified" | "proposal" | "won" | "lost";
}

export interface ProjectDemandForecast {
  projectNumber: string;
  period: Period;
  fteDemand: number;
}

export interface GfsHours {
  employeeLocalNumber: string;
  period: Period;
  projectNumber: string;
  projectType: string;
  hours: number;
}

export interface Comment {
  id: string;
  entityType: "pu" | "mu" | "employee" | "cell" | "cycle";
  entityId: string;
  period?: Period;
  body: string;
  author: string;
  mentions: string[];
  parentId?: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface AuditEntry {
  id: string;
  actor: string;
  entityType: string;
  entityId: string;
  action:
    | "create"
    | "update"
    | "delete"
    | "approve"
    | "submit"
    | "waive"
    | "open"
    | "close"
    | "start_editing"
    | "start_reconciling"
    | "lock"
    | "unlock"
    | "archive";
  before?: unknown;
  after?: unknown;
  ts: string;
  requestId?: string;
  /** Categorises the audit entry for the per-person change-history view (see hr_database_import.md §14). */
  kind?:
    | "hr_import"
    | "user_edit"
    | "transfer"
    | "joiner"
    | "leaver"
    | "capability_change"
    | "mapping_change";
  /** Back-reference to `HrImport.id` when `kind === "hr_import"`. */
  importId?: string;
}

export interface HrMappingEntry {
  id: string;
  kind: "production_unit" | "people_unit" | "location" | "grade";
  source: string; // raw value from HR file (case- and whitespace-insensitive match)
  targetCode: string; // PU/location/grade code in app
  note?: string;
  createdAt: string;
  createdBy: string;
  active: boolean;
}

export interface HrImportWarning {
  code: "R01" | "R02" | "R03" | "R04" | "R05" | "R07" | "R08" | "R09" | "R10";
  localNumber: string;
  message: string;
}

export interface HrImportRowDecision {
  importId: string;
  localNumber: string;
  diffKind:
    | "new-employee"
    | "changed"
    | "unchanged"
    | "re-hire"
    | "terminating"
    | "missing-from-file"
    | "skipped";
  fieldDiffs: Array<{ field: string; before: unknown; after: unknown }>;
  decidedBy: string;
  decidedAt: string;
  action: "accept" | "edit-accept" | "skip";
  edits?: Record<string, unknown>;
}

export interface HrImport {
  id: string;
  fileName: string;
  fileMonth: Period; // YYYY-MM
  reportGeneratedAt?: string;
  importedAt: string;
  importedBy: string;
  durationMs: number;
  counts: {
    rowsRead: number;
    rowsSkipped: number;
    rowsRejected: number;
    warnings: number;
    new: number;
    changed: number;
    unchanged: number;
    leavers: number;
    joiners: number;
    rehires: number;
    transfers: number;
    missingFromFile: number;
  };
  warnings: HrImportWarning[];
  rowDecisions: HrImportRowDecision[];
  stalenessOverrideReason?: string;
}

export interface Anomaly {
  id: string;
  period: Period;
  scope: "pu" | "mu" | "employee" | "project";
  scopeId: string;
  kind: string;
  severity: "info" | "warning" | "critical";
  message: string;
  resolvedAt?: string;
}

export interface Scenario {
  id: string;
  name: string;
  description: string;
  baseCycleId: string;
  owner: string;
  status: "draft" | "shared" | "promoted";
  createdAt: string;
  changes: ScenarioChange[];
}

export interface ScenarioChange {
  id: string;
  type: "add_joiner" | "remove_leaver" | "project_ramp" | "ramp_arve" | "headcount_delta";
  payload: Record<string, unknown>;
  effectivePeriod: Period;
}

export interface DQCheckResult {
  id: string;
  name: string;
  description: string;
  severity: "info" | "warning" | "critical";
  status: "pass" | "fail" | "waived";
  failingRows?: unknown[];
  waivedBy?: string;
  waivedComment?: string;
}

export interface AppFilter {
  pu?: string;
  mu?: string;
  location?: string;
  grade?: string;
  role?: JobFunction;
  periodFrom?: Period;
  periodTo?: Period;
}
