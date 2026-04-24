import { describe, expect, it } from "vitest";
import { classifyProject } from "./demoData";

describe("classifyProject", () => {
  it("classifies plain names as 'project' and keeps the name untouched", () => {
    expect(classifyProject("Acme Migration")).toEqual({ kind: "project", name: "Acme Migration" });
    expect(classifyProject("ORD-42 rollout")).toEqual({ kind: "project", name: "ORD-42 rollout" });
  });

  it("detects the 'opps' suffix and strips it", () => {
    expect(classifyProject("Acme - Opps")).toEqual({ kind: "opportunity", name: "Acme" });
    expect(classifyProject("Acme opps.")).toEqual({ kind: "opportunity", name: "Acme" });
    expect(classifyProject("Acme OPP")).toEqual({ kind: "opportunity", name: "Acme" });
  });

  it("detects the 'ambition' suffix (short + long forms)", () => {
    expect(classifyProject("Acme - amb")).toEqual({ kind: "ambition", name: "Acme" });
    expect(classifyProject("Acme – Ambition")).toEqual({ kind: "ambition", name: "Acme" });
    expect(classifyProject("Acme ambition.")).toEqual({ kind: "ambition", name: "Acme" });
  });

  it("handles en-dash and em-dash separators the same as hyphen", () => {
    expect(classifyProject("Acme – opps")).toEqual({ kind: "opportunity", name: "Acme" });
    expect(classifyProject("Acme — amb")).toEqual({ kind: "ambition", name: "Acme" });
  });

  it("does not mis-classify names that merely contain 'opp' or 'amb' as substrings", () => {
    // 'Opportunistic' / 'Ambient' should NOT be flagged — the regex requires a trailing word
    // after a separator. Keep them as plain projects.
    expect(classifyProject("Opportunistic rewrite")).toEqual({
      kind: "project",
      name: "Opportunistic rewrite",
    });
    expect(classifyProject("Ambient lighting")).toEqual({
      kind: "project",
      name: "Ambient lighting",
    });
  });

  it("trims residual whitespace/punctuation left behind after suffix removal", () => {
    expect(classifyProject("Acme Migration   -   opps")).toEqual({
      kind: "opportunity",
      name: "Acme Migration",
    });
    expect(classifyProject("Acme---amb")).toEqual({ kind: "ambition", name: "Acme" });
  });
});
