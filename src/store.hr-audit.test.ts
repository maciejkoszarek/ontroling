import { beforeEach, describe, expect, it } from "vitest";
import { useAppStore } from "./store";
import type { Employee } from "./types";

function reset() {
  localStorage.clear();
  useAppStore.getState().resetToDemo();
  useAppStore.setState({
    role: "controller",
    audit: [],
    user: { name: "Tester", email: "tester@example.com", puCode: "PL01NC03" },
  });
}

function makeEmployee(localNumber = "P9999991"): Omit<Employee, "displayName"> & { displayName?: string } {
  return {
    localNumber,
    firstName: "Test",
    lastName: "Subject",
    puCode: "PL01NC03",
    gradeCode: "B2",
    jobFunction: "CSS",
    locationCode: "WRO",
    startDate: "2024-01-15",
    fteCapacity: 1,
    engagement: "UoP",
    skills: [],
  };
}

describe("store — audit fan-out for employee mutations (§18.4)", () => {
  beforeEach(reset);

  it("addEmployee writes one user_edit / create entry on the employee", () => {
    useAppStore.getState().addEmployee(makeEmployee("P9999991"));
    const audit = useAppStore.getState().audit;
    const matching = audit.filter((a) => a.entityType === "employee" && a.entityId === "P9999991");
    expect(matching.length).toBe(1);
    const e = matching[0];
    expect(e.action).toBe("create");
    expect(e.kind).toBe("user_edit");
    expect(e.actor).toBe("tester@example.com");
    expect(e.ts).toBeTruthy();
    expect((e.after as Employee).localNumber).toBe("P9999991");
  });

  it("transferEmployee writes one transfer / update entry with before/after PU", () => {
    const target = useAppStore.getState().employees[0];
    expect(target).toBeDefined();
    const fromPu = target.puCode;
    const toPu = fromPu === "PL01NC03" ? "PL01NC04" : "PL01NC03";

    useAppStore.setState({ audit: [] });
    useAppStore.getState().transferEmployee({
      localNumber: target.localNumber,
      toPuCode: toPu,
      effectivePeriod: "2026-06",
      reason: "reorg",
    });

    const audit = useAppStore.getState().audit;
    const matching = audit.filter(
      (a) => a.entityType === "employee" && a.entityId === target.localNumber && a.kind === "transfer",
    );
    expect(matching.length).toBe(1);
    const e = matching[0];
    expect(e.action).toBe("update");
    expect(e.actor).toBe("tester@example.com");
    expect(e.before).toEqual({ puCode: fromPu });
    expect((e.after as { puCode: string }).puCode).toBe(toPu);
  });

  it("setEmployeeCapabilities writes one capability_change entry with capability id arrays", () => {
    const target = useAppStore.getState().employees[0];
    const before = target.capabilities ?? [];
    useAppStore.setState({ audit: [] });
    const next = ["cap-java", "cap-react"];
    useAppStore.getState().setEmployeeCapabilities(target.localNumber, next);

    const audit = useAppStore.getState().audit;
    const matching = audit.filter(
      (a) => a.entityType === "employee" && a.entityId === target.localNumber && a.kind === "capability_change",
    );
    expect(matching.length).toBe(1);
    const e = matching[0];
    expect(e.action).toBe("update");
    expect(e.before).toEqual(before);
    expect(e.after).toEqual(next);
  });

  it("setEmployeeGermanSpeaker writes one user_edit entry with scalar before/after", () => {
    const target = useAppStore.getState().employees[0];
    const beforeFlag = target.germanSpeaker;
    useAppStore.setState({ audit: [] });
    useAppStore.getState().setEmployeeGermanSpeaker(target.localNumber, true);

    const audit = useAppStore.getState().audit;
    const matching = audit.filter(
      (a) =>
        a.entityType === "employee" &&
        a.entityId === target.localNumber &&
        a.kind === "user_edit" &&
        (a.after as { germanSpeaker?: boolean }).germanSpeaker !== undefined,
    );
    expect(matching.length).toBe(1);
    const e = matching[0];
    expect(e.action).toBe("update");
    expect(e.before).toEqual({ germanSpeaker: beforeFlag });
    expect(e.after).toEqual({ germanSpeaker: true });
  });

  it("setEmployeeClearanceLevel writes one user_edit entry with scalar before/after", () => {
    const target = useAppStore.getState().employees[0];
    const beforeLevel = target.clearanceLevel;
    useAppStore.setState({ audit: [] });
    useAppStore.getState().setEmployeeClearanceLevel(target.localNumber, "SU2");

    const audit = useAppStore.getState().audit;
    const matching = audit.filter(
      (a) =>
        a.entityType === "employee" &&
        a.entityId === target.localNumber &&
        a.kind === "user_edit" &&
        (a.after as { clearanceLevel?: string }).clearanceLevel !== undefined,
    );
    expect(matching.length).toBe(1);
    const e = matching[0];
    expect(e.action).toBe("update");
    expect(e.before).toEqual({ clearanceLevel: beforeLevel });
    expect(e.after).toEqual({ clearanceLevel: "SU2" });
  });

  it("addJoiner writes one joiner / create entry keyed by employee localNumber", () => {
    useAppStore.setState({ audit: [] });
    useAppStore.getState().addJoiner({
      employeeLocalNumber: "P9999992",
      firstName: "New",
      lastName: "Hire",
      puCode: "PL01NC03",
      gradeCode: "A5",
      locationCode: "WRO",
      role: "Junior Dev",
      startDate: "2026-05-01",
      source: "HR",
      status: "actual",
    });

    const audit = useAppStore.getState().audit;
    const matching = audit.filter(
      (a) => a.entityType === "employee" && a.entityId === "P9999992" && a.kind === "joiner",
    );
    expect(matching.length).toBe(1);
    const e = matching[0];
    expect(e.action).toBe("create");
    expect(e.actor).toBe("tester@example.com");
  });

  it("addLeaver writes one leaver / create entry keyed by employee localNumber", () => {
    const target = useAppStore.getState().employees[0];
    useAppStore.setState({ audit: [] });
    useAppStore.getState().addLeaver({
      employeeLocalNumber: target.localNumber,
      firstName: target.firstName,
      lastName: target.lastName,
      puCode: target.puCode,
      gradeCode: target.gradeCode,
      startDate: target.startDate,
      endDate: "2026-06-30",
      reason: "voluntary",
      engagement: target.engagement,
    });

    const audit = useAppStore.getState().audit;
    const matching = audit.filter(
      (a) => a.entityType === "employee" && a.entityId === target.localNumber && a.kind === "leaver",
    );
    expect(matching.length).toBe(1);
    const e = matching[0];
    expect(e.action).toBe("create");
    expect(e.actor).toBe("tester@example.com");
  });
});
