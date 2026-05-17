# @cujuju/solidjs-glass-menu

A glass-surfaced **menu shell** for SolidJS: an optional header (title +
optional action slot + optional close button) above a scrollable body,
painted with the `.glass-menu` surface from
[`@cujuju/solidjs-glass`](../glass).

`GlassMenu` is **purely presentational**. It paints chrome and nothing
else — it owns no positioning, no `Portal`, no open/close state, and no
dismiss lifecycle. Whatever renders a `GlassMenu` is responsible for
placing it, showing/hiding it, and dismissing it. This is deliberate:
the same shell backs titled dialogs, dropdown option lists, context
menus, and bare information panels, and each of those wants different
positioning and dismiss behaviour.

Because the root element itself carries the `.glass-menu` surface
class, **the caller can make `GlassMenu` the positioned element
directly** — no extra wrapper box between the popover and the glass.

## Install

```sh
pnpm add @cujuju/solidjs-glass-menu @cujuju/solidjs-glass
```

`@cujuju/solidjs-glass` is a peer dependency — `GlassMenu` pulls the
`.glass-menu` surface and glass tokens from it. `solid-js >=1.7.0` is
also a peer dependency.

## Quick start

```tsx
import { GlassMenu } from '@cujuju/solidjs-glass-menu';

<GlassMenu
  title="Filters"
  headerAction={<button onClick={clearAll}>Clear</button>}
  onClose={() => setOpen(false)}
>
  <FilterChips />
</GlassMenu>;
```

Stylesheets register themselves on import — there is nothing to import
manually (see [Styling](#styling)).

## Anatomy

`GlassMenu` renders this DOM. The class names are stable and global
(plain prefixed classes, not CSS-Module-hashed) so a host can target
them from its own stylesheet:

```
<div class="glass-menu cujuju-glass-menu [cujuju-glass-menu--overflow-visible] [caller class]">
  ├─ <div class="cujuju-glass-menu-header [cujuju-glass-menu-header--flush]">   ← only when the header is shown
  │    ├─ <div class="cujuju-glass-menu-title"> {title} </div>
  │    └─ <div class="cujuju-glass-menu-header-actions">
  │         ├─ {headerAction}
  │         └─ <button class="cujuju-glass-menu-close" aria-label="Close">×</button>   ← only when onClose is set
  │
  └─ <div class="cujuju-glass-menu-body"> {children} </div>
</div>
```

| Class | Element | Notes |
|-------|---------|-------|
| `glass-menu` | root | The surface treatment (tint / blur / border / shadow / menu-scoped token rebinds) — from `@cujuju/solidjs-glass`. |
| `cujuju-glass-menu` | root | Layout: `display: flex; flex-direction: column; border-radius; overflow: hidden`. |
| `cujuju-glass-menu--overflow-visible` | root | Added when `overflow="visible"` — flips the root to `overflow: visible`. |
| `cujuju-glass-menu-header` | header row | `display: flex`, space-between, padded `10px 14px`, hairline `border-bottom`. Rendered **only** when a header is shown. |
| `cujuju-glass-menu-header--flush` | header row | Added when `headerDivider={false}` — removes the `border-bottom`. |
| `cujuju-glass-menu-title` | header left | `flex: 1; min-width: 0` so long titles truncate. Always a `<div>` (block content allowed). |
| `cujuju-glass-menu-header-actions` | header right | Holds `headerAction` then the close button. Always rendered (keeps the cluster right-aligned even with no title). |
| `cujuju-glass-menu-close` | close button | 22×22 button, `aria-label="Close"`. Rendered **only** when `onClose` is set. |
| `cujuju-glass-menu-body` | body | `flex: 1; min-height: 0; display: flex; flex-direction: column; overflow-y: auto`. **No padding** — see [The body is unpadded](#the-body-is-unpadded). |

### When is the header rendered?

The header row renders when **at least one** of `title`, `headerAction`,
or `onClose` is supplied. If all three are omitted, no header element is
emitted at all and `GlassMenu` is a bare glass surface wrapping
`children` — see the [headerless recipe](#headless-surface-option-list--context-menu--info-panel).

## Props

`GlassMenuProps` extends `JSX.HTMLAttributes<HTMLDivElement>` **minus
`title`** (the HTML `title` string attribute is repurposed as header
content). Every attribute not in the table below — `ref`, `style`,
`class`, `id`, `role`, `aria-*`, `data-*`, event handlers, and the
`popover` attribute via `ref` — is spread onto the root element.

| Prop | Type | Default | Notes |
|------|------|---------|-------|
| `title` | `JSX.Element?` | — | Header content, left side. A string or any node. Omit `title` + `headerAction` + `onClose` together to drop the header row entirely. |
| `headerAction` | `JSX.Element?` | — | Node rendered in the header between the title and the close button — e.g. a "Clear" action. |
| `onClose` | `() => void`? | — | Close-button handler. The close button renders **only** when this is provided. `GlassMenu` does not close itself — this is a callback into caller-owned state. |
| `headerDivider` | `boolean?` | `true` | Hairline `border-bottom` under the header. Pass `false` for a flush header (e.g. an option list where a header-to-body rule reads as clutter). |
| `overflow` | `'hidden' \| 'visible'`? | `'hidden'` | Root `overflow`. `'hidden'` clips edge-to-edge body content (full-width row hovers, etc.) to the rounded corners. `'visible'` is for a menu whose children must paint past the surface edge — a context menu with non-Portal'd submenus, or one relying on a drop shadow rendering outside the box. |
| `children` | `JSX.Element?` | — | Body content. Rendered inside `.cujuju-glass-menu-body`. |
| `ref` | `HTMLDivElement \| (el) => void` | — | Forwarded to the root. Use it to measure the surface, or to set the `popover` attribute (see [recipe](#as-the-positioned-popover-element)). |
| ...rest | `JSX.HTMLAttributes<HTMLDivElement>` | — | `style`, `class`, `role`, `aria-*`, `data-*`, handlers — all forwarded to the root. A caller `class` is appended after the package classes, so it wins specificity ties. |

## Recipes

### Titled panel

The full shell: header with a title, an action slot, and a close
button, above a scrollable body.

```tsx
<GlassMenu
  title="Downloads"
  headerAction={<button onClick={cancelAll}>Cancel all</button>}
  onClose={() => setOpen(false)}
>
  <DownloadList />
</GlassMenu>
```

### Headerless surface (option list / context menu / info panel)

Omit `title`, `headerAction`, and `onClose` — no header is rendered and
`GlassMenu` is a bare glass container. This is the right shape for a
dropdown option list, a context menu, or a **purely visual information
panel**.

```tsx
// Option list
<GlassMenu role="listbox" aria-label="Sort by">
  <Option ... />
</GlassMenu>

// Purely visual info panel — no menu/listbox semantics
<GlassMenu role="region" aria-label="Sync status">
  <SyncStats />
</GlassMenu>
```

For a non-interactive panel use `role="region"` (or `role="note"`) with
an `aria-label` — do **not** reach for a menu/listbox role, which would
announce interactive semantics the panel does not have.

### As the positioned popover element

`GlassMenu` owns no positioning, so the caller positions the root.
Because the root carries the surface class, there is no wrapper to
position separately. The HTML Popover API (`popover="manual"`) promotes
the menu into the browser's top layer so it paints above every normal
stacking context:

```tsx
let panelEl: HTMLDivElement | undefined;

<GlassMenu
  ref={(el) => {
    panelEl = el;
    // Solid's JSX types don't yet include the `popover` global
    // attribute — set it via the ref. Manual mode: the UA does NOT
    // light-dismiss; the caller owns dismiss.
    el.setAttribute('popover', 'manual');
  }}
  style={{
    position: 'fixed',
    top: `${y}px`,
    left: `${x}px`,
    // Neutralize UA [popover] defaults: `inset: 0; margin: auto`
    // would otherwise center an unsized popover.
    right: 'auto',
    bottom: 'auto',
    margin: '0',
  }}
  role="dialog"
  aria-modal="false"
  aria-label="Filter dialog"
  title="Filters"
  onClose={close}
>
  …
</GlassMenu>;
```

Do **not** set `border: 0` (or override `background` / `border-radius`)
inline to neutralize UA `[popover]` styling — the `.glass-menu` surface
rule already wins that cascade and supplies the correct chrome. An
inline override would erase it.

For a placement engine (anchoring to a trigger, viewport clamping,
outside-click + Escape dismiss) compose
[`@cujuju/solidjs-anchored-popover`](../anchored-popover) **around**
`GlassMenu`: the popover owns placement + dismiss, `GlassMenu` owns the
surface.

### Scrollable body with a constrained height

The body scrolls only when the root's height is constrained. Give the
root a `max-height` (or a fixed `height`) and the body's `overflow-y:
auto` engages — the header stays pinned, the body scrolls.

```tsx
<GlassMenu title="Tags" onClose={close} style={{ 'max-height': '420px' }}>
  <LongTagList />
</GlassMenu>
```

### Block-content title

`title` renders inside a `<div>`, so it accepts block content — e.g. a
stacked stats cluster, not just a string.

```tsx
<GlassMenu
  title={
    <div style={{ display: 'flex', 'flex-direction': 'column' }}>
      <span>3 active</span>
      <span>ETA 2m</span>
    </div>
  }
  onClose={close}
>
  …
</GlassMenu>
```

### Internal scroll region with a pinned footer

The body is itself a flex column, so a child can take `flex: 1` to
become the scroll region while a sibling stays pinned.

```tsx
<GlassMenu title="Results" onClose={close} style={{ 'max-height': '60vh' }}>
  <div style={{ flex: 1, 'overflow-y': 'auto' }}>
    <ResultRows />
  </div>
  <footer>{count()} results</footer>
</GlassMenu>
```

### Edge-escaping children — `overflow="visible"`

By default the root clips to its rounded corners. A context menu whose
submenus are **not** Portal'd, or one relying on a drop shadow painting
outside the box, needs the surface to not clip:

```tsx
<GlassMenu overflow="visible" ref={setPopoverAttr} class="context-menu">
  <MenuItems />
</GlassMenu>
```

Note: an element's **own** box-shadow is not clipped by its `overflow`,
so a menu does not need `overflow="visible"` merely to cast its shadow.
Use it when *descendant* content must paint past the edge.

## The body is unpadded

`.cujuju-glass-menu-body` has **no padding** and **no `gap`** — a padded
titled panel and an edge-to-edge option list (whose row hovers must
reach the corners) want opposite insets, so the caller owns spacing.
Two ways to supply it:

**1. A body wrapper (preferred — no coupling to internal class names):**

```tsx
<GlassMenu title="Downloads" onClose={close}>
  <div class={styles.body}>{/* sections */}</div>
</GlassMenu>
```

```css
.body { display: flex; flex-direction: column; gap: 12px; padding: 12px; }
```

**2. Target the body class** from a stylesheet scoped to the root. The
body class is stable and prefixed, but this couples your CSS to
`GlassMenu`'s internal structure:

```css
.panel :global(.cujuju-glass-menu-body) { padding: 8px; gap: 4px; }
```

## What GlassMenu does NOT do

It is presentational only. Each of these is the **caller's**
responsibility:

- **Positioning** — `GlassMenu` does not place itself. Set `position` /
  `top` / `left` (or compose `@cujuju/solidjs-anchored-popover`).
- **Portal** — it renders inline. Wrap it in a `<Portal>` if it must
  escape an `overflow`/`transform`/`backdrop-filter` ancestor.
- **Open / close state** — there is no `open` prop. `Show`-gate it, or
  toggle the `popover` attribute / `showPopover()` yourself.
- **Dismiss** — outside-click, Escape, scroll/resize dismiss all belong
  to the caller. `onClose` is only the close-button's click handler.
- **ARIA role** — the root has no implicit `role`. Pass `role` +
  `aria-*` appropriate to the use (`dialog`, `listbox`, `menu`,
  `region`, …).
- **Focus management** — focus trap, restore-on-close, roving focus are
  all caller-owned.

## Accessibility

- The close button is a real `<button type="button">` with
  `aria-label="Close"`.
- The root has **no** `role` — supply one. A purely visual panel should
  use `role="region"`/`note`, not a menu/listbox role.
- When used as a modal surface, the caller owns `aria-modal`, the focus
  trap, and focus restoration.

## Styling

`GlassMenu` registers its stylesheets as import side effects — both its
own chrome (`glass-menu.css`) and, transitively, `glass.css` from
`@cujuju/solidjs-glass`. There is nothing to import manually. (The raw
chrome stylesheet is also exported at `@cujuju/solidjs-glass-menu/styles.css`
if a build needs to order it explicitly.)

Host theme tokens are referenced with inline fallbacks, so the shell
renders standalone and themes when a host provides them:

| Token | Used for | Fallback |
|-------|----------|----------|
| `--radius-md` | root border-radius | `8px` |
| `--radius-sm` | close-button radius | `4px` |
| `--spacing-sm` | header gap | `8px` |
| `--spacing-xs` | header-actions gap | `6px` |
| `--color-border` | header divider, close-button hover bg | `rgba(255,255,255,0.18)` |
| `--color-text` | title color, close-button hover color | `rgba(255,255,255,0.95)` |
| `--color-text-secondary` | close-button color | `rgba(255,255,255,0.78)` |
| `--font-size-base` | title font size | `0.9375rem` |
| `--transition-speed` | close-button hover transition | `0.15s` |

The `.glass-menu` surface itself (tint, blur, border, shadow) is themed
through `@cujuju/solidjs-glass` — see that package's README, including
its menu-tint engine.

## TypeScript

```ts
import { GlassMenu, type GlassMenuProps } from '@cujuju/solidjs-glass-menu';
```

`GlassMenuProps` is exported for callers that wrap `GlassMenu` in their
own component and want to re-expose or extend its props.

## License

MIT
