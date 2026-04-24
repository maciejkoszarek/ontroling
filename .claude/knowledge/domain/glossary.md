---
title: Domain Glossary
owner: domain-analyst
---

# CCA PracticeView — Domain Glossary

Terms are listed alphabetically. Where a term has a specific interpretation
in this codebase that differs from industry default, the codebase definition
wins.

## Core capacity metrics

**Headcount (HC)** — Number of employees on the PU roster at a given point
in time. `HC_BEGIN` is the count at the start of a period, `HC_END` at the
end. Related: `JOINERS`, `LEAVERS`. Invariant: `HC_END = HC_BEGIN + JOINERS −
LEAVERS`.

**FTE** — Full-time equivalent. Weighted headcount: a person at
`fteCapacity = 0.8` counts as 0.8 FTE. Integer in practice, displayed with 1
decimal. Never exceeds HC by more than rounding.

**bFTE (Billable FTE)** — Capacity actually recovered against client
projects. bFTE ≤ FTE. The gap is vacations, internal projects, bench, L&D,
management reserve, overtime / unpaid-leave adjustments.

**ARVE** — "Adjusted Revenue per FTE". In this repo it is a utilization-like
ratio, stored on `EmployeeMonthSnapshot.arve` and on `ForecastCell` as
`ARVE_PCT`. Range **0..1.2** (1.2 caps overtime contribution). Interpretation:
share of FTE that generates revenue after overlays (overtime / leave) are
applied. **Not a percentage of revenue** — the name is historical.

**ARVE_BASE** — FTE_CSS minus vacation and unpaid leave; the denominator used
before the ARVI ratio (row 107 of the source workbook).

**ARVI_PCT** — ARVE *improvement* ratio; an alternative utilization view.

## Forecast metrics (30 total)

See [metrics.md](metrics.md) for the full list with formulas. Key ones:

- `F1` — first-tier forecast commit (most likely landing).
- `F2` — second-tier / stretch commit.
- `F_TOTAL = F1 + F2`.
- `HC_BEGIN`, `HC_END`, `JOINERS`, `LEAVERS` — as above.
- `FTE`, `BFTE`, `ARVE_PCT`.
- IDC overlays: `FTE_LOST`, `OVERTIME_FTE`, `UNPAID_LEAVE_FTE`,
  `VACATION_FTE`, `SICKNESS_FTE`, `FTE_CSS`, `ARVE_BASE`.
- IDC bucket breakdown: `BENCH_FTE`, `LND_FTE`, `RECRUITMENT_FTE`, `MAN_FTE`,
  `RESERVE_FTE`, `BDC_SOLD_FTE`, `BDC_PL_FTE`, `INTERNAL_PROJECTS_FTE`.
- Ratios (0..1): `BENCH_PCT`, `LND_PCT`, `VACATION_PCT`, `ARVI_PCT`.
- Students bucket: `STUDENTS_HC`.

## Organisation

**Production Unit (PU)** — A delivery unit. 10 real + 2 virtual roll-ups:

| Code | Short name | Notes |
| --- | --- | --- |
| `PL01NC01` | CCA_Head | Head |
| `PL01NC08` | CCA_Cloud_Native | |
| `PL01NC09` | CCA_Complex_Transformation | |
| `PL01NC03..07` | CCA_SE1..SE5 | Children of `CCA_SE_TOTAL` |
| `PL01NC10` | CCA_EEC | Engineering Excellence Center |
| `CCA_SE_TOTAL` | virtual | roll-up of SE1..SE5 |
| `CCA_TOTAL` | virtual | roll-up of **all leafPuCodes** |

`leafPuCodes` and `sePuCodes` live in [src/lib/demoData.ts:46-47](src/lib/demoData.ts).

**Market Unit (MU)** — Commercial segment: `AUTO`, `VW_GROUP`, `MHT`,
`BANKING`, `TELCO`, `PUBLIC`, `ENERGY`, `RETAIL`, `INTERNAL`.

**Grade** — Career level: `A5` (intern), `B1`/`B2` (dev), `C1`/`C2` (senior),
`D1` (management), `NG` (dev, new-grad), `Z` (contractor). Family and
contractor flag in [src/types.ts:32](src/types.ts).

**Job function** — `"CSS" | "EEC" | "Z"`.

**Location** — `WRO`, `POZ`, `GDN`, `WAW`, `KRK`, `REMOTE` (all PL).

## Cycle lifecycle

A forecast **cycle** (e.g. "FC April 2026") has this state machine:

```
open → editing → reconciling → locked → archived
         │            │
         │            └─ writes blocked, DQ + commentary still open
         └─ writes allowed for controllers and PU leads
```

Transitions live on the store: `openCycle`, `startEditing`, `startReconciling`,
`lockCycle`, `archiveCycle`. Lock **snapshots** all cells of that cycleId into
`lockedSnapshots[cycleId]`; after lock, `effectiveCells()` serves the snapshot
for that cycle and ignores live writes. Only `role === "controller"` can lock.

## Variance attribution

`attributeVariance(deltaFte)` ([forecast.ts:238](src/lib/forecast.ts)) splits
a delta into 6 drivers: **joiners**, **leavers**, **movers**, **project_ramp**,
**arve_drift**, **other**. Current implementation is a heuristic split; in
production it would be derived from joiner/leaver/project deltas.

## Anchoring

There is no hard-coded "current month". `currentPeriod()` in
[src/lib/utils.ts:74](src/lib/utils.ts) reads `new Date()`. Keep that. Demo
seeds are deterministic (see `seededRandom` in `utils.ts`) so screens populate
consistently across reloads, but the *current period* itself is live.

## Roles

`controller`, `pu_lead`, `finance`, `hr`, `viewer`. See [rbac.md](rbac.md) for
the capability matrix.
