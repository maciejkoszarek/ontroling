---
title: Forecast Metrics Catalogue
owner: domain-analyst
---

# Forecast metrics (28)

Every `ForecastCell` carries a `metric` from the union below. The axes are
`(cycleId, puCode, period, metric)` plus optional `grade` and `mu`. Full type
in [src/types.ts:87-121](src/types.ts).

## Headcount & flow (5)

| Metric | Unit | Meaning |
| --- | --- | --- |
| `HC_BEGIN` | count | Headcount on roster at start of period |
| `JOINERS` | count | People joining during the period |
| `LEAVERS` | count | People leaving during the period |
| `HC_END` | count | Headcount at end. **Invariant**: `HC_END = HC_BEGIN + JOINERS − LEAVERS` |
| `STUDENTS_HC` | count | Intern/student bucket (separate from grade A5) |

## Core capacity (3)

| Metric | Unit | Meaning |
| --- | --- | --- |
| `FTE` | 1 dec | Full-time equivalent capacity. Weighted by `fteCapacity` |
| `BFTE` | 1 dec | Billable FTE (recovered against client projects) |
| `ARVE_PCT` | 0..1.2 | Utilization-like ratio. Caps at 1.2 with overtime |

## Commit tiers (3)

| Metric | Unit | Meaning |
| --- | --- | --- |
| `F1` | 1 dec | First-tier forecast commit (most likely landing) |
| `F2` | 1 dec | Second-tier / stretch commit |
| `F_TOTAL` | 1 dec | Total. **Invariant**: `F_TOTAL = F1 + F2` |

## HC → FTE overlays (rows 98–107, 7)

| Metric | Unit | Meaning |
| --- | --- | --- |
| `FTE_LOST` | 1 dec | Capacity lost to absence, not counted elsewhere |
| `OVERTIME_FTE` | 1 dec | Capacity added by overtime |
| `UNPAID_LEAVE_FTE` | 1 dec | Capacity lost to unpaid leave |
| `VACATION_FTE` | 1 dec | Capacity lost to paid vacation |
| `SICKNESS_FTE` | 1 dec | Capacity lost to sickness |
| `FTE_CSS` | 1 dec | FTE after overtime/unpaid leave, before vacation |
| `ARVE_BASE` | 1 dec | `FTE_CSS − vacation − unpaid_leave` (row 107) |

## IDC / non-billable breakdown (rows 123–138, 8)

| Metric | Unit | Meaning |
| --- | --- | --- |
| `BENCH_FTE` | 1 dec | Unallocated capacity |
| `LND_FTE` | 1 dec | Learning & Development (Standard + Onboarding) |
| `RECRUITMENT_FTE` | 1 dec | Time spent on recruiting activity |
| `MAN_FTE` | 1 dec | Management reserve / other / storm |
| `RESERVE_FTE` | 1 dec | Explicit reserve |
| `BDC_SOLD_FTE` | 1 dec | Business Development Costs — billed/sold |
| `BDC_PL_FTE` | 1 dec | Business Development Costs — P&L |
| `INTERNAL_PROJECTS_FTE` | 1 dec | Internal (non-client) project time |

## Ratios (0..1, 4)

| Metric | Meaning |
| --- | --- |
| `BENCH_PCT` | `BENCH_FTE / FTE_CSS` |
| `LND_PCT` | `LND_FTE / FTE_CSS` |
| `VACATION_PCT` | `VACATION_FTE / FTE_CSS` |
| `ARVI_PCT` | ARVE improvement ratio |

## Roll-up rules for virtual PUs

For `CCA_TOTAL` and `CCA_SE_TOTAL`:
- **Sum** for additive metrics (HC, FTE, bFTE, F1, F2, F_TOTAL, all counts).
- **FTE-weighted average** for members of `PCT_METRICS`:
  `ARVE_PCT, ARVI_PCT, BENCH_PCT, LND_PCT, VACATION_PCT` —
  see [src/lib/forecast.ts:84-100](src/lib/forecast.ts).

## Adding a new metric

Follow [../playbooks/add-new-metric.md](../playbooks/add-new-metric.md). Short
version: extend the `ForecastMetric` union in `types.ts`, decide whether it's
a `PCT_METRIC`, seed demo values in `demoData.ts`, render it in `MetricGrid`
if relevant, update this file, add unit tests.
