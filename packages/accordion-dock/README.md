# @cujuju/solidjs-accordion-dock

A collapsible panel dock for SolidJS, in two orientations that share one state
machine:

- **`vertical`** — headers stack downward and a panel grows below its header.
  The classic accordion.
- **`horizontal`** — collapsed panels are buttons in a **rail**, and opening one
  grows a **column** out from the rail. Visual Studio's dock crossed with VS
  Code's activity bar.

On top of that: splitters between columns, **auto-hide** (an unpinned panel opens
as a flyout over the columns; pinning promotes it to a real column), **leaves**
(terminal detail panes with no rail button, chainable into Miller columns), a
breadcrumb over the open sequence, and **tear-off** into a second browser window.

> Promoted out of `playground/src/mock/accordion-dock` on 2026-07-26. The
> playground page (`AccordionDockPage`) is still the design surface and now
> consumes this package by name, the way a consumer does.

## Install

```sh
pnpm add @cujuju/solidjs-accordion-dock \
  @cujuju/solidjs-anchored-popover @cujuju/solidjs-context-menu @cujuju/solidjs-hooks
```

Peer dependencies: `solid-js >= 1.7.0`, plus the three toolkit packages above —
the popover anchors auto-hide flyouts, the context menu backs the panel and rail
overflow menus, and hooks supplies the resize/after-paint primitives.

Styles are imported by the entry point; there is nothing to include separately.

## Usage

```tsx
import { AccordionGroup, AccordionPanel, AccordionLeaf } from '@cujuju/solidjs-accordion-dock';

<AccordionGroup
  orientation="horizontal"
  mode="fill"
  policy="multi"
  autoHide
  hoverToOpen
  height="100%"
  storageKey="app:dock"
>
  <AccordionPanel id="files" title="Files" count={12}>
    <FileList />
  </AccordionPanel>
  <AccordionPanel id="search" title="Search" badge="warning">
    <SearchPane />
  </AccordionPanel>

  {/* A leaf has no rail button, is exempt from single-policy auto-collapse, and
      never becomes a flyout — it is the thing the panels select INTO. */}
  <AccordionLeaf id="detail" open closable={false} title="Detail">
    <Detail />
  </AccordionLeaf>
</AccordionGroup>
```

## The two rules worth knowing before you design with it

**1. Flyout-ness is derived, never stored:**

```
isFlyout(id)  ⇔  autoHide ∧ isOpen(id) ∧ ¬isPinned(id) ∧ ¬isLeaf(id)
```

So a **leaf can never fly out** — it always holds a docked column. Put the thing
that is always on screen (a canvas, an editor, a plot) in a leaf, and the things
that should get out of its way in panels. Getting this backwards is the one
mistake that makes the mode feel broken rather than wrong.

**2. There is exactly one order.** `AccordionGroupApi.order` is read twice — once
by the rail, once by the columns — rather than being two sequences kept in sync.
Dragging either representation moves both, because they are the same array.

## Group props

| Prop | Type | Description |
|---|---|---|
| `orientation` | `'vertical' \| 'horizontal'` | Default `vertical`. |
| `railSide` | `'left' \| 'right'` | Which edge the rail docks against. `horizontal` only. Default `left`. |
| `mode` | `'fill' \| 'natural'` | `fill` divides a fixed extent between open panels; `natural` sizes each to its content. Default `natural`. |
| `policy` | `'single' \| 'multi'` | `single` auto-collapses unpinned siblings. Default `single`. |
| `openPlacement` | `'in-order' \| 'append'` | Whether opening a panel also moves it to the end of the order. Default `in-order`. |
| `autoHide` | `boolean` | Unpinned panels open as flyouts; pin promotes to a column. `horizontal` only. |
| `hoverToOpen` | `boolean` | With `autoHide`, hover also opens. Default false — hover is an accelerator, never the only way in. |
| `maxOpen` | `number` | Cap on simultaneously open panels; opening past it evicts the least-recently-opened unpinned one. |
| `railOverflow` | `'menu' \| 'pan'` | What the rail does when buttons do not fit. |
| `reorderable` / `resizable` | `boolean` | Drag-reorder and splitters. Both default true. |
| `density` | `'comfortable' \| 'compact'` | Chrome scale, implemented purely as token overrides. |
| `storageKey` | `string` | Persists open + pinned + order + sizes. Nested groups need their own key. |
| `height` | `string` | Group extent. Required for `fill` to mean anything. |
| `apiRef` | `(api: AccordionGroupApi) => void` | Hands out the imperative API (`collapseAll`, `setOpen`, `getLayout`…). |
| `onChange` / `onPinChange` / `onOrderChange` / `onSizeChange` | callbacks | **`onChange` fires for programmatic opens too**, not only clicks — diff against your own state if that distinction matters to you. |
| `onTearOff` / `onDock` / `onTearOffError` | callbacks | Tear-off lifecycle. A blocked popup is an ordinary result, reported rather than thrown. |

## Panel props

`id`, `title`, `count`, `badge` (`info` / `success` / `warning` / `danger`),
`icon`, `railLabel`, `tooltip`, `actions`, `defaultOpen`, `pinnable`, `closable`,
`accent`, `minSize`, `defaultSize`, `lazyMount`, `tearOffable`, and the usual
`class` / `headerClass` / `contentClass` / `railClass` / `style`.

`count` and `badge` are deliberately separate slots: a count says *how many*, a
badge says *something here needs you* — which has no number and often coexists
with a count of zero.

## Theming

Everything is a `--acc-*` custom property, and the defaults live in
`@layer cujuju-defaults` **specifically so a consumer can restate a token
unlayered and win** — an unlayered declaration beats a layered one outright,
ahead of specificity. No `!important`, no specificity games:

```css
:root {
  --acc-bg: var(--color-surface);
  --acc-accent: var(--color-accent);
}
```

Use `:root` rather than a scope on the group when `autoHide` is on: a flyout is
portalled out of the group element and would otherwise stop inheriting.

## Tests

```sh
pnpm --filter @cujuju/solidjs-accordion-dock test
```
