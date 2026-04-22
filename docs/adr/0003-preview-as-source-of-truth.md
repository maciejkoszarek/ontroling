# ADR-0003 — Preview as the source of truth for UI changes

- Status: Accepted
- Date: 2026-04-22
- Deciders: Orchestrator (Claude Opus 4.7) + user

## Context

Typecheck + unit tests verify *code correctness*; they do not verify
*feature correctness*. A component can render, pass its test, and still
display the wrong value or break an ECharts rendering that has no test
coverage.

Claude Code ships `preview_*` tools that run the dev server, click through
the live app, read the DOM, check console/network, and screenshot. These are
the right verification layer for UI changes in this project because:

- No backend → preview IS the full stack.
- ECharts and dense tables are hard to unit-test deeply; a snapshot-and-click
  run is far more informative.
- The user-visible feature is the contract, not the component API.

## Decision

For every change that is visible in the browser:

1. `qa-verifier` starts the dev server (`preview_start`).
2. Navigates to the affected route(s) (`preview_snapshot`).
3. Checks console and network for errors (`preview_console_logs`,
   `preview_network`).
4. Interacts if interaction is part of the change (`preview_click`,
   `preview_fill`).
5. Captures a screenshot (`preview_screenshot`) for the user-visible
   summary.

The verdict is PASS / FAIL. A FAIL blocks the commit unless the user
overrides.

Playwright (ADR-0001) remains as a future complement for deterministic
smoke tests in CI, but preview is the per-change contract **now**.

## Scope exceptions

Preview verification is **not** required when the change cannot affect the
browser: pure library refactors with no call-site change, build tooling,
knowledge files, ADRs, test-only edits.

## Consequences

Positive
- Catches visual regressions and ECharts/layout breaks that unit tests miss.
- Forces the feature-developer to think in user flows, not just function
  signatures.

Negative / trade-offs
- Preview adds seconds to each autonomous turn. Acceptable.
- Requires the dev server to be healthy; flaky start surfaces as false
  negatives. Mitigation: the `qa-verifier` retries `preview_start` once on
  transient failure.

Rejected alternatives
- **Visual regression tool (Percy/Chromatic)** — heavier, external service,
  overkill for a prototype.
- **Unit-test everything** — unachievable for chart-heavy UIs and hides
  layout bugs.
