---
title: Theming
owner: architect
---

# Theming

CSS-variable-driven light/dark, plus a density toggle. No runtime CSS-in-JS.

## How it works

- All colors are CSS variables set on `:root` (light) and `.dark` (dark). See
  [src/index.css:5-39](src/index.css).
- Tailwind consumes those variables via `bg-bg`, `text-fg`, `border-border`,
  `text-brand`, etc. — Tailwind theme config maps the variable names to
  utilities. See [tailwind.config.js](tailwind.config.js).
- Theme switch toggles the `.dark` class on `document.documentElement`:

  ```ts
  // src/App.tsx:27-29
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);
  ```

## Variables (both themes have these)

```
--bg, --bg-card, --bg-hover, --bg-muted
--fg, --fg-muted, --fg-subtle
--border, --border-strong
--brand, --brand-fg, --brand-subtle
--success, --warning, --danger
```

Values are `r g b` triplets (no commas) so Tailwind can do
`bg-brand/10` (brand @ 10% opacity) via the `<alpha-value>` substitution.

## Reusable classes (in `@layer components`)

`card`, `btn`, `btn-primary`, `btn-ghost`, `chip`, `pill`, `pill-success`,
`pill-warning`, `pill-danger`, `pill-brand`, `input`, `kbd`, `nav-link`,
`section-title`, `table-th`, `table-td`.

Prefer these over one-off utility stacks — visual consistency comes from
reusing the class, not from re-inventing the composition every page.

## Density

`density ∈ { "comfortable", "compact" }` on the store. Consumed ad-hoc in
pages that render dense tables (e.g. metric grid row heights). There is no
global `data-density` attribute today; pages read from the store directly.

## Adding a color

1. Add the variable to both `:root` and `.dark` in `src/index.css`.
2. Add a mapping in `tailwind.config.js` → `theme.extend.colors`.
3. Update this file.

## Charts

ECharts tooltips inherit the app font via the `.echarts-tooltip` override in
`src/index.css`. Chart palettes are declared inline in each chart component —
pulling from the CSS variables via `getComputedStyle(document.documentElement)`
if a dynamic color is needed.
