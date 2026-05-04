import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import type { AppState } from "../store";
import {
  buildExportTables,
  buildWorkbook,
  EXPORT_SCHEMA_VERSION,
  exportStateToJsonBlob,
  exportWorkbookToBlob,
} from "./dataExport";
import { validateWorkbook } from "./dataImport";

function fakeState(): AppState {
  // Minimal AppState for export/import tests. Only the slices read by the
  // export path matter — unrelated actions are stubs.
  return {
    productionUnits: [
      { code: "PU1", shortName: "X", displayName: "X unit", sbu: "SBU", bu: "BU", parentCode: null, sortOrder: 1, active: true },
    ],
    sbus: [{ code: "SBU", displayName: "SBU", sortOrder: 10 }],
    bus: [{ code: "BU", displayName: "BU", sbuCode: "SBU", sortOrder: 10 }],
    marketUnits: [{ code: "MU1", displayName: "MU1", buCode: "BU" }],
    locations: [],
    grades: [],
    projects: [
      {
        projectNumber: "P-001",
        name: "Alpha",
        customer: "Acme",
        marketUnit: "MU1",
        kind: "project",
        isBillable: true,
        status: "active",
        tags: ["tag-a", "tag-b"],
      },
    ],
    capabilities: [],
    employees: [
      {
        localNumber: "P100",
        firstName: "A",
        lastName: "B",
        displayName: "A B",
        puCode: "PU1",
        gradeCode: "C1",
        jobFunction: "CSS",
        locationCode: "WRO",
        startDate: "2024-01-01",
        fteCapacity: 1,
        engagement: "perm",
        skills: [],
      },
    ],
    snapshots: [],
    gfsHours: [],
    joiners: [],
    leavers: [],
    contractOfMandate: [],
    transfers: [],
    cycles: [
      {
        id: "FC-1",
        label: "FC 1",
        periodOpened: "2026-04",
        status: "editing",
        openedBy: "demo",
      },
    ],
    activeCycleId: "FC-1",
    previousCycleId: "FC-0",
    forecastCells: [
      { cycleId: "FC-1", puCode: "PU1", period: "2026-04", metric: "FTE", value: 10, source: "seed" },
    ],
    lockedSnapshots: {},
    budget: [],
    pipeline: [],
    projectDemand: [],
    scenarios: [],
    comments: [],
    audit: [],
    anomalies: [],
    dqChecks: [],
    workingCalendar: [{ period: "2026-04", workingDays: 20, workingHours: 160 }],
    role: "controller",
    user: { name: "Demo", email: "demo@example.com" },
    filter: {},
    theme: "light",
    density: "comfortable",
  } as unknown as AppState;
}

describe("dataExport", () => {
  it("buildExportTables includes every whitelisted slice", () => {
    const tables = buildExportTables(fakeState());
    const names = tables.map((t) => t.name);
    expect(names).toContain("productionUnits");
    expect(names).toContain("projects");
    expect(names).toContain("employees");
    expect(names).toContain("forecastCells");
    expect(names).toContain("workingCalendar");
    expect(names).toContain("audit");
  });

  it("exportWorkbookToBlob produces an xlsx blob that can be parsed back", () => {
    const blob = exportWorkbookToBlob(fakeState());
    expect(blob.type).toMatch(/spreadsheetml/);
    expect(blob.size).toBeGreaterThan(1024);
  });

  it("exportStateToJsonBlob round-trips the data", async () => {
    const blob = exportStateToJsonBlob(fakeState());
    const text = await blob.text();
    const parsed = JSON.parse(text);
    expect(parsed.schemaVersion).toBe(EXPORT_SCHEMA_VERSION);
    expect(parsed.tables.projects).toHaveLength(1);
    expect(parsed.tables.projects[0].projectNumber).toBe("P-001");
  });

  it("workbook round-trips through validateWorkbook with zero errors", async () => {
    const state = fakeState();
    const wb = buildWorkbook(state);
    // Simulate the user downloading + re-uploading: serialize then re-parse.
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
    const rewb = XLSX.read(buf, { type: "array" });
    const report = validateWorkbook(rewb);
    expect(report.ok).toBe(true);
    expect(report.errors).toHaveLength(0);
    const projects = report.tables.find((t) => t.name === "projects");
    expect(projects?.kept).toBe(1);
    expect(report.patch.projects?.[0].tags).toEqual(["tag-a", "tag-b"]);
    expect(report.patch.forecastCells?.[0].value).toBe(10);
  });
});
