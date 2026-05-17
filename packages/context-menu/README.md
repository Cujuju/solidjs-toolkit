# @cujuju/solidjs-context-menu

A cursor-positioned **context menu** for SolidJS — nested submenus,
slider / button-row / checkbox entries, viewport clamping, and
top-layer rendering. The panel is painted with the `.glass-menu`
surface from [`@cujuju/solidjs-glass`](../glass) (via
[`@cujuju/solidjs-glass-menu`](../glass-menu)).

`ContextMenu` is **caller-driven**: it does not own its open state.
You render `<ContextMenu>` while the menu should be visible — typically
from a `contextmenu` handler that captured the click point — and stop
rendering it inside `onClose`. The menu owns its own positioning,
top-layer promotion, and dismiss (outside click + Escape).

## Install

```sh
pnpm add @cujuju/solidjs-context-menu @cujuju/solidjs-glass-menu @cujuju/solidjs-glass @cujuju/solidjs-hooks
```

`@cujuju/solidjs-glass-menu` and `@cujuju/solidjs-hooks` are peer
dependencies; `glass-menu` in turn needs `@cujuju/solidjs-glass`.
`solid-js >=1.7.0` is also a peer dependency.

## Quick start

```tsx
import { createSignal, Show } from 'solid-js';
import { ContextMenu } from '@cujuju/solidjs-context-menu';

function Example() {
  const [menu, setMenu] = createSignal<{ x: number; y: number } | null>(null);

  return (
    <>
      <div onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY }); }}>
        right-click me
      </div>
      <Show when={menu()}>
        {(at) => (
          <ContextMenu
            x={at().x}
            y={at().y}
            onClose={() => setMenu(null)}
            items={[
              { label: 'Copy', onClick: doCopy },
              { label: 'Paste', onClick: doPaste, disabled: !canPaste() },
              { divider: true },
              { label: 'Delete', onClick: doDelete, danger: true },
            ]}
          />
        )}
      </Show>
    </>
  );
}
```

Stylesheets register themselves on import — nothing to import manually.

## Props — `ContextMenuProps`

| Prop | Type | Notes |
|------|------|-------|
| `items` | `ContextMenuEntry[]` | The entries to render — see [Entry types](#entry-types). |
| `x` | `number` | Viewport x of the requested open point (e.g. `event.clientX`). |
| `y` | `number` | Viewport y of the requested open point. |
| `onClose` | `() => void` | Called when the menu should close — outside click, Escape, or a non-`keepOpen` item activation. The caller owns open state. |

The open point is clamped into the viewport after the menu measures
itself, so a near-edge `x`/`y` still renders fully on-screen.

## Entry types

`ContextMenuEntry` is a union; each entry is discriminated by a marker
key (`divider` / `slider` / `submenu` / `row`) or is a plain item.

### `ContextMenuItem` — a plain action row

| Field | Type | Notes |
|-------|------|-------|
| `label` | `string \| JSX.Element` | Row label. |
| `onClick` | `() => void` | Runs on activation. |
| `danger` | `boolean?` | Render the label in the danger color. |
| `disabled` | `boolean?` | |
| `icon` | `JSX.Element \| (() => JSX.Element \| undefined)` | Leading icon; a function form is re-evaluated each render. |
| `keepOpen` | `boolean?` | Keep the menu open after the click instead of closing. |
| `when` | `() => boolean` | When it returns false, the row is not rendered. |
| `checked` | `boolean?` | When defined, renders a right-aligned checkbox indicator — a check when `true`, a reserved blank when `false` (so adjacent toggle rows align). Undefined = no indicator. |

### `ContextMenuDivider` — `{ divider: true }`

A horizontal rule between entries.

### `ContextMenuSlider` — `{ slider: true, … }`

A labelled range slider embedded as a row: `label`, `min`, `max`,
`step?`, `value: () => number`, `onChange: (n) => void`, `unit?`,
`when?`. The slider focuses on hover so arrow keys adjust it.

### `ContextMenuSubmenu` — `{ submenu: true, … }`

A row that opens a nested submenu on hover: `label`, `icon?`,
`children: ContextMenuEntry[]`, `scrollable?`. A `scrollable` submenu
caps its height and shows a search field that filters its children by
label. Submenus nest arbitrarily deep.

### `ContextMenuButtonRow` — `{ row: true, buttons: [...] }`

A row of compact side-by-side buttons (e.g. a chapter-nav cluster).
Each button: `{ label, onClick, disabled?, icon? }`.

## Anatomy

`ContextMenu` renders a `GlassMenu` surface (the root) holding the
entry rows. Stable global classes (prefixed `cujuju-context-menu*`):

| Class | Element |
|-------|---------|
| `cujuju-context-menu` | the menu root (also a `GlassMenu`, also `[popover]`) |
| `cujuju-context-menu-item` | a plain action / submenu-trigger row |
| `cujuju-context-menu-item-danger` | a `danger` item |
| `cujuju-context-menu-icon` | leading icon slot |
| `cujuju-context-menu-label` | row label (truncates) |
| `cujuju-context-menu-check` | the `checked` indicator slot |
| `cujuju-context-menu-divider` | the `<hr>` divider |
| `cujuju-context-menu-submenu-wrapper` / `-chevron` | submenu trigger row |
| `cujuju-context-menu-flyout` / `-flyout-search` | a Portal'd submenu panel + its search field |
| `cujuju-context-menu-button-row` / `-row-btn` | a button row |
| `cujuju-context-menu-slider-row` / `-slider*` | a slider row |

Each Portal'd submenu also carries `data-popover-stack` — see
[Positioning & dismiss](#positioning--dismiss).

## Positioning & dismiss

- **Top layer.** The menu and every submenu are `popover="manual"`
  elements promoted with `showPopover()`, so they paint above every
  normal stacking context — including other top-layer popovers. When a
  submenu opens, its parent is re-promoted so the parent paints above
  it, and the submenu's leading edge tucks a few pixels under the
  parent.
- **Submenus are Portal'd to `<body>`** to escape any `backdrop-filter`
  / `transform` ancestor that would otherwise re-anchor their
  `position: fixed`. Each Portal'd submenu carries the
  `data-popover-stack` attribute.
- **Dismiss.** The menu closes on outside `mousedown` and on `Escape`.
  A click inside any element matching `[data-popover-stack]` counts as
  inside — so submenu clicks never dismiss the menu. If your app has
  its own popover machinery (e.g. an anchored-popover dismiss-skip
  predicate), make it honor the same `data-popover-stack` attribute so
  ContextMenu submenus opened above your popover don't dismiss it.

## What ContextMenu does NOT do

- **Open state** — there is no `open` prop. Render `<ContextMenu>` while
  open; stop rendering it inside `onClose`.
- **The trigger** — wire your own `contextmenu` (or click) handler to
  capture `clientX`/`clientY` and set the open state.
- **Focus management** — there is no focus trap or roving focus; the
  menu is pointer-driven (submenus open on hover).

## Styling

`ContextMenu` registers its stylesheet (`context-menu.css`) and, via
`GlassMenu`, the `.glass-menu` surface from `@cujuju/solidjs-glass` — as
import side effects. Nothing to import manually. The raw stylesheet is
also exported at `@cujuju/solidjs-context-menu/styles.css`.

Host theme tokens are referenced with inline fallbacks, so the menu
renders standalone over a dark backdrop and themes when a host provides
them: `--z-top`, `--radius-sm`, `--color-text`,
`--color-text-secondary`, `--color-primary`, `--color-surface`,
`--color-surface-hover`, `--color-danger`, `--color-danger-alpha-10`,
`--color-white-alpha-{8,10,15,20}`, `--font-size-base`,
`--font-size-sm`. The `.glass-menu` surface itself is themed through
`@cujuju/solidjs-glass` (see that package's menu-tint engine).

## License

MIT
