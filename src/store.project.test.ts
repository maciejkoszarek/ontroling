import { beforeEach, describe, expect, it } from "vitest";
import { useAppStore } from "./store";

function reset() {
  localStorage.clear();
  useAppStore.getState().resetToDemo();
  useAppStore.setState({ role: "controller" });
}

type AddProjectArg = Parameters<ReturnType<typeof useAppStore.getState>["addProject"]>[0];

function addOpportunity(partial: Partial<AddProjectArg> = {}) {
  useAppStore.getState().addProject({
    projectNumber: "TEST-1",
    name: "Test opp",
    customer: "Acme",
    marketUnit: useAppStore.getState().marketUnits[0]?.code ?? "MU1",
    kind: "opportunity",
    isBillable: true,
    status: "active",
    ...partial,
  });
}

describe("store.addProject — commitProbability defaults (I30)", () => {
  beforeEach(reset);

  it("sets commitProbability to 1.0 for kind=project even when caller provides a different value", () => {
    useAppStore.getState().addProject({
      projectNumber: "P-PROJ",
      name: "Committed",
      customer: "Acme",
      marketUnit: useAppStore.getState().marketUnits[0]?.code ?? "MU1",
      kind: "project",
      isBillable: true,
      status: "active",
      commitProbability: 0.5,
    });
    const p = useAppStore.getState().projects.find((x) => x.projectNumber === "P-PROJ");
    expect(p?.commitProbability).toBe(1.0);
  });

  it("defaults commitProbability to 0.5 for opportunity when caller omits it", () => {
    addOpportunity({ projectNumber: "P-OPP" });
    const p = useAppStore.getState().projects.find((x) => x.projectNumber === "P-OPP");
    expect(p?.commitProbability).toBe(0.5);
  });

  it("defaults commitProbability to 0.3 for ambition when caller omits it", () => {
    useAppStore.getState().addProject({
      projectNumber: "P-AMB",
      name: "Target account",
      customer: "Acme",
      marketUnit: useAppStore.getState().marketUnits[0]?.code ?? "MU1",
      kind: "ambition",
      isBillable: true,
      status: "active",
    });
    const p = useAppStore.getState().projects.find((x) => x.projectNumber === "P-AMB");
    expect(p?.commitProbability).toBe(0.3);
  });

  it("clamps out-of-range commitProbability on addProject for opportunity/ambition", () => {
    addOpportunity({ projectNumber: "P-CLAMP", commitProbability: 1.5 });
    const p = useAppStore.getState().projects.find((x) => x.projectNumber === "P-CLAMP");
    expect(p?.commitProbability).toBe(1);
  });
});

describe("store.updateProject — commitProbability (I30)", () => {
  beforeEach(reset);

  it("resets commitProbability to the new kind's default when kind changes", () => {
    addOpportunity({ projectNumber: "P1", commitProbability: 0.8 });
    useAppStore.getState().updateProject("P1", { kind: "ambition" });
    const p = useAppStore.getState().projects.find((x) => x.projectNumber === "P1");
    expect(p?.kind).toBe("ambition");
    expect(p?.commitProbability).toBe(0.3);
  });

  it("forces commitProbability to 1.0 when kind changes to project", () => {
    addOpportunity({ projectNumber: "P2", commitProbability: 0.8 });
    useAppStore.getState().updateProject("P2", { kind: "project" });
    const p = useAppStore.getState().projects.find((x) => x.projectNumber === "P2");
    expect(p?.kind).toBe("project");
    expect(p?.commitProbability).toBe(1.0);
  });

  it("resets commitProbability to 0.5 when kind changes from ambition to opportunity", () => {
    // ambition (default 0.3) → opportunity must snap to the opportunity
    // default (0.5), discarding the previous value. Completes the kind-
    // transition coverage matrix alongside opportunity→ambition and →project.
    useAppStore.getState().addProject({
      projectNumber: "P-A2O",
      name: "Target becomes deal",
      customer: "Acme",
      marketUnit: useAppStore.getState().marketUnits[0]?.code ?? "MU1",
      kind: "ambition",
      isBillable: true,
      status: "active",
      commitProbability: 0.1,
    });
    useAppStore.getState().updateProject("P-A2O", { kind: "opportunity" });
    const p = useAppStore.getState().projects.find((x) => x.projectNumber === "P-A2O");
    expect(p?.kind).toBe("opportunity");
    expect(p?.commitProbability).toBe(0.5);
  });

  it("accepts an in-range commitProbability update without an audit-clamp entry", () => {
    addOpportunity({ projectNumber: "P3" });
    const beforeLen = useAppStore.getState().audit.length;
    useAppStore.getState().updateProject("P3", { commitProbability: 0.75 });
    const s = useAppStore.getState();
    const p = s.projects.find((x) => x.projectNumber === "P3");
    expect(p?.commitProbability).toBe(0.75);
    // exactly one audit entry — the project update, no clamp
    expect(s.audit.length).toBe(beforeLen + 1);
    expect(s.audit[0].entityType).toBe("project");
  });

  it("clamps commitProbability>1 and appends a validation-clamp audit entry referencing I30 range", () => {
    addOpportunity({ projectNumber: "P4" });
    useAppStore.getState().updateProject("P4", { commitProbability: 1.5 });
    const s = useAppStore.getState();
    const p = s.projects.find((x) => x.projectNumber === "P4");
    expect(p?.commitProbability).toBe(1);
    const clamp = s.audit.find(
      (a) => a.entityType === "validation-clamp" && a.entityId === "P4",
    );
    expect(clamp).toBeDefined();
    expect(clamp?.after).toMatchObject({ field: "commitProbability", value: 1, reason: "I30 range" });
    expect(clamp?.before).toMatchObject({ value: 1.5 });
  });

  it("coerces NaN/Infinity commitProbability to 0 and appends a validation-clamp audit entry", () => {
    addOpportunity({ projectNumber: "P-NAN" });
    useAppStore.getState().updateProject("P-NAN", { commitProbability: Number.NaN });
    let s = useAppStore.getState();
    let p = s.projects.find((x) => x.projectNumber === "P-NAN");
    expect(p?.commitProbability).toBe(0);
    expect(
      s.audit.find((a) => a.entityType === "validation-clamp" && a.entityId === "P-NAN"),
    ).toBeDefined();

    useAppStore.getState().updateProject("P-NAN", { commitProbability: Number.POSITIVE_INFINITY });
    s = useAppStore.getState();
    p = s.projects.find((x) => x.projectNumber === "P-NAN");
    expect(p?.commitProbability).toBe(0);
  });

  it("clamps commitProbability<0 and appends a validation-clamp audit entry", () => {
    addOpportunity({ projectNumber: "P5" });
    useAppStore.getState().updateProject("P5", { commitProbability: -0.2 });
    const s = useAppStore.getState();
    const p = s.projects.find((x) => x.projectNumber === "P5");
    expect(p?.commitProbability).toBe(0);
    const clamp = s.audit.find(
      (a) => a.entityType === "validation-clamp" && a.entityId === "P5",
    );
    expect(clamp).toBeDefined();
  });

  it("ignores the value and forces 1.0 when commitProbability is updated on a kind=project row", () => {
    useAppStore.getState().addProject({
      projectNumber: "P-PRJ",
      name: "Committed",
      customer: "Acme",
      marketUnit: useAppStore.getState().marketUnits[0]?.code ?? "MU1",
      kind: "project",
      isBillable: true,
      status: "active",
    });
    useAppStore.getState().updateProject("P-PRJ", { commitProbability: 0.2 });
    const p = useAppStore.getState().projects.find((x) => x.projectNumber === "P-PRJ");
    expect(p?.commitProbability).toBe(1.0);
  });
});
