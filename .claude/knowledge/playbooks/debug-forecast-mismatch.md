---
name: Debug a forecast mismatch
description: Triage guide when a user reports "the number on screen X does not match screen Y" — which roll-up, cycle, or invariant is most likely broken.
---

# Playbook — debug a forecast mismatch

A "numbers don't match" bug report almost always collapses into one of
four root causes. Walk them in order; stop at the first that fires.

## 0. Capture the report

Ask the user (or infer from the message):

- Which two screens disagree? (Cockpit vs. PU detail, FC/FC vs. FC/Budget,
  Market Unit heatmap vs. ARVE matrix, …)
- Which `(cycle, puCode, period, metric)` shows the mismatch? Exact codes.
- Expected vs. actual values.

Write these four dimensions down — every diagnostic step filters on them.

## 1. Is a locked-snapshot overriding live edits?

The most common false mismatch. `effectiveCells()` replaces live cells
with the frozen snapshot for any cycle in `locked` / `archived` status.

- `cycles.find(c => c.id === cycleId).status` — if `locked`, the user is
  seeing the frozen snapshot, and any subsequent edits to that cycle in
  `forecastCells` are ignored by read paths.
- Check `lockedSnapshots[cycleId]` — that's the authoritative array for
  frozen cycles.
- Fix: either unlock (only the controller can) or write to a different
  cycle. Document the confusion in `.claude/knowledge/domain/period-model.md`
  if it keeps biting.

## 2. Is the virtual PU roll-up using the wrong algebra?

`CCA_TOTAL` and `CCA_SE_TOTAL` are virtual. For `PCT_METRICS` they use
FTE-weighted averages; for everything else, plain sums. A common bug is
a new percentage metric that was *not* added to `PCT_METRICS`, so the UI
shows a sum (or zero) instead of a weighted mean.

- Check `src/lib/forecast.ts` → `PCT_METRICS` covers `ARVE_PCT`, `ARVI_PCT`,
  `BENCH_PCT`, `LND_PCT`, `VACATION_PCT`. If the reported metric is a
  percentage but missing from the array, that's the bug.
- Also double-check the leaf set. `leafPuCodes` excludes virtual PUs;
  `sePuCodes` is the explicit SE leaf list. A PU whose `isVirtual` flag
  flipped will silently change the roll-up.

## 3. Is the per-grade slice sneaking into the aggregate?

`ForecastCell` has optional `grade` and `mu` axes. Aggregate selectors
filter these out with `if (c.grade || c.mu) continue;`. A new selector
that forgets that filter double-counts.

- Grep for `forecastCells` reads that don't guard against `c.grade` or
  `c.mu` — those are the suspects.
- `ForecastIndex.get()` uses the aggregate-only map; pages using it are
  immune.

## 4. Is the period misaligned?

`Period` is always `YYYY-MM`. Three subtle failure modes:

- `currentPeriod()` in `src/lib/utils.ts` is *dynamic* (`new Date()`),
  but `currentPeriod` in `src/lib/demoData.ts` is the *frozen constant*
  `"2026-03"`. Importing the wrong one shifts every rolling window.
- `rollingPeriods` is derived from the demoData constant; production
  code that computes its own window can drift by a month.
- UTC vs. local: `periodAdd` uses UTC to avoid DST. If a caller built a
  period via `new Date().toISOString().slice(0,7)` that's fine; anything
  using local-time `getMonth()` on a machine near midnight UTC is not.

## After the fix

- Add a regression test in `src/lib/forecast.test.ts` (or `store.test.ts`
  for lifecycle bugs) that fails on the old behavior and passes on the
  new.
- If the bug taught us a new invariant, add it to
  `.claude/knowledge/domain/invariants.md` with an `Iₙ` id.
- If the bug was caused by drift between two knowledge files, fix them
  both and note it in the commit.
