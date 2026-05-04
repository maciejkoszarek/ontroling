import { beforeEach, describe, expect, it } from "vitest";
import { useAppStore } from "./store";
import type {
  AuditEntry,
  Employee,
  HrImportRowDecision,
  HrImportWarning,
} from "./types";
import type { HrImportPreview, HrEmployeeDiff } from "./lib/hrImportDiff";
import type { HrParsedRow } from "./lib/hrDbParser";

function reset() {
  localStorage.clear();
  useAppStore.getState().resetToDemo();
  useAppStore.setState({
    role: "controller",
    audit: [],
    hrImports: [],
    lastHrImport: undefined,
    user: { name: "Tester", email: "tester@example.com", puCode: "PL01NC03" },
  });
}

function makeParsedRow(emp: Partial<Employee> & { localNumber: string }, opts: Partial<HrParsedRow> = {}): HrParsedRow {
  return {
    rowIndex: 0,
    rawEmployeeNumber: emp.localNumber,
    rawEmployeeNumberDup: emp.localNumber,
    fileMonth: "2026-04",
    employee: emp,
    joinerYes: false,
    leaverYes: false,
    dateOfTermination: null,
    dateOfEndContract: null,
    dateOfRelease: null,
    parsedTerminationMethod: null,
    reportGeneratedAt: null,
    resolvedPuCode: emp.puCode ?? null,
    resolvedPuVia: "mapping",
    rawProductionUnit: emp.puCode ?? "",
    rawPeopleUnit: "",
    rawLocation: emp.locationCode ?? "",
    rowWarnings: [],
    rowErrors: [],
    ...opts,
  };
}

function emptyPreview(fileMonth = "2026-05"): HrImportPreview {
  return {
    fileMonth,
    reportGeneratedAt: null,
    diffs: [],
    rejectedRows: [],
    fileWarningSummary: {},
    counts: {
      rowsRead: 0,
      rowsRejected: 0,
      new: 0,
      changed: 0,
      unchanged: 0,
      rehires: 0,
      terminating: 0,
      missingFromFile: 0,
      joiners: 0,
      leavers: 0,
    },
  };
}

function commit(preview: HrImportPreview, decisions: HrImportRowDecision[], opts: { stalenessOverrideReason?: string; warnings?: HrImportWarning[] } = {}) {
  return useAppStore.getState().commitHrImport({
    preview,
    decisions,
    fileName: "HR_Database_2026_05.xlsx",
    fileSize: 1024,
    durationMs: 1100,
    reportGeneratedAt: null,
    warnings: opts.warnings ?? [],
    stalenessOverrideReason: opts.stalenessOverrideReason,
  });
}

function decisionFor(diff: HrEmployeeDiff, action: HrImportRowDecision["action"] = "accept", edits?: Record<string, unknown>): HrImportRowDecision {
  return {
    importId: "pending",
    localNumber: diff.localNumber,
    diffKind:
      diff.diffKind === "missing-from-file" ? "missing-from-file" : diff.diffKind,
    fieldDiffs: diff.fieldDiffs.map((f) => ({ field: String(f.field), before: f.before, after: f.after })),
    decidedBy: "tester@example.com",
    decidedAt: new Date().toISOString(),
    action,
    edits,
  };
}

describe("store — commitHrImport", () => {
  beforeEach(reset);

  it("commits an empty preview with one umbrella audit + an HrImport record", () => {
    const before = useAppStore.getState();
    const preview = emptyPreview("2026-05");
    const { id } = commit(preview, []);

    const state = useAppStore.getState();
    expect(state.hrImports.length).toBe(1);
    expect(state.hrImports[0].id).toBe(id);
    expect(state.hrImports[0].fileMonth).toBe("2026-05");
    expect(state.lastHrImport?.id).toBe(id);
    expect(state.lastHrImport?.month).toBe("2026-05");

    // Employees / snapshots / joiners / leavers untouched.
    expect(state.employees.length).toBe(before.employees.length);
    expect(state.snapshots.length).toBe(before.snapshots.length);
    expect(state.joiners.length).toBe(before.joiners.length);
    expect(state.leavers.length).toBe(before.leavers.length);

    const importAudits = state.audit.filter((a) => a.kind === "hr_import");
    expect(importAudits.length).toBe(1);
    expect(importAudits[0].entityType).toBe("import");
    expect(importAudits[0].entityId).toBe(id);
    expect(importAudits[0].action).toBe("create");
    expect(importAudits[0].importId).toBe(id);
  });

  it("commits one new-employee accept: appends employee, snapshot, joiner, audits", () => {
    const newRow = makeParsedRow({
      localNumber: "P9999991",
      firstName: "Jane",
      lastName: "Doe",
      puCode: "PL01NC03",
      gradeCode: "A5",
      jobFunction: "CSS",
      locationCode: "WRO",
      startDate: "2026-05-15",
      fteCapacity: 1,
      engagement: "PL01NC03",
    }, { joinerYes: true });
    const diff: HrEmployeeDiff = {
      localNumber: "P9999991",
      diffKind: "new-employee",
      parsedRow: newRow,
      fieldDiffs: [],
      willCreateJoiner: true,
      willCreateLeaver: false,
    };
    const preview: HrImportPreview = {
      ...emptyPreview("2026-05"),
      diffs: [diff],
      counts: { ...emptyPreview().counts, rowsRead: 1, new: 1, joiners: 1 },
    };

    const { id } = commit(preview, [decisionFor(diff, "accept")]);
    const state = useAppStore.getState();

    expect(state.employees.find((e) => e.localNumber === "P9999991")?.firstName).toBe("Jane");
    expect(state.snapshots.find((s) => s.employeeLocalNumber === "P9999991" && s.period === "2026-05")?.isJoiner).toBe(true);
    expect(state.joiners.some((j) => j.id === `j-hr-${id}-P9999991`)).toBe(true);

    const empAudits = state.audit.filter(
      (a: AuditEntry) => a.kind === "hr_import" && a.entityType === "employee" && a.entityId === "P9999991",
    );
    expect(empAudits.length).toBe(1);
    expect(empAudits[0].action).toBe("create");
    expect(empAudits[0].importId).toBe(id);

    const umbrella = state.audit.find((a) => a.kind === "hr_import" && a.entityType === "import");
    expect(umbrella?.importId).toBe(id);
  });

  it("commits a terminating decision: sets endDate, appends leaver, audits before/after", () => {
    const target = useAppStore.getState().employees[0];
    const parsed = makeParsedRow(
      {
        localNumber: target.localNumber,
        firstName: target.firstName,
        lastName: target.lastName,
        puCode: target.puCode,
        gradeCode: target.gradeCode,
        jobFunction: target.jobFunction,
        locationCode: target.locationCode,
        startDate: target.startDate,
        endDate: "2026-05-20",
        fteCapacity: target.fteCapacity,
        engagement: target.engagement,
      },
      { leaverYes: true, dateOfTermination: "2026-05-20" },
    );
    const diff: HrEmployeeDiff = {
      localNumber: target.localNumber,
      diffKind: "terminating",
      parsedRow: parsed,
      currentEmployee: target,
      fieldDiffs: [{ field: "endDate", before: target.endDate ?? undefined, after: "2026-05-20" }],
      willCreateJoiner: false,
      willCreateLeaver: true,
    };
    const preview: HrImportPreview = {
      ...emptyPreview("2026-05"),
      diffs: [diff],
      counts: { ...emptyPreview().counts, rowsRead: 1, terminating: 1, leavers: 1 },
    };

    const { id } = commit(preview, [decisionFor(diff, "edit-accept", { terminationMethod: "Resignation" })]);
    const state = useAppStore.getState();

    const updatedEmp = state.employees.find((e) => e.localNumber === target.localNumber);
    expect(updatedEmp?.endDate).toBe("2026-05-20");
    const leaver = state.leavers.find((l) => l.id === `l-hr-${id}-${target.localNumber}`);
    expect(leaver).toBeDefined();
    expect(leaver?.endDate).toBe("2026-05-20");
    expect(leaver?.terminationMethod).toBe("Resignation");

    const empAudit = state.audit.find(
      (a) => a.kind === "hr_import" && a.entityType === "employee" && a.entityId === target.localNumber,
    );
    expect(empAudit).toBeDefined();
    expect((empAudit?.before as { endDate?: unknown }).endDate ?? null).toBe(target.endDate ?? null);
    expect((empAudit?.after as { endDate?: string }).endDate).toBe("2026-05-20");
  });

  it("commits a re-hire decision: clears endDate, appends joiner", () => {
    // Make the first employee already a leaver in the past.
    const target = useAppStore.getState().employees[0];
    useAppStore.setState({
      employees: useAppStore.getState().employees.map((e) =>
        e.localNumber === target.localNumber ? { ...e, endDate: "2025-12-31" } : e,
      ),
    });
    const fresh = useAppStore.getState().employees.find((e) => e.localNumber === target.localNumber)!;
    const parsed = makeParsedRow(
      {
        localNumber: fresh.localNumber,
        firstName: fresh.firstName,
        lastName: fresh.lastName,
        puCode: fresh.puCode,
        gradeCode: fresh.gradeCode,
        jobFunction: fresh.jobFunction,
        locationCode: fresh.locationCode,
        startDate: "2026-05-01",
        fteCapacity: 1,
        engagement: fresh.engagement,
      },
      { joinerYes: true },
    );
    const diff: HrEmployeeDiff = {
      localNumber: fresh.localNumber,
      diffKind: "re-hire",
      parsedRow: parsed,
      currentEmployee: fresh,
      fieldDiffs: [],
      willCreateJoiner: true,
      willCreateLeaver: false,
    };
    const preview: HrImportPreview = {
      ...emptyPreview("2026-05"),
      diffs: [diff],
      counts: { ...emptyPreview().counts, rowsRead: 1, rehires: 1, joiners: 1 },
    };

    const { id } = commit(preview, [decisionFor(diff, "accept")]);
    const state = useAppStore.getState();
    const updated = state.employees.find((e) => e.localNumber === fresh.localNumber);
    expect(updated?.endDate).toBeNull();
    expect(updated?.startDate).toBe("2026-05-01");
    expect(state.joiners.some((j) => j.id === `j-hr-${id}-${fresh.localNumber}`)).toBe(true);
  });

  it("throws STALE_IMPORT when fileMonth < lastHrImport.month and no override", () => {
    useAppStore.setState({
      lastHrImport: {
        id: "older",
        month: "2026-06",
        importedAt: new Date().toISOString(),
        importedBy: "tester@example.com",
      },
    });
    const preview = emptyPreview("2026-04");
    expect(() => commit(preview, [])).toThrowError(/STALE_IMPORT/);
  });

  it("succeeds with stalenessOverrideReason and records it on the umbrella audit", () => {
    useAppStore.setState({
      lastHrImport: {
        id: "older",
        month: "2026-06",
        importedAt: new Date().toISOString(),
        importedBy: "tester@example.com",
      },
    });
    const preview = emptyPreview("2026-04");
    const { id } = commit(preview, [], { stalenessOverrideReason: "HR resent April file with corrections" });

    const state = useAppStore.getState();
    const umbrella = state.audit.find((a) => a.kind === "hr_import" && a.entityType === "import" && a.importId === id);
    expect(umbrella).toBeDefined();
    expect((umbrella?.after as { stalenessOverrideReason?: string }).stalenessOverrideReason).toBe(
      "HR resent April file with corrections",
    );
  });

  it("preserves user-managed fields across a changed merge", () => {
    const target = useAppStore.getState().employees[0];
    // Stage user-managed values that the file should not overwrite.
    useAppStore.setState({
      employees: useAppStore.getState().employees.map((e) =>
        e.localNumber === target.localNumber
          ? {
              ...e,
              capabilities: ["cap-java", "cap-react"],
              germanSpeaker: true,
              clearanceLevel: "SU2" as const,
              ggid: "GG-12345",
            }
          : e,
      ),
    });
    const fresh = useAppStore.getState().employees.find((e) => e.localNumber === target.localNumber)!;
    const newPu = fresh.puCode === "PL01NC03" ? "PL01NC04" : "PL01NC03";
    const parsed = makeParsedRow({
      localNumber: fresh.localNumber,
      firstName: fresh.firstName,
      lastName: fresh.lastName,
      puCode: newPu,
      gradeCode: fresh.gradeCode,
      jobFunction: fresh.jobFunction,
      locationCode: fresh.locationCode,
      startDate: fresh.startDate,
      fteCapacity: fresh.fteCapacity,
      engagement: newPu,
    });
    const diff: HrEmployeeDiff = {
      localNumber: fresh.localNumber,
      diffKind: "changed",
      parsedRow: parsed,
      currentEmployee: fresh,
      fieldDiffs: [{ field: "puCode", before: fresh.puCode, after: newPu }],
      willCreateJoiner: false,
      willCreateLeaver: false,
    };
    const preview: HrImportPreview = {
      ...emptyPreview("2026-05"),
      diffs: [diff],
      counts: { ...emptyPreview().counts, rowsRead: 1, changed: 1 },
    };
    commit(preview, [decisionFor(diff, "accept")]);

    const state = useAppStore.getState();
    const updated = state.employees.find((e) => e.localNumber === fresh.localNumber)!;
    expect(updated.puCode).toBe(newPu);
    expect(updated.capabilities).toEqual(["cap-java", "cap-react"]);
    expect(updated.germanSpeaker).toBe(true);
    expect(updated.clearanceLevel).toBe("SU2");
    expect(updated.ggid).toBe("GG-12345");
  });

  it("terminating decision without edits writes Leaver.terminationMethod from the parsed file value", () => {
    const target = useAppStore.getState().employees[0];
    const parsed = makeParsedRow(
      {
        localNumber: target.localNumber,
        firstName: target.firstName,
        lastName: target.lastName,
        puCode: target.puCode,
        gradeCode: target.gradeCode,
        jobFunction: target.jobFunction,
        locationCode: target.locationCode,
        startDate: target.startDate,
        endDate: "2026-05-20",
        fteCapacity: target.fteCapacity,
        engagement: target.engagement,
      },
      {
        leaverYes: true,
        dateOfTermination: "2026-05-20",
        parsedTerminationMethod: "Mutual agreement",
      },
    );
    const diff: HrEmployeeDiff = {
      localNumber: target.localNumber,
      diffKind: "terminating",
      parsedRow: parsed,
      currentEmployee: target,
      fieldDiffs: [{ field: "endDate", before: target.endDate ?? undefined, after: "2026-05-20" }],
      willCreateJoiner: false,
      willCreateLeaver: true,
    };
    const preview: HrImportPreview = {
      ...emptyPreview("2026-05"),
      diffs: [diff],
      counts: { ...emptyPreview().counts, rowsRead: 1, terminating: 1, leavers: 1 },
    };

    const { id } = commit(preview, [decisionFor(diff, "accept")]);
    const state = useAppStore.getState();
    const leaver = state.leavers.find((l) => l.id === `l-hr-${id}-${target.localNumber}`);
    expect(leaver).toBeDefined();
    expect(leaver?.terminationMethod).toBe("Mutual agreement");
  });

  it("commitHrImport throws FORBIDDEN_HR_IMPORT for viewer role", () => {
    useAppStore.setState({ role: "viewer" });
    const preview = emptyPreview("2026-05");
    expect(() => commit(preview, [])).toThrowError(/FORBIDDEN_HR_IMPORT/);
  });

  it("missing-from-file diff with no decision is fully ignored: no audit, no leaver, no snapshot", () => {
    const target = useAppStore.getState().employees[0];
    expect(target.endDate ?? null).toBeNull();
    const beforeAuditLen = useAppStore.getState().audit.length;
    const beforeLeaversLen = useAppStore.getState().leavers.length;
    const beforeSnapshotsForTarget = useAppStore.getState().snapshots.filter(
      (s) => s.employeeLocalNumber === target.localNumber && s.period === "2026-05",
    ).length;
    const beforeEmployee = { ...target };

    const diff: HrEmployeeDiff = {
      localNumber: target.localNumber,
      diffKind: "missing-from-file",
      currentEmployee: target,
      fieldDiffs: [],
      willCreateJoiner: false,
      willCreateLeaver: false,
    };
    const preview: HrImportPreview = {
      ...emptyPreview("2026-05"),
      diffs: [diff],
      counts: { ...emptyPreview().counts, rowsRead: 1, missingFromFile: 1 },
    };

    commit(preview, []); // no decision for the missing employee

    const state = useAppStore.getState();
    const empAudit = state.audit.find(
      (a) => a.kind === "hr_import" && a.entityType === "employee" && a.entityId === target.localNumber,
    );
    expect(empAudit).toBeUndefined();
    expect(state.leavers.length).toBe(beforeLeaversLen);
    expect(
      state.snapshots.filter(
        (s) => s.employeeLocalNumber === target.localNumber && s.period === "2026-05",
      ).length,
    ).toBe(beforeSnapshotsForTarget);
    const updated = state.employees.find((e) => e.localNumber === target.localNumber)!;
    expect(updated).toEqual(beforeEmployee);
    // Only the umbrella audit entry should have landed.
    const importAudits = state.audit.filter((a) => a.kind === "hr_import");
    expect(importAudits.length).toBe(1);
    expect(importAudits[0].entityType).toBe("import");
    // Sanity: audit grew by exactly one (the umbrella).
    expect(state.audit.length).toBe(beforeAuditLen + 1);
  });

  it("does not emit a joiner for new-employee when parser said willCreateJoiner=false even if startDate is in fileMonth", () => {
    const newRow = makeParsedRow(
      {
        localNumber: "P9999992",
        firstName: "Jose",
        lastName: "Roe",
        puCode: "PL01NC03",
        gradeCode: "A5",
        jobFunction: "CSS",
        locationCode: "WRO",
        startDate: "2026-05-15",
        fteCapacity: 1,
        engagement: "PL01NC03",
      },
      // Hired YES/NO = NO and Joiner? = NO → joinerYes = false, even though
      // the start date sits in fileMonth.
      { joinerYes: false },
    );
    const diff: HrEmployeeDiff = {
      localNumber: "P9999992",
      diffKind: "new-employee",
      parsedRow: newRow,
      fieldDiffs: [],
      willCreateJoiner: false,
      willCreateLeaver: false,
    };
    const preview: HrImportPreview = {
      ...emptyPreview("2026-05"),
      diffs: [diff],
      counts: { ...emptyPreview().counts, rowsRead: 1, new: 1 },
    };

    const beforeJoinersLen = useAppStore.getState().joiners.length;
    const { id } = commit(preview, [decisionFor(diff, "accept")]);
    const state = useAppStore.getState();
    expect(state.joiners.length).toBe(beforeJoinersLen);
    expect(state.joiners.some((j) => j.id === `j-hr-${id}-P9999992`)).toBe(false);
  });

  it("re-stamps every persisted rowDecision.importId to match the new HrImport.id", () => {
    const newRow = makeParsedRow(
      {
        localNumber: "P9999993",
        firstName: "Anna",
        lastName: "Doe",
        puCode: "PL01NC03",
        gradeCode: "A5",
        jobFunction: "CSS",
        locationCode: "WRO",
        startDate: "2026-05-15",
        fteCapacity: 1,
        engagement: "PL01NC03",
      },
      { joinerYes: true },
    );
    const diff: HrEmployeeDiff = {
      localNumber: "P9999993",
      diffKind: "new-employee",
      parsedRow: newRow,
      fieldDiffs: [],
      willCreateJoiner: true,
      willCreateLeaver: false,
    };
    const preview: HrImportPreview = {
      ...emptyPreview("2026-05"),
      diffs: [diff],
      counts: { ...emptyPreview().counts, rowsRead: 1, new: 1, joiners: 1 },
    };
    const decision = decisionFor(diff, "accept");
    expect(decision.importId).toBe("pending");

    const { id } = commit(preview, [decision]);
    const persisted = useAppStore.getState().hrImports.find((i) => i.id === id);
    expect(persisted).toBeDefined();
    for (const d of persisted!.rowDecisions) {
      expect(d.importId).toBe(id);
    }
  });

  it("new-employee audit `after` is narrowed via buildAuditSubset (no full PII)", () => {
    const newRow = makeParsedRow(
      {
        localNumber: "P9999994",
        firstName: "Pat",
        lastName: "Smith",
        puCode: "PL01NC03",
        gradeCode: "A5",
        jobFunction: "CSS",
        locationCode: "WRO",
        startDate: "2026-05-15",
        fteCapacity: 1,
        engagement: "PL01NC03",
        email: "pat.smith@example.com",
        sex: "F",
      },
      { joinerYes: true },
    );
    const diff: HrEmployeeDiff = {
      localNumber: "P9999994",
      diffKind: "new-employee",
      parsedRow: newRow,
      // `email` and `sex` deliberately omitted from fieldDiffs to confirm they
      // are excluded from the audit `after` payload.
      fieldDiffs: [
        { field: "puCode", before: undefined, after: "PL01NC03" },
        { field: "gradeCode", before: undefined, after: "A5" },
      ],
      willCreateJoiner: true,
      willCreateLeaver: false,
    };
    const preview: HrImportPreview = {
      ...emptyPreview("2026-05"),
      diffs: [diff],
      counts: { ...emptyPreview().counts, rowsRead: 1, new: 1, joiners: 1 },
    };

    commit(preview, [decisionFor(diff, "accept")]);
    const state = useAppStore.getState();
    const empAudit = state.audit.find(
      (a) => a.kind === "hr_import" && a.entityType === "employee" && a.entityId === "P9999994",
    );
    expect(empAudit).toBeDefined();
    const after = empAudit!.after as Record<string, unknown>;
    expect(after.puCode).toBe("PL01NC03");
    expect(after.gradeCode).toBe("A5");
    expect(after.email).toBeUndefined();
    expect(after.sex).toBeUndefined();
    expect(after.firstName).toBeUndefined();
    expect(after.lastName).toBeUndefined();
  });
});
