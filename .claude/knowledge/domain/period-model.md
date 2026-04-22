---
title: Period Model
owner: domain-analyst
---

# Period model

## Shape

`Period = "YYYY-MM"`. String, lexicographically comparable (that's why it's a
string and not a `Date`). Always padded (`2026-04`, never `2026-4`). See
[src/types.ts:4](src/types.ts).

## Anchoring

`currentPeriod()` in [src/lib/utils.ts:74](src/lib/utils.ts) returns the
**UTC** current month from `new Date()`. This is intentional:

- Not frozen. Reloading on a different day can shift the period.
- UTC-based, so DST / local-time boundary effects do not re-anchor the
  rolling window.

The 24-month rolling window shown across the app is `currentPeriod() − 11 …
currentPeriod() + 12`. Historical + forward views derive from this.

## Arithmetic

Always use:

- `periodAdd(p, n)` — months arithmetic (negative n for previous months).
- `periodRange(from, to)` — inclusive array of periods.
- `periodLabel(p, mode)` — "Mar 26" / "March 2026" / "Mar 26" (year-short).
- `monthShort(p)` — "Mar".

**Never** write `p.split("-")` or `new Date(p)` inline. Those inline
conversions are the biggest source of off-by-one and timezone bugs.

## Common patterns

### Previous period

```ts
const prev = periodAdd(p, -1);
```

### Full-year window

```ts
const yearStart = `${p.split("-")[0]}-01`;  // acceptable because start-of-year is flat
const yearEnd   = `${p.split("-")[0]}-12`;
const months    = periodRange(yearStart, yearEnd);
```

### Rolling 12 actuals + 12 forecast around `currentPeriod`

```ts
const cp = currentPeriod();
const window = periodRange(periodAdd(cp, -11), periodAdd(cp, 12));
```

## Gotchas

- **Excel dates**: the parser converts Excel serials via
  `XLSX.SSF.parse_date_code`. Resulting JS `Date` is then formatted to
  `"YYYY-MM"`. See `src/lib/excelParser.ts`.
- **Timezone**: the in-app functions use `Date.UTC(...)` to avoid local-time
  rollover at month boundaries.
- **Sort order**: string comparison on `"YYYY-MM"` is equivalent to
  chronological. Do not convert to `Date` before sorting.
