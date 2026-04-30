import { beforeEach, describe, expect, it } from "vitest";
import { useAppStore } from "./store";

function reset() {
  localStorage.clear();
  useAppStore.getState().resetToDemo();
  useAppStore.setState({ role: "controller" });
}

describe("store — HR mapping CRUD + resolution", () => {
  beforeEach(reset);

  it("seeds identity mappings for every non-virtual PU (code, shortName, displayName)", () => {
    const { hrMappings, productionUnits } = useAppStore.getState();
    const leafPus = productionUnits.filter((p) => !p.isVirtual);
    expect(leafPus.length).toBeGreaterThan(0);

    // Each leaf PU contributes between 1 and 3 entries (deduped via Set on source).
    let expectedTotal = 0;
    for (const pu of leafPus) {
      const sources = new Set([pu.code, pu.shortName, pu.displayName].filter(Boolean));
      expectedTotal += sources.size;
    }
    expect(hrMappings.length).toBe(expectedTotal);

    for (const pu of leafPus) {
      const byCode = hrMappings.find((m) => m.kind === "production_unit" && m.source === pu.code);
      expect(byCode?.targetCode).toBe(pu.code);
      expect(byCode?.createdBy).toBe("system");
      expect(byCode?.active).toBe(true);

      const byShort = hrMappings.find((m) => m.kind === "production_unit" && m.source === pu.shortName);
      expect(byShort?.targetCode).toBe(pu.code);

      const byDisplay = hrMappings.find((m) => m.kind === "production_unit" && m.source === pu.displayName);
      expect(byDisplay?.targetCode).toBe(pu.code);
    }
  });

  it("addHrMapping appends a new entry and rejects duplicates by case-insensitive (kind, source)", () => {
    const before = useAppStore.getState().hrMappings.length;

    useAppStore.getState().addHrMapping({
      kind: "production_unit",
      source: "CCA SE 2 (Wrocław)",
      targetCode: "PL01NC04",
      note: "informal HR label",
    });

    const after = useAppStore.getState().hrMappings;
    expect(after.length).toBe(before + 1);
    const created = after.find((m) => m.source === "CCA SE 2 (Wrocław)");
    expect(created?.targetCode).toBe("PL01NC04");
    expect(created?.kind).toBe("production_unit");
    expect(created?.active).toBe(true);
    expect(created?.id).toBeTruthy();
    expect(created?.createdAt).toBeTruthy();

    // Duplicate (case-insensitive, whitespace-insensitive) is ignored.
    useAppStore.getState().addHrMapping({
      kind: "production_unit",
      source: "  cca se 2 (wrocław)  ",
      targetCode: "PL01NC04",
    });
    expect(useAppStore.getState().hrMappings.length).toBe(before + 1);

    // Same source string but different kind is allowed.
    useAppStore.getState().addHrMapping({
      kind: "people_unit",
      source: "CCA SE 2 (Wrocław)",
      targetCode: "PL01NC04",
    });
    expect(useAppStore.getState().hrMappings.length).toBe(before + 2);
  });

  it("addHrMapping rejects empty / whitespace-only sources", () => {
    const before = useAppStore.getState().hrMappings.length;
    useAppStore.getState().addHrMapping({ kind: "production_unit", source: "   ", targetCode: "PL01NC04" });
    expect(useAppStore.getState().hrMappings.length).toBe(before);
  });

  it("updateHrMapping patches the target and note but preserves id/createdAt/createdBy", () => {
    const id = useAppStore.getState().hrMappings[0].id;
    const original = useAppStore.getState().hrMappings.find((m) => m.id === id)!;

    useAppStore.getState().updateHrMapping(id, { targetCode: "PL01NC10", note: "manual remap" });

    const updated = useAppStore.getState().hrMappings.find((m) => m.id === id)!;
    expect(updated.targetCode).toBe("PL01NC10");
    expect(updated.note).toBe("manual remap");
    expect(updated.id).toBe(original.id);
    expect(updated.createdAt).toBe(original.createdAt);
    expect(updated.createdBy).toBe(original.createdBy);
  });

  it("updateHrMapping is a no-op for unknown ids", () => {
    const before = useAppStore.getState().hrMappings;
    useAppStore.getState().updateHrMapping("does-not-exist", { targetCode: "PL01NC10" });
    expect(useAppStore.getState().hrMappings).toEqual(before);
  });

  it("removeHrMapping drops the entry by id", () => {
    const id = useAppStore.getState().hrMappings[0].id;
    useAppStore.getState().removeHrMapping(id);
    expect(useAppStore.getState().hrMappings.some((m) => m.id === id)).toBe(false);
  });

  it("resolveHrMapping is case- and whitespace-insensitive and returns the target code", () => {
    const { resolveHrMapping } = useAppStore.getState();
    // Seed entries: PL01NC04 / CCA_SE2 / "CCA Developers 2"
    expect(resolveHrMapping("production_unit", "PL01NC04")).toBe("PL01NC04");
    expect(resolveHrMapping("production_unit", "  pl01nc04  ")).toBe("PL01NC04");
    expect(resolveHrMapping("production_unit", "cca_se2")).toBe("PL01NC04");
    expect(resolveHrMapping("production_unit", "CCA Developers 2")).toBe("PL01NC04");
  });

  it("non-controller roles cannot add, update, or remove HR mappings", () => {
    const before = useAppStore.getState().hrMappings;
    const beforeIds = before.map((m) => m.id);

    for (const role of ["pu_lead", "finance", "hr", "viewer"] as const) {
      useAppStore.setState({ role });

      // add — silent no-op
      useAppStore.getState().addHrMapping({
        kind: "production_unit",
        source: `forbidden-${role}`,
        targetCode: "PL01NC04",
      });
      expect(useAppStore.getState().hrMappings.some((m) => m.source === `forbidden-${role}`)).toBe(false);

      // update — silent no-op
      const targetId = beforeIds[0];
      const original = before.find((m) => m.id === targetId)!;
      useAppStore.getState().updateHrMapping(targetId, { targetCode: "PL99NC99", note: `tampered-by-${role}` });
      const after = useAppStore.getState().hrMappings.find((m) => m.id === targetId)!;
      expect(after.targetCode).toBe(original.targetCode);
      expect(after.note).toBe(original.note);

      // remove — silent no-op
      useAppStore.getState().removeHrMapping(targetId);
      expect(useAppStore.getState().hrMappings.some((m) => m.id === targetId)).toBe(true);
    }
  });

  it("resolveHrMapping returns undefined when no entry exists, and ignores inactive entries", () => {
    const { resolveHrMapping, addHrMapping, hrMappings, updateHrMapping } = useAppStore.getState();

    expect(resolveHrMapping("production_unit", "Totally Unknown PU")).toBeUndefined();
    expect(resolveHrMapping("location", "Wrocław")).toBeUndefined();
    expect(resolveHrMapping("grade", "B2")).toBeUndefined();
    expect(resolveHrMapping("production_unit", "")).toBeUndefined();

    // After deactivating an existing entry, resolution falls through.
    addHrMapping({
      kind: "production_unit",
      source: "Some PU label",
      targetCode: "PL01NC08",
    });
    const created = useAppStore
      .getState()
      .hrMappings.find((m) => m.source === "Some PU label");
    expect(created).toBeDefined();
    expect(useAppStore.getState().resolveHrMapping("production_unit", "some pu label")).toBe("PL01NC08");

    updateHrMapping(created!.id, { active: false });
    expect(useAppStore.getState().resolveHrMapping("production_unit", "some pu label")).toBeUndefined();

    // Sanity: original seed mappings still untouched.
    expect(hrMappings.some((m) => m.source === "PL01NC04")).toBe(true);
  });
});
