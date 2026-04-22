---
title: Naming conventions
owner: architect
---

# Naming & code style

## File naming

| Kind | Convention | Example |
| --- | --- | --- |
| Page component | PascalCase | `src/pages/PuDetail.tsx` |
| Reusable component | PascalCase | `src/components/MetricGrid.tsx` |
| Library module | camelCase | `src/lib/forecast.ts`, `src/lib/excelParser.ts` |
| Test | `<module>.test.ts[x]` co-located | `src/lib/utils.test.ts` |
| Type module | lowercase | `src/types.ts` |
| Store | lowercase | `src/store.ts` |

## Code style

- TypeScript strict mode (`"strict": true` in `tsconfig.app.json`).
- No default exports from library modules — use named exports so call-sites
  are greppable. Pages export default (React Router convention).
- Prefer `type` for domain models, `interface` only where declaration merging
  helps (library internals).
- Enum-like values: union of string literals, not `enum`.
- No classes except the `ForecastIndex` (perf-justified).
- Pure functions in `src/lib/*`. UI concerns in `src/pages/*` and
  `src/components/*`.

## Identifiers

- `puCode` — always the long code like `PL01NC03`, never the short name.
- `cycleId` — `"fc-2026-04"` style. Never rename on the fly.
- `period` — `"YYYY-MM"` string.
- Avoid abbreviation-as-variable (`hc` vs `headcount`). Acronyms OK when
  they're domain terms (`fte`, `bfte`, `arve`).

## Comments

Default: no comments. Add one only when the *why* is non-obvious (a hidden
invariant, a workaround). The codebase has several multi-line JSDoc blocks
on pure functions; keep those brief — one sentence is usually enough.

Never narrate the *what* ("this function maps employees to snapshots") when
the name and types already say it.

## React idioms

- Function components. No class components.
- `useAppStore(s => s.someSlice)` — select narrowly to minimize re-renders.
- Selectors that need multiple slices: call `useAppStore` multiple times,
  each returning one slice. Don't build a mega-selector unless Zustand's
  shallow-equal helper is warranted.
- Derive from props/store in render; avoid `useEffect` for pure derivations.
