import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import HrMappingEditor from "./HrMappingEditor";
import { useAppStore } from "../../store";
import type { Role } from "../../types";

function reset(role: Role = "controller") {
  localStorage.clear();
  useAppStore.getState().resetToDemo();
  useAppStore.setState({ role });
}

describe("HrMappingEditor", () => {
  beforeEach(() => {
    reset("controller");
  });

  it("renders both Production Unit and People Unit sections", () => {
    render(<HrMappingEditor />);
    expect(screen.getByText(/HR Mapping — Production Unit/i)).toBeInTheDocument();
    expect(screen.getByText(/HR Mapping — People Unit/i)).toBeInTheDocument();
  });

  it("controller role shows Add / Edit / Delete affordances", () => {
    render(<HrMappingEditor />);
    expect(screen.getAllByLabelText(/Save Production Unit mapping/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByLabelText(/Save People Unit mapping/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByLabelText(/Edit mapping for/i).length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText(/Delete mapping for/i).length).toBeGreaterThan(0);
  });

  it("non-controller role hides Add / Edit / Delete affordances", () => {
    reset("hr");
    render(<HrMappingEditor />);
    expect(screen.queryByLabelText(/Save Production Unit mapping/i)).toBeNull();
    expect(screen.queryByLabelText(/Save People Unit mapping/i)).toBeNull();
    expect(screen.queryAllByLabelText(/Edit mapping for/i)).toHaveLength(0);
    expect(screen.queryAllByLabelText(/Delete mapping for/i)).toHaveLength(0);
    expect(screen.getByText(/Read-only view/i)).toBeInTheDocument();
  });

  it("Add flow: typing source + selecting target + clicking Save creates a new mapping", async () => {
    const user = userEvent.setup();
    const before = useAppStore.getState().hrMappings.length;

    render(<HrMappingEditor />);

    const sourceInput = screen.getByLabelText(/Add Production Unit source value/i);
    await user.clear(sourceInput);
    await user.type(sourceInput, "Brand New PU Source");

    const targetSelect = screen.getByLabelText(/Add Production Unit target/i) as HTMLSelectElement;
    const chosenCode = targetSelect.options[0].value;
    await user.selectOptions(targetSelect, chosenCode);

    const saveBtn = screen.getByLabelText(/Save Production Unit mapping/i);
    await user.click(saveBtn);

    const after = useAppStore.getState().hrMappings;
    expect(after.length).toBe(before + 1);
    const created = after.find((m) => m.source === "Brand New PU Source");
    expect(created).toBeDefined();
    expect(created?.kind).toBe("production_unit");
    expect(created?.targetCode).toBe(chosenCode);
    expect(created?.active).toBe(true);
  });

  it("Add flow respects the section kind for People Unit", async () => {
    const user = userEvent.setup();
    render(<HrMappingEditor />);

    const sourceInput = screen.getByLabelText(/Add People Unit source value/i);
    await user.clear(sourceInput);
    await user.type(sourceInput, "Some HR People Unit");

    const saveBtn = screen.getByLabelText(/Save People Unit mapping/i);
    await user.click(saveBtn);

    const created = useAppStore
      .getState()
      .hrMappings.find((m) => m.source === "Some HR People Unit");
    expect(created).toBeDefined();
    expect(created?.kind).toBe("people_unit");
  });

  it("duplicate prevention: pre-check disables Save and the store size does not change", async () => {
    const user = userEvent.setup();
    const seeded = useAppStore.getState().hrMappings.find((m) => m.kind === "production_unit");
    if (!seeded) throw new Error("expected at least one seeded production_unit mapping");

    const before = useAppStore.getState().hrMappings.length;

    render(<HrMappingEditor />);

    const sourceInput = screen.getByLabelText(/Add Production Unit source value/i);
    await user.clear(sourceInput);
    await user.type(sourceInput, seeded.source);

    const saveBtn = screen.getByLabelText(/Save Production Unit mapping/i);
    expect(saveBtn).toBeDisabled();
    expect(useAppStore.getState().hrMappings.length).toBe(before);
  });

  it("delete flow: confirm calls removeHrMapping; cancel does nothing", async () => {
    const user = userEvent.setup();
    const seeded = useAppStore.getState().hrMappings.find((m) => m.kind === "production_unit");
    if (!seeded) throw new Error("expected seeded mapping");

    render(<HrMappingEditor />);

    const deleteButtons = screen.getAllByLabelText(
      new RegExp(`Delete mapping for ${escapeRegex(seeded.source)}`),
    );
    expect(deleteButtons.length).toBeGreaterThan(0);

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    await user.click(deleteButtons[0]);
    expect(useAppStore.getState().hrMappings.some((m) => m.id === seeded.id)).toBe(true);

    confirmSpy.mockReturnValue(true);
    await user.click(deleteButtons[0]);
    expect(useAppStore.getState().hrMappings.some((m) => m.id === seeded.id)).toBe(false);

    confirmSpy.mockRestore();
  });

  it("edit flow: opens dropdown + note input; Save persists target & note", async () => {
    const user = userEvent.setup();
    const seeded = useAppStore.getState().hrMappings.find((m) => m.kind === "production_unit");
    if (!seeded) throw new Error("expected seeded mapping");
    // Pick another active leaf PU as the new target.
    const otherPu = useAppStore
      .getState()
      .productionUnits.find((p) => p.active && !p.isVirtual && p.code !== seeded.targetCode);
    if (!otherPu) throw new Error("expected at least two active leaf PUs");

    render(<HrMappingEditor />);

    const editBtn = screen.getAllByLabelText(
      new RegExp(`Edit mapping for ${escapeRegex(seeded.source)}`),
    )[0];
    await user.click(editBtn);

    const targetSelect = screen.getByLabelText(/Edit target production unit/i) as HTMLSelectElement;
    await user.selectOptions(targetSelect, otherPu.code);

    const noteInput = screen.getByLabelText(/Edit mapping note/i);
    await user.type(noteInput, "test note");

    const saveBtn = screen.getByLabelText(/^Save mapping$/i);
    await user.click(saveBtn);

    const updated = useAppStore.getState().hrMappings.find((m) => m.id === seeded.id);
    expect(updated?.targetCode).toBe(otherPu.code);
    expect(updated?.note).toBe("test note");
    // Identity preserved.
    expect(updated?.id).toBe(seeded.id);
    expect(updated?.createdAt).toBe(seeded.createdAt);
  });

  it('"Unmapped values" empty state renders when no imports exist', () => {
    render(<HrMappingEditor />);
    const emptyMessages = screen.getAllByText(
      /No unmapped values yet — appears here after the next HR import\./i,
    );
    expect(emptyMessages.length).toBe(2);
  });

  it("source field is trimmed before being persisted", async () => {
    const user = userEvent.setup();
    render(<HrMappingEditor />);

    const sourceInput = screen.getByLabelText(/Add People Unit source value/i);
    await user.clear(sourceInput);
    await user.type(sourceInput, "   Padded Value   ");

    const saveBtn = screen.getByLabelText(/Save People Unit mapping/i);
    await user.click(saveBtn);

    const created = useAppStore
      .getState()
      .hrMappings.find((m) => m.kind === "people_unit" && m.source === "Padded Value");
    expect(created).toBeDefined();
  });

  it("add form is disabled while source is empty", () => {
    render(<HrMappingEditor />);
    const saveBtn = screen.getByLabelText(/Save Production Unit mapping/i);
    expect(saveBtn).toBeDisabled();
  });

  it("renders the pre-seeded mappings (source + target label)", () => {
    render(<HrMappingEditor />);
    const seeded = useAppStore.getState().hrMappings.find((m) => m.kind === "production_unit");
    if (!seeded) throw new Error("expected seeded mapping");
    const target = useAppStore
      .getState()
      .productionUnits.find((p) => p.code === seeded.targetCode);
    if (!target) throw new Error("expected target PU");

    const productionSection = screen
      .getByText(/HR Mapping — Production Unit/i)
      .closest("div.card") as HTMLElement;
    expect(productionSection).not.toBeNull();
    expect(within(productionSection).getAllByText(seeded.source).length).toBeGreaterThan(0);
    expect(
      within(productionSection).getAllByText(`${target.code} — ${target.shortName}`).length,
    ).toBeGreaterThan(0);
  });
});

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
