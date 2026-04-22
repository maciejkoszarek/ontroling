---
title: Testing conventions
owner: test-engineer
---

# Testing conventions

## Stack

- **Vitest** + **@testing-library/react** + **jsdom** for unit / integration.
- **@vitest/coverage-v8** for coverage reporting.
- **Playwright** (phase 7, deferred) for E2E smoke.
- **MSW** — not used (no network calls yet).

## Where tests live

Co-located with the source file.

```
src/lib/utils.ts              →  src/lib/utils.test.ts
src/lib/forecast.ts           →  src/lib/forecast.test.ts
src/pages/Cockpit.tsx         →  src/pages/Cockpit.test.tsx
src/store.ts                  →  src/store.<feature>.test.ts   (one file per feature)
```

Fixtures in `src/__fixtures__/`. Setup + global matchers in
`src/__tests__/setup.ts`.

E2E specs (when added) in `e2e/*.spec.ts`.

## Commands

```bash
npm run test              # vitest run — single pass, for CI + hooks
npm run test:watch        # vitest — watch mode
npm run test:coverage     # vitest run --coverage
npm run check             # typecheck + lint + test (used by pre-commit hook)
```

## What to test first (priority for back-fill)

1. `src/lib/utils.ts` — `periodAdd` / `periodRange` edge cases, `seededRandom`
   determinism.
2. `src/lib/forecast.ts` — `ForecastIndex` get/set, virtual-PU roll-ups,
   `effectiveCells` semantics under lock, `attributeVariance` shape.
3. `src/lib/excelParser.ts` — loose column match, date serial parsing, PU
   inference.
4. `src/lib/demoData.ts` — seed determinism + invariants (I1, I3, I4).
5. `src/store.ts` — `lockCycle` behaviour, RBAC gating, `ingest` preserves
   forecast cells, localStorage round-trip.

## What to test for every new feature

- **Pure function** → unit test, table-driven where possible.
- **Store action** → action test asserting state transition + audit entry.
- **Component with logic** → RTL render test asserting visible output for a
  representative state, plus interaction for one user flow.
- **Domain invariant touched** → assertion in `src/__tests__/invariants.test.ts`
  (append to the table).

## Naming

- `describe("ForecastIndex", () => { ... })` — module name.
- `it("returns 0 for a missing cell", ...)` — behavior statement.
- Avoid `should` prefixes.

## Coverage policy

`--coverage` runs are informational. No enforced percentage. The intent is
trend (is coverage going up as we add features?) not gate (don't block on
X%). Gaming coverage by writing trivial getters/setters tests is worse than
a lower number.

## Hook-driven test runs

- On `Write` to any `src/**/*.test.ts(x)` the post-edit hook runs that file
  alone with `vitest run <path>`.
- On `git commit` the pre-commit hook runs `npm run check` (typecheck + lint
  + full test suite).
