import { beforeEach, describe, expect, it } from "vitest";
import { useAppStore } from "./store";

function reset() {
  localStorage.clear();
  useAppStore.setState({ role: "controller", promotions: [], audit: [] });
}

function pickEmployee() {
  const s = useAppStore.getState();
  const e = s.employees.find((x) => !x.endDate);
  if (!e) throw new Error("no active employee in seed");
  return e;
}

describe("store — promoteEmployee", () => {
  beforeEach(reset);

  it("creates a Promotion record, updates gradeCode, and writes audit before/after", () => {
    const emp = pickEmployee();
    const fromGrade = emp.gradeCode;
    const toGrade = fromGrade === "C1" ? "C2" : "C1";

    useAppStore.getState().promoteEmployee({
      localNumber: emp.localNumber,
      toGradeCode: toGrade,
      effectivePeriod: "2026-06",
      reason: "annual review",
    });

    const s = useAppStore.getState();
    const updated = s.employees.find((e) => e.localNumber === emp.localNumber);
    expect(updated?.gradeCode).toBe(toGrade);

    const promo = s.promotions.find((p) => p.employeeLocalNumber === emp.localNumber);
    expect(promo).toBeDefined();
    expect(promo?.fromGradeCode).toBe(fromGrade);
    expect(promo?.toGradeCode).toBe(toGrade);
    expect(promo?.effectivePeriod).toBe("2026-06");
    expect(promo?.reason).toBe("annual review");
    expect(promo?.recordedBy).toBe(s.user.name);

    const audit = s.audit[0];
    expect(audit.entityType).toBe("employee");
    expect(audit.entityId).toBe(emp.localNumber);
    expect(audit.action).toBe("update");
    expect((audit.before as { gradeCode: string }).gradeCode).toBe(fromGrade);
    expect((audit.after as { gradeCode: string }).gradeCode).toBe(toGrade);
  });

  it("is a no-op when the target grade matches the current grade", () => {
    const emp = pickEmployee();
    const promosBefore = useAppStore.getState().promotions.length;
    const auditBefore = useAppStore.getState().audit.length;

    useAppStore.getState().promoteEmployee({
      localNumber: emp.localNumber,
      toGradeCode: emp.gradeCode,
      effectivePeriod: "2026-06",
    });

    const s = useAppStore.getState();
    expect(s.promotions.length).toBe(promosBefore);
    expect(s.audit.length).toBe(auditBefore);
  });

  it("is a no-op when the local number does not exist", () => {
    const promosBefore = useAppStore.getState().promotions.length;
    useAppStore.getState().promoteEmployee({
      localNumber: "P_DOES_NOT_EXIST",
      toGradeCode: "C1",
      effectivePeriod: "2026-06",
    });
    expect(useAppStore.getState().promotions.length).toBe(promosBefore);
  });

  it("preserves prior promotion history when stacked", () => {
    const emp = pickEmployee();
    const grades = useAppStore.getState().grades.filter((g) => !g.isContractor);
    const first = grades.find((g) => g.code !== emp.gradeCode)!.code;
    const second = grades.find((g) => g.code !== emp.gradeCode && g.code !== first)!.code;

    useAppStore.getState().promoteEmployee({
      localNumber: emp.localNumber,
      toGradeCode: first,
      effectivePeriod: "2026-04",
    });
    useAppStore.getState().promoteEmployee({
      localNumber: emp.localNumber,
      toGradeCode: second,
      effectivePeriod: "2026-10",
    });

    const promos = useAppStore
      .getState()
      .promotions.filter((p) => p.employeeLocalNumber === emp.localNumber);
    expect(promos).toHaveLength(2);
    const byPeriod = promos.map((p) => `${p.fromGradeCode}->${p.toGradeCode}@${p.effectivePeriod}`);
    expect(byPeriod).toContain(`${first}->${second}@2026-10`);
    expect(byPeriod).toContain(`${emp.gradeCode}->${first}@2026-04`);
  });
});

describe("store — updateEmployee", () => {
  beforeEach(reset);

  it("applies a partial patch and writes a single audit entry with diffed fields", () => {
    const emp = pickEmployee();

    useAppStore.getState().updateEmployee(emp.localNumber, {
      firstName: "Renamed",
      fteCapacity: 0.8,
    });

    const s = useAppStore.getState();
    const updated = s.employees.find((e) => e.localNumber === emp.localNumber)!;
    expect(updated.firstName).toBe("Renamed");
    expect(updated.fteCapacity).toBe(0.8);
    // displayName auto-recomputes when first/last name changes
    expect(updated.displayName).toBe(`Renamed ${emp.lastName}`);
    // Untouched fields remain
    expect(updated.locationCode).toBe(emp.locationCode);
    expect(updated.engagement).toBe(emp.engagement);

    const audit = s.audit[0];
    expect(audit.entityType).toBe("employee");
    expect(audit.entityId).toBe(emp.localNumber);
    expect(audit.action).toBe("update");
    const before = audit.before as Record<string, unknown>;
    const after = audit.after as Record<string, unknown>;
    expect(before.firstName).toBe(emp.firstName);
    expect(after.firstName).toBe("Renamed");
    expect(before.fteCapacity).toBe(emp.fteCapacity);
    expect(after.fteCapacity).toBe(0.8);
    // The diff includes the auto-recomputed displayName
    expect(after.displayName).toBe(`Renamed ${emp.lastName}`);
    // Unchanged fields not in diff
    expect("locationCode" in (after as object)).toBe(false);
  });

  it("is a no-op when no field actually changes", () => {
    const emp = pickEmployee();
    const auditBefore = useAppStore.getState().audit.length;

    useAppStore.getState().updateEmployee(emp.localNumber, {
      firstName: emp.firstName,
      lastName: emp.lastName,
      fteCapacity: emp.fteCapacity,
    });

    expect(useAppStore.getState().audit.length).toBe(auditBefore);
  });

  it("is a no-op when the local number does not exist", () => {
    const auditBefore = useAppStore.getState().audit.length;
    useAppStore.getState().updateEmployee("P_DOES_NOT_EXIST", { firstName: "X" });
    expect(useAppStore.getState().audit.length).toBe(auditBefore);
  });

  it("preserves displayName override when caller provides it explicitly", () => {
    const emp = pickEmployee();
    useAppStore.getState().updateEmployee(emp.localNumber, {
      firstName: "New",
      displayName: "Custom Display",
    });
    const updated = useAppStore.getState().employees.find((e) => e.localNumber === emp.localNumber)!;
    expect(updated.displayName).toBe("Custom Display");
  });
});
