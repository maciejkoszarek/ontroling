---
name: Add a new page / route
description: End-to-end recipe for adding a page under src/pages/ that reads from the store, appears in the sidebar, and is verified in the browser.
---

# Playbook — add a new page / route

Follow this when adding a screen (e.g. "Scenarios detail", "Ingestion
history"). The target is a page that is wired into routing, protected by
the RBAC model, reads from the Zustand store, and is actually navigated to
and screenshotted in the preview before "done".

## Before you touch code

1. **Confirm the page belongs.** Check `.claude/knowledge/architecture/routing.md`
   — if the screen already exists under a different name, prefer extending it.
2. **Design the read model first.** Which slices of the store do you need?
   If you need a new derived selector, plan to add it to `src/lib/forecast.ts`
   rather than inline in the component.
3. **Decide the RBAC surface.** Which roles can see / edit? The route guard
   lives in `src/App.tsx` / `src/components/Layout.tsx` — mirror an
   existing protected route rather than invent new patterns.

## Implementation

1. **Page component** — `src/pages/NewPage.tsx`. Use
   `useAppStore((s) => s.slice)` with narrow selectors, not the whole state.
   Lean on `KpiCard`, `TrendChart`, `Heatmap`, `MetricGrid` from
   `src/components/` — don't reinvent chart primitives.
2. **Route** — register in `src/App.tsx` (or wherever `createBrowserRouter` /
   `<Routes>` lives). Add a lazy import if the bundle is already large.
3. **Navigation** — add the sidebar entry in `src/components/Layout.tsx`
   with a Lucide icon. Follow the existing sort order.
4. **RBAC** — wrap the route with the existing role guard; if the role set
   is new, extend `.claude/knowledge/domain/rbac.md` and add a store-level
   `canAccess…` helper.

## Tests to add

- **Unit** on any new selector or pure helper (`src/lib/…test.ts`).
- **Component** (optional v1): render the page with a seeded store and
  assert the headline KPI shows.
- **Browser verification** (required):
  - preview_start → navigate to the route → preview_snapshot to confirm
    headings and KPIs.
  - preview_console_logs / preview_logs — zero errors.
  - preview_screenshot for the user-facing changelog.

## Knowledge updates

1. `.claude/knowledge/architecture/routing.md` — new route row.
2. `.claude/knowledge/domain/rbac.md` — if the role matrix changed.
3. If the page introduces a new UI primitive, document it in
   `.claude/knowledge/conventions/naming.md` or a new ADR.

## Done criteria

- [ ] `npm run check` green.
- [ ] preview_start + preview_snapshot confirm the route renders, KPIs
      populate, and the sidebar link is highlighted when active.
- [ ] No console errors / unhandled promise rejections in the preview logs.
- [ ] Screenshot attached to the PR description.
