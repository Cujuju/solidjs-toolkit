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
  @cujuju/solidjs-anchored-popover @cujuju/solidjs-context-menu \
  @cujuju/solidjs-hooks @cujuju/solid-reorder-list
```

Peer dependencies: `solid-js >= 1.7.0`, plus the four toolkit packages above —
the popover anchors auto-hide flyouts, the context menu backs the panel and rail
overflow menus, hooks supplies the resize/after-paint primitives, and
`@cujuju/solid-reorder-list` (`>= 0.3.0-rc.4`) is the drag-to-reorder engine
behind both the rail and the columns.

> `solid-reorder-list` was VENDORED into this package as a verbatim copy until
> 2026-07-26 and is now a real dependency. If you are pinning versions, note that
> reorder behaviour tracks that package rather than this one.

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

## The rules worth knowing before you design with it

**1. Flyout-ness is derived, never stored:**

```
isFlyout(id)  ⇔  autoHide ∧ isOpen(id) ∧ ¬isPinned(id) ∧ ¬isLeaf(id)
```

So a **leaf can never fly out** — it always holds a docked column. Put the thing
that is always on screen (a canvas, an editor, a plot) in a leaf, and the things
that should get out of its way in panels. Getting this backwards is the one
mistake that makes the mode feel broken rather than wrong.

> **Caveat — a leaf is for content the dock GOVERNS.** The advice above assumes
> the always-present thing is inside the dock at all. If it is never opened,
> closed, pinned, reordered or resized by the dock, it does not need to be a
> member of it: make it a plain sibling of the group and let ordinary flex give
> it the remaining space. Membership is not free — a leaf competes for space with
> the panels and needs a rule saying who absorbs the surplus, which is a question
> a sibling never asks. Reach for a leaf when the dock decides something about
> that pane; reach for a sibling when it decides nothing.

**2. There is exactly one order.** `AccordionGroupApi.order` is read twice — once
by the rail, once by the columns — rather than being two sequences kept in sync.
Dragging either representation moves both, because they are the same array.

**3. `pinned` means "opens as docked", not "is open".** Open/closed and
pinned/unpinned are independent axes, and the three controls on a panel's chrome
are three genuinely different actions:

| Control | Result |
|---|---|
| `×` | close **and** unpin — the panel forgets it was docked |
| pin | unpin while staying open; it reverts to flyout behaviour |
| the rest of the title bar | collapse back to a rail button, **pin survives** — reopening puts it straight back as a docked column |

A rail button is therefore shown whenever a panel is **closed** (pinned or not),
and hidden only when it is **open and pinned** — in that state the column itself
is the panel's presence in the dock. Nothing can be stranded, because closing
always returns a way back.

**4. In `horizontal` + `autoHide`, the rail is the STATIC/DYNAMIC divider.**
Pinning a column moves it *behind* the rail and takes its button out; the rail
slides along to sit after the pinned columns and keeps serving whatever is still
dynamic:

```
nothing pinned:   [rail: Sym|Strat] [ surface ]
pin Symbols:      [Symbols] [rail: Strat] [ surface ]
pin Strategies:   [Symbols][Strategies] [rail: —] [ surface ]
```

The static region is ordered by **pin order**. With everything pinned the rail
collapses to zero width, and the last pinned column's splitter is suppressed —
the rail is a boundary, not a resizer. This is the default whenever `autoHide` is
on, since pin-means-freeze is the metaphor auto-hide already commits to.

## Group props

| Prop | Type | Description |
|---|---|---|
| `orientation` | `'vertical' \| 'horizontal'` | Default `vertical`. |
| `railSide` | `'left' \| 'right'` | Which edge the rail docks against. `horizontal` only. Default `left`. |
| `mode` | `'fill' \| 'natural'` | `fill` divides a fixed extent between open panels; `natural` sizes each to its content. Default `natural`. |
| `policy` | `'single' \| 'multi'` | `single` auto-collapses unpinned siblings. Default `single`. |
| `openPlacement` | `'in-order' \| 'append'` | Whether opening a panel also moves it to the end of the order. Default `in-order`. |
| `appearance` | `'flush' \| 'cards'` | Chrome only. `flush` (default) draws one frame around the dock with hairline separators between panels; `cards` gives each panel its own border, radius and surface separated by `--acc-card-gap`, and suppresses the group's own frame. Behaviour is identical under both. |
| `autoHide` | `boolean` | Unpinned panels open as flyouts; pinning promotes them to real docked space. Works in **both** orientations — horizontal flies out over the columns, vertical below the header bar. |
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
`accent`, `minSize`, `lazyMount`, `tearOffable`, and the usual
`class` / `headerClass` / `contentClass` / `railClass` / `style`.

`count` and `badge` are deliberately separate slots: a count says *how many*, a
badge says *something here needs you* — which has no number and often coexists
with a count of zero.

### Sizing a panel

| Prop | Type | Description |
|---|---|---|
| `defaultSize` | `number \| 'content'` | Opening size along the growth axis. A number is applied before first paint. `'content'` MEASURES what the panel actually holds the first time it opens and freezes that — then it is an ordinary draggable, persisted size, never measured again. |
| `grow` | `boolean` | This panel absorbs the group's leftover extent in `fill` mode. |
| `shrinkToContent` | `boolean` | This panel is never larger than its own content; its stored size becomes a **ceiling** it scrolls past rather than an extent. |

**Why `'content'` freezes instead of tracking.** A CSS `max-content` track follows
its content forever, so in a dock holding live numbers a value crossing a digit
boundary (`$9.99` → `$10.01`) re-resolves the track and every panel after it
twitches. The frozen size carries one digit-width of slack — derived from the
content's own font — because that is the failure mode freezing has. On a vertical
(height) axis no slack is added: a row count does not grow by rollover.

**Who absorbs leftover space in `fill` mode.** `fill` divides the group's whole
extent, so once every open panel is explicitly sized something must take the
remainder or the group paints a dead strip. With no `grow` anywhere that falls to
the **trailing** panel — a safe default, since the trailing panel has no splitter
handle of its own and growing it overrides nothing the user dragged. It is not
always the *right* recipient, which is what `grow` is for. Declare it on several
panels and they share the surplus, each keeping its own size as its basis.

**`shrinkToContent` is the opposite request** — "never more room than my content"
— so it overrides `grow` on the same panel, and the group's leftover space simply
stays empty. Two things follow that surprise people:

- Dragging such a panel **larger** than its content shows nothing until the
  content grows into the new ceiling. Dragging it smaller is immediate.
- Pair it with **no `defaultSize`**. A ceiling measured from the content is one
  the content is already touching, so a `'content'` seed would freeze the panel at
  whatever it held when it first opened.

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
