---
title: Domain Invariants
owner: data-integrity
---

# Domain invariants

These statements must hold at all times. The `data-integrity` agent treats any
violation as a merge blocker. Unit tests enforce them on seeded data and on
parser output.

## Arithmetic

| ID | Invariant | Scope |
| --- | --- | --- |
| I1 | `HC_END(p) = HC_BEGIN(p) + JOINERS(p) − LEAVERS(p)` | per cycle × PU × period |
| I2 | `HC_BEGIN(p+1) = HC_END(p)` | per cycle × PU, period transition |
| I3 | `F_TOTAL = F1 + F2` | per cell identity |
| I4 | `0 ≤ ARVE_PCT ≤ 1.2` | per cell |
| I5 | `BFTE ≤ FTE` | per cell |
| I6 | All `_PCT` metrics ∈ `[0, 1]` (except `ARVE_PCT`, see I4) | per cell |
| I7 | `FTE_CSS = FTE + OVERTIME_FTE − UNPAID_LEAVE_FTE` | per cell |
| I8 | `ARVE_BASE = FTE_CSS − VACATION_FTE − UNPAID_LEAVE_FTE` | per cell |

## Roll-up

| ID | Invariant |
| --- | --- |
| I9 | `CCA_TOTAL` value for additive metric = Σ over `leafPuCodes` of that metric |
| I10 | `CCA_SE_TOTAL` value for additive metric = Σ over `sePuCodes` (PL01NC03..07) |
| I11 | For `PCT_METRICS`, virtual-PU roll-up is **FTE-weighted** average, not sum |
| I12 | `leafPuCodes` and `sePuCodes` never include virtual codes |

## Identity / key uniqueness

| ID | Invariant |
| --- | --- |
| I13 | `(cycleId, puCode, period, metric, grade ?? "∅", mu ?? "∅")` is unique across `forecastCells` |
| I14 | `employee.localNumber` is unique across `employees` |
| I15 | `project.projectNumber` is unique across `projects` |
| I16 | `ForecastIndex` rebuild must be idempotent |

## Lifecycle

| ID | Invariant |
| --- | --- |
| I17 | Live writes to a `locked` or `archived` cycle are ignored by `effectiveCells` |
| I18 | `lockedSnapshots[cycleId]` is set **only** when a cycle enters `locked` status |
| I19 | Only `role === "controller"` can call `lockCycle` or `archiveCycle` |
| I20 | Cycle status transitions follow: open → editing → reconciling → locked → archived (no skips backwards) |

## Persistence

| ID | Invariant |
| --- | --- |
| I21 | localStorage key is `cca-practiceview-v1` |
| I22 | Any schema change that is not forward-compatible must bump the key suffix (`v2`, `v3`, …) |
| I23 | `resetToDemo()` fully reseeds — no stale fields remain |

## RBAC (see [rbac.md](rbac.md) for the matrix)

| ID | Invariant |
| --- | --- |
| I24 | `viewer` can read all screens but mutate nothing |
| I25 | `pu_lead` can edit forecast cells only for their PU scope |
| I26 | `finance` and `hr` cannot edit forecast cells |

## Audit

| ID | Invariant |
| --- | --- |
| I27 | Every forecast mutation appends exactly one `AuditEntry` with action `create` or `update` |
| I28 | Every cycle transition appends one `AuditEntry` with the matching action |
