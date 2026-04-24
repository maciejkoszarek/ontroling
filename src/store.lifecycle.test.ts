import { beforeEach, describe, expect, it } from "vitest";
import { useAppStore } from "./store";
import type { ForecastCycle } from "./types";

function reset() {
  localStorage.clear();
  useAppStore.getState().resetToDemo();
  useAppStore.setState({ role: "controller" });
}

describe("store — openCycle lifecycle guards (C4)", () => {
  beforeEach(reset);

  it("openCycle returns false for non-controller roles and does not modify cycles", () => {
    useAppStore.setState({ role: "pu_lead" });
    const cyclesBefore = useAppStore.getState().cycles;
    const activeBefore = useAppStore.getState().activeCycleId;

    const ok = useAppStore.getState().openCycle("FC May 2026", "2026-05");
    expect(ok).toBe(false);
    expect(useAppStore.getState().cycles).toBe(cyclesBefore);
    expect(useAppStore.getState().activeCycleId).toBe(activeBefore);
  });

  it("openCycle as controller locks the previous active cycle, creates a snapshot, and appends an audit entry", () => {
    const stateBefore = useAppStore.getState();
    const previouslyActive = stateBefore.cycles.find(
      (c) => c.status === "open" || c.status === "editing" || c.status === "reconciling",
    );
    expect(previouslyActive).toBeDefined();
    const prevId = previouslyActive!.id;

    const ok = useAppStore.getState().openCycle("FC May 2026", "2026-05");
    expect(ok).toBe(true);

    const s = useAppStore.getState();
    // The new cycle is active and uses the expected id format.
    expect(s.activeCycleId).toBe("fc-2026-05");
    const newCycle = s.cycles.find((c) => c.id === "fc-2026-05") as ForecastCycle | undefined;
    expect(newCycle?.status).toBe("open");

    // The previous active cycle is now locked.
    const prevCycleAfter = s.cycles.find((c) => c.id === prevId);
    expect(prevCycleAfter?.status).toBe("locked");

    // lockedSnapshots[prevId] is populated with the cells that lived under that cycleId.
    expect(s.lockedSnapshots[prevId]).toBeDefined();
    expect(s.lockedSnapshots[prevId].length).toBeGreaterThan(0);
    for (const cell of s.lockedSnapshots[prevId]) {
      expect(cell.cycleId).toBe(prevId);
    }

    // Audit entries: most-recent-first order puts the `open` for the new cycle at [0]
    // and the `lock` for the previous cycle at [1]. Both must exist.
    const openEntry = s.audit.find((a) => a.action === "open" && a.entityId === "fc-2026-05");
    const lockEntry = s.audit.find((a) => a.action === "lock" && a.entityId === prevId);
    expect(openEntry).toBeDefined();
    expect(lockEntry).toBeDefined();
    expect(openEntry?.entityType).toBe("cycle");
    expect(lockEntry?.entityType).toBe("cycle");
  });
});

describe("store — applyImportPatch RBAC + audit ordering", () => {
  beforeEach(reset);

  it("non-controller call is blocked: no state changes and no audit entry", () => {
    useAppStore.setState({ role: "pu_lead" });
    const before = useAppStore.getState();
    const scenariosBefore = before.scenarios;
    const auditBefore = before.audit;

    useAppStore.getState().applyImportPatch({ scenarios: [] }, "test-import-source");

    const after = useAppStore.getState();
    expect(after.scenarios).toBe(scenariosBefore);
    expect(after.audit).toBe(auditBefore);
  });

  it("no-op when patch is empty (no audit entry written)", () => {
    const before = useAppStore.getState().audit.length;
    useAppStore.getState().applyImportPatch({}, "empty-source");
    expect(useAppStore.getState().audit.length).toBe(before);
  });

  it("controller call applies the patch and writes the audit entry at audit[0] (newest-first)", () => {
    // Pick an unambiguous, user-visible slice: comments.
    const existingCount = useAppStore.getState().comments.length;
    const nextComments = useAppStore.getState().comments.slice(0, 1); // shrink to 1

    useAppStore.getState().applyImportPatch({ comments: nextComments }, "test-import-source");

    const s = useAppStore.getState();
    expect(s.comments).toEqual(nextComments);
    expect(s.comments.length).not.toBe(existingCount); // the patch actually did something

    // Audit ordering fix: the new entry must sit at index 0.
    const head = s.audit[0];
    expect(head.entityType).toBe("import");
    expect(head.entityId).toBe("test-import-source");
    expect(head.action).toBe("update");
    expect(head.after).toMatchObject({ source: "test-import-source" });
    expect(Array.isArray((head.after as { tables: string[] }).tables)).toBe(true);
    expect((head.after as { tables: string[] }).tables).toContain("comments");
  });
});
