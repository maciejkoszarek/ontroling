---
title: Routing
owner: architect
---

# Route map

All routes are declared in [src/App.tsx:31-57](src/App.tsx). React Router v6.

| Path | Component | Purpose |
| --- | --- | --- |
| `/` | `Cockpit` | KPI strip + trend + variance leaderboard + anomalies + commentary |
| `/pu` | redirects to `/pu/CCA_TOTAL` | |
| `/pu/:code` | `PuDetail` | Editable metric grid, joiners/leavers, drivers, comments |
| `/trends` | `Trends` | HC/FTE/bFTE/ARVE trend with toggles + PU filter |
| `/fcfc` | `FcFc` | Cycle-vs-cycle heatmap + top movements + attribution |
| `/fc-vs-budget` | `FcVsBudget` | Heatmap + full-year landing table |
| `/people-flow` | `PeopleFlow` | Joiners/leavers, rolling 12m, attrition |
| `/arve` | `Arve` | Employee × month matrix, rolling-3m toggle, histogram |
| `/mu` | `MarketUnit` | MU × month heatmap, stacked FTE, top projects |
| `/projects` | `Projects` | Demand forecast table, MU/billable filters |
| `/projects/:projectNumber` | `ProjectDetail` | Single-project drill-down |
| `/people` | `People` | Employee roster |
| `/people/:localNumber` | `PersonDetail` | Single-person drill-down |
| `/pipeline` | `Pipeline` | Kanban by MU, weighted FTE, probability |
| `/bench` | `Bench` | Low-ARVE people, matched projects by skill overlap |
| `/scenarios` | `Scenarios` | What-if forks, promote to canonical |
| `/dq` | `DQ` | Reconciliation checks, waive-with-comment |
| `/review-pack` | `ReviewPack` | Wizard → PDF/PPTX export (stub today) |
| `/ingestion` | `Ingestion` | Excel upload / export / reset |
| `/admin` | `Admin` | Cycles, role switcher, theme, density, RBAC |
| `*` | redirects to `/` | |

## Adding a new page

See [../playbooks/add-new-page.md](../playbooks/add-new-page.md). Checklist:

1. Create `src/pages/<Name>.tsx`.
2. Add a `<Route>` line in `App.tsx`.
3. Add a nav link in `src/components/Layout.tsx` sidebar.
4. (Optional) RBAC gating — gate with `role === "controller"` style checks
   at the page root, not in the router.
5. Mirror the row in this file.
