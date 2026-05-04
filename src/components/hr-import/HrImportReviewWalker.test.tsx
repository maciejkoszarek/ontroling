import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import HrImportReviewWalker from "./HrImportReviewWalker";
import type { HrEmployeeDiff } from "../../lib/hrImportDiff";

function makeDiff(localNumber: string, kind: HrEmployeeDiff["diffKind"], displayName: string): HrEmployeeDiff {
  return {
    localNumber,
    diffKind: kind,
    parsedRow: kind === "missing-from-file" ? undefined : ({
      rowIndex: 0,
      rawEmployeeNumber: localNumber,
      rawEmployeeNumberDup: localNumber,
      fileMonth: "2026-04",
      employee: { localNumber, firstName: displayName.split(" ")[0], lastName: displayName.split(" ")[1] ?? "", displayName, puCode: "PL01NC03" },
      joinerYes: kind === "new-employee",
      leaverYes: false,
      dateOfTermination: null,
      dateOfEndContract: null,
      dateOfRelease: null,
      parsedTerminationMethod: null,
      reportGeneratedAt: null,
      resolvedPuCode: "PL01NC03",
      resolvedPuVia: "mapping",
      rawProductionUnit: "PL01NC03",
      rawPeopleUnit: "",
      rawLocation: "WRO",
      rowWarnings: [],
      rowErrors: [],
    }),
    currentEmployee:
      kind === "new-employee"
        ? undefined
        : {
            localNumber,
            firstName: displayName.split(" ")[0],
            lastName: displayName.split(" ")[1] ?? "",
            displayName,
            puCode: "PL01NC04",
            gradeCode: "B2",
            jobFunction: "CSS",
            locationCode: "WRO",
            startDate: "2024-01-01",
            fteCapacity: 1,
            engagement: "PL01NC04",
            skills: [],
          },
    fieldDiffs:
      kind === "changed"
        ? [{ field: "puCode", before: "PL01NC04", after: "PL01NC03" }]
        : [],
    willCreateJoiner: kind === "new-employee",
    willCreateLeaver: false,
  };
}

describe("HrImportReviewWalker", () => {
  it("renders the first reviewable diff", () => {
    const diffs = [
      makeDiff("P0000001", "changed", "Alice Anderson"),
      makeDiff("P0000002", "new-employee", "Bob Brown"),
    ];
    render(
      <HrImportReviewWalker diffs={diffs} warnings={[]} currentUserEmail="alice@example.com" onComplete={() => {}} onCancel={() => {}} />,
    );
    expect(screen.getByText(/Alice Anderson/)).toBeInTheDocument();
  });

  it("`j` advances and `k` retreats", async () => {
    const user = userEvent.setup();
    const diffs = [
      makeDiff("P0000001", "changed", "Alice Anderson"),
      makeDiff("P0000002", "new-employee", "Bob Brown"),
    ];
    render(
      <HrImportReviewWalker diffs={diffs} warnings={[]} currentUserEmail="alice@example.com" onComplete={() => {}} onCancel={() => {}} />,
    );
    expect(screen.getByText(/Alice Anderson/)).toBeInTheDocument();

    await user.keyboard("j");
    expect(screen.getByText(/Bob Brown/)).toBeInTheDocument();

    await user.keyboard("k");
    expect(screen.getByText(/Alice Anderson/)).toBeInTheDocument();
  });

  it("`a` records accept, `s` records skip", async () => {
    const user = userEvent.setup();
    const diffs = [
      makeDiff("P0000001", "changed", "Alice Anderson"),
      makeDiff("P0000002", "new-employee", "Bob Brown"),
    ];
    const onComplete = vi.fn();
    render(
      <HrImportReviewWalker diffs={diffs} warnings={[]} currentUserEmail="alice@example.com" onComplete={onComplete} onCancel={() => {}} />,
    );

    // Accept first (Alice).
    await user.keyboard("a");
    // Now on Bob — skip.
    await user.keyboard("s");

    // Both reviewed — Continue button is enabled.
    const continueBtn = screen.getByRole("button", { name: /Continue to commit/ });
    expect(continueBtn).not.toBeDisabled();
    await user.click(continueBtn);

    expect(onComplete).toHaveBeenCalledTimes(1);
    const decisions = onComplete.mock.calls[0][0];
    expect(decisions).toHaveLength(2);
    const byLocal = Object.fromEntries(decisions.map((d: { localNumber: string; action: string }) => [d.localNumber, d.action]));
    expect(byLocal["P0000001"]).toBe("accept");
    expect(byLocal["P0000002"]).toBe("skip");
    for (const d of decisions as { decidedBy: string }[]) {
      expect(d.decidedBy).toBe("alice@example.com");
    }
  });

  it("onComplete is not callable until every reviewable diff has a decision", async () => {
    const user = userEvent.setup();
    const diffs = [
      makeDiff("P0000001", "changed", "Alice Anderson"),
      makeDiff("P0000002", "new-employee", "Bob Brown"),
    ];
    const onComplete = vi.fn();
    render(
      <HrImportReviewWalker diffs={diffs} warnings={[]} currentUserEmail="alice@example.com" onComplete={onComplete} onCancel={() => {}} />,
    );

    // Decide on only one.
    await user.keyboard("a");
    const continueBtn = screen.getByRole("button", { name: /Continue to commit/ });
    expect(continueBtn).toBeDisabled();
    expect(onComplete).not.toHaveBeenCalled();
  });
});
