# ADR-0001 — Testing stack: Vitest + React Testing Library

- Status: Accepted
- Date: 2026-04-22
- Deciders: Orchestrator (Claude Opus 4.7) + user

## Context

The repo has zero tests today. Any autonomous-development story depends on
automatic verification, which depends on a test runner that:

- Reads the same TypeScript + Vite + JSX pipeline as the app, so tests don't
  drift from production behavior.
- Starts in under a second for single-file hook-triggered runs.
- Integrates with `@testing-library/react` for component tests.
- Has a coverage reporter that works out of the box.

## Decision

Adopt **Vitest** as the unit + integration test runner, with:

- `@testing-library/react` + `@testing-library/jest-dom` for component
  assertions.
- `jsdom` as the environment for component tests; `node` for lib tests.
- `@vitest/coverage-v8` for coverage.
- Tests **co-located** with source (`foo.ts` → `foo.test.ts`).

E2E via **Playwright** is in ADR-0003 and gated behind `RUN_E2E=1`. MSW is
deliberately excluded until the app gains network calls.

## Consequences

Positive
- Zero-config alignment with Vite — the same `vite.config.ts` drives both.
- Fast single-file runs → the post-edit hook can afford to re-run tests on
  every `Write`.
- RTL encourages accessibility-first queries, which improves component APIs.

Negative / trade-offs
- Vitest's API differs slightly from Jest; engineers used to Jest have to
  learn `vi` instead of `jest`. Minor.
- Coverage via v8 is slightly less accurate on ternaries than Istanbul, but
  we don't gate on percentages.

Rejected alternatives
- **Jest** — slower startup, requires ts-jest / Babel pipeline separate
  from Vite's, diverges from production config.
- **Cypress Component Testing** — slower feedback loop, heavier runtime.
