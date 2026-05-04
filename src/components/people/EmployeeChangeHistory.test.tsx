import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import EmployeeChangeHistory from "./EmployeeChangeHistory";
import { useAppStore } from "../../store";
import type { AuditEntry, Transfer } from "../../types";

function reset() {
  localStorage.clear();
  useAppStore.getState().resetToDemo();
  // Strip pre-existing data the demo seeded so we can assert exact contents.
  useAppStore.setState({
    audit: [],
    transfers: [],
    joiners: [],
    leavers: [],
  });
}

function mkAudit(partial: Partial<AuditEntry> & Pick<AuditEntry, "id" | "entityId" | "ts">): AuditEntry {
  return {
    actor: "alice@example.com",
    entityType: "employee",
    action: "update",
    ...partial,
  } as AuditEntry;
}

function mkTransfer(partial: Partial<Transfer> & Pick<Transfer, "id" | "employeeLocalNumber" | "recordedAt">): Transfer {
  return {
    fromPuCode: "PL01NC03",
    toPuCode: "PL01NC04",
    effectivePeriod: "2026-04",
    recordedBy: "Bob Brown",
    ...partial,
  } as Transfer;
}

function renderWithRouter(localNumber: string) {
  return render(
    <MemoryRouter initialEntries={[`/people/${localNumber}`]}>
      <EmployeeChangeHistory localNumber={localNumber} />
    </MemoryRouter>,
  );
}

describe("EmployeeChangeHistory", () => {
  beforeEach(() => {
    reset();
  });

  it("renders empty state when no audit entries match the localNumber", () => {
    renderWithRouter("P0000001");
    expect(screen.getByText(/Change history/i)).toBeInTheDocument();
    expect(screen.getByText(/No tracked changes yet/i)).toBeInTheDocument();
  });

  it("renders an hr_import audit entry with field-level deltas", () => {
    const audit: AuditEntry = mkAudit({
      id: "a1",
      entityId: "P0000001",
      ts: "2026-04-29T11:42:00.000Z",
      kind: "hr_import",
      action: "update",
      importId: "imp-2026-04",
      before: { puCode: "PL01NC03", gradeCode: "B2" },
      after: { puCode: "PL01NC04", gradeCode: "C1" },
    });
    useAppStore.setState({ audit: [audit] });

    renderWithRouter("P0000001");

    expect(screen.getByText(/HR import \(2026-04\)/)).toBeInTheDocument();
    // Field-level deltas appear as "field: before → after".
    expect(screen.getByText("puCode")).toBeInTheDocument();
    expect(screen.getByText("gradeCode")).toBeInTheDocument();
    // Both before and after values appear (multiple matches expected, just check existence).
    expect(screen.getAllByText("PL01NC03").length).toBeGreaterThan(0);
    expect(screen.getAllByText("PL01NC04").length).toBeGreaterThan(0);
    expect(screen.getAllByText("B2").length).toBeGreaterThan(0);
    expect(screen.getAllByText("C1").length).toBeGreaterThan(0);
  });

  it("renders a transfer record from state.transfers", () => {
    const t = mkTransfer({
      id: "tr1",
      employeeLocalNumber: "P0000001",
      recordedAt: "2026-03-15T10:08:00.000Z",
      fromPuCode: "PL01NC03",
      toPuCode: "PL01NC04",
      effectivePeriod: "2026-04",
    });
    useAppStore.setState({ transfers: [t] });

    renderWithRouter("P0000001");

    expect(screen.getByText(/PU transfer/i)).toBeInTheDocument();
    expect(screen.getByText(/PL01NC03/)).toBeInTheDocument();
    expect(screen.getByText(/PL01NC04/)).toBeInTheDocument();
    expect(screen.getByText(/effective 2026-04/i)).toBeInTheDocument();
  });

  it("filter chips: 'Imports only' filters out non-import entries; 'User edits only' filters out import entries", async () => {
    const user = userEvent.setup();
    const importAudit: AuditEntry = mkAudit({
      id: "a1",
      entityId: "P0000001",
      ts: "2026-04-29T11:42:00.000Z",
      kind: "hr_import",
      action: "update",
      importId: "imp-2026-04",
      before: { puCode: "PL01NC03" },
      after: { puCode: "PL01NC04" },
    });
    const userEditAudit: AuditEntry = mkAudit({
      id: "a2",
      entityId: "P0000001",
      ts: "2026-04-12T09:13:00.000Z",
      kind: "capability_change",
      action: "update",
      before: { capabilities: ["Java"] },
      after: { capabilities: ["Java", "Kafka"] },
    });
    useAppStore.setState({ audit: [importAudit, userEditAudit] });

    renderWithRouter("P0000001");

    // Both visible at first.
    expect(screen.getByText(/HR import/i)).toBeInTheDocument();
    expect(screen.getByText(/Capability change/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Imports only/i }));
    expect(screen.getByText(/HR import/i)).toBeInTheDocument();
    expect(screen.queryByText(/Capability change/i)).toBeNull();

    await user.click(screen.getByRole("button", { name: /User edits only/i }));
    expect(screen.queryByText(/HR import/i)).toBeNull();
    expect(screen.getByText(/Capability change/i)).toBeInTheDocument();
  });

  it("pagination shows when there are more than 25 entries", async () => {
    const user = userEvent.setup();
    const audits: AuditEntry[] = [];
    for (let i = 0; i < 30; i++) {
      audits.push(
        mkAudit({
          id: `a-${i}`,
          entityId: "P0000001",
          ts: `2026-04-${String(28 - (i % 28)).padStart(2, "0")}T${String(i % 24).padStart(2, "0")}:00:00.000Z`,
          kind: "user_edit",
          action: "update",
          before: { germanSpeaker: false },
          after: { germanSpeaker: true },
        }),
      );
    }
    useAppStore.setState({ audit: audits });

    renderWithRouter("P0000001");

    expect(screen.getByText(/Showing 1–25 of 30/i)).toBeInTheDocument();
    const nextBtn = screen.getByRole("button", { name: /Next page/i });
    expect(nextBtn).not.toBeDisabled();
    await user.click(nextBtn);
    expect(screen.getByText(/Showing 26–30 of 30/i)).toBeInTheDocument();
  });

  it("does not show pagination controls when there are 25 or fewer entries", () => {
    const audits: AuditEntry[] = [];
    for (let i = 0; i < 5; i++) {
      audits.push(
        mkAudit({
          id: `a-${i}`,
          entityId: "P0000001",
          ts: `2026-04-${String(20 + i).padStart(2, "0")}T10:00:00.000Z`,
          kind: "user_edit",
          action: "update",
          before: { germanSpeaker: false },
          after: { germanSpeaker: true },
        }),
      );
    }
    useAppStore.setState({ audit: audits });

    renderWithRouter("P0000001");

    expect(screen.queryByRole("button", { name: /Next page/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Previous page/i })).toBeNull();
  });

  it("clicking an hr_import entry navigates to /ingest/hr/results/:importId", async () => {
    const user = userEvent.setup();
    const audit: AuditEntry = mkAudit({
      id: "a1",
      entityId: "P0000001",
      ts: "2026-04-29T11:42:00.000Z",
      kind: "hr_import",
      action: "update",
      importId: "imp-xyz",
      before: { puCode: "PL01NC03" },
      after: { puCode: "PL01NC04" },
    });
    useAppStore.setState({ audit: [audit] });

    const locationSpy = vi.fn();
    function LocationProbe() {
      const loc = useLocation();
      locationSpy(loc.pathname);
      return null;
    }

    render(
      <MemoryRouter initialEntries={["/people/P0000001"]}>
        <Routes>
          <Route
            path="/people/:localNumber"
            element={
              <>
                <EmployeeChangeHistory localNumber="P0000001" />
                <LocationProbe />
              </>
            }
          />
          <Route
            path="/ingest/hr/results/:importId"
            element={<LocationProbe />}
          />
        </Routes>
      </MemoryRouter>,
    );

    locationSpy.mockClear();
    const importRow = screen.getByRole("button", { name: /Open import results for 2026-04/i });
    await user.click(importRow);

    expect(locationSpy).toHaveBeenCalledWith("/ingest/hr/results/imp-xyz");
  });

  it("does not make non-import entries clickable", () => {
    const audit: AuditEntry = mkAudit({
      id: "a2",
      entityId: "P0000001",
      ts: "2026-04-12T09:13:00.000Z",
      kind: "capability_change",
      action: "update",
      before: { capabilities: ["Java"] },
      after: { capabilities: ["Java", "Kafka"] },
    });
    useAppStore.setState({ audit: [audit] });

    renderWithRouter("P0000001");

    // Capability-change rows render the kind chip but no clickable role=button.
    expect(screen.getByText(/Capability change/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Open import results/i })).toBeNull();
  });
});
