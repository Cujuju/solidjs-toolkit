# @cujuju/solidjs-kv-tooltip

Mouse-follow key-value tooltip for SolidJS. Two modes: hover-wrapper and caller-controlled panel. Viewport-clamped with hysteresis (never flickers at edges). Portal-rendered so `overflow: hidden` parents can't clip it.

## Install

```
pnpm add @cujuju/solidjs-kv-tooltip
```

## Usage

### Hover wrapper

```tsx
import { KvTooltip } from '@cujuju/solidjs-kv-tooltip';

<KvTooltip entries={{ Bid: '123.45', Ask: '123.50', Vol: '1.2M' }}>
  <span>AAPL</span>
</KvTooltip>
```

### Controlled panel

Caller manages visibility + x/y (useful when the trigger isn't a simple hover target — e.g., a virtualised table row).

```tsx
import { KvTooltipPanel } from '@cujuju/solidjs-kv-tooltip';

const [active, setActive] = createSignal<{ x: number; y: number; data: ... } | null>(null);

<Show when={active()}>
  {(a) => (
    <KvTooltipPanel
      entries={a().data}
      x={a().x}
      y={a().y}
    />
  )}
</Show>
```

### With extra content (e.g., a chart)

```tsx
<KvTooltipPanel
  entries={entries}
  x={mx} y={my}
  extraContent={<Sparkline data={...} />}
/>
```

A 1px separator + padding are added automatically between the entries and the `extraContent`.

## API (highlights)

| Prop | Default | Description |
|---|---|---|
| `entries` | (required) | `Record<string, string>` rendered as key/value rows. Empty/undefined values are dropped unless `showEmpty: true`. |
| `children` (wrapper) | (required) | Element the hover listener attaches to. |
| `x`, `y` (panel) | (required) | Cursor / anchor coordinates in viewport space. |
| `extraContent` | — | JSX rendered below entries with a top separator. |
| `showEmpty` | `false` | Render entries with empty-string values. |
| `disabled` (wrapper) | `false` | Never show. |
| `interactive` | `false` | When `true`: panel receives pointer events (so consumers can put links / copy buttons / form fields inside) and persists for `hideDelayMs` after the cursor leaves the trigger, allowing the user to cross the gap into the panel without losing it. Cancelled by re-entering either the trigger or the panel. |
| `hideDelayMs` | `100` | Hide-debounce delay (ms). Only consulted when `interactive=true`. Tuned to match typical pointer-travel time across the `mouseOffsetX/Y` gap; lower for snappier dismiss, higher for more forgiving traversal. |
| `showDelayMs` (wrapper) | `0` | Rest delay (ms) before showing. A pointer passing *through* the trigger never flashes a panel. No derived default — the right value depends on your trigger density/size, not on this package's geometry. |
| `anchor` | — | `DOMRect \| (() => DOMRect \| null)`. Anchors the panel to a rect instead of `x`/`y`. Prefer the accessor form so the rect is re-read on resize/scroll. |
| `placement` | `'cursor'` | `'cursor' \| 'above-start' \| 'below-start' \| 'above-end' \| 'below-end'`. With an `anchor` set and this left at `'cursor'`, resolves to `'below-start'`. |
| `anchorGapPx` | `4` | Gap between the anchor edge and the panel edge. Matches `DEFAULT_POPOVER_OFFSET_PX` in `@cujuju/solidjs-anchored-popover`. |
| `freezeOnShow` (wrapper) | `false` | Snapshot entries + reference position at show time and hold both until hidden. For live-ticking entry sources that would otherwise re-measure the panel every frame. |
| `hideOnPointerDown` (wrapper) | `false` | Pointerdown on the trigger hides the panel and suppresses re-show until the pointer leaves and re-enters. |
| `suppressWhileTopLayerOpen` (wrapper) | `false` | Refuse to show while any native popover other than a tooltip panel is open. Since the panel now paints in the top layer itself, this is for the degraded (no `showPopover`) path and for deliberately deferring to an open surface — see Top layer. |
| `onPlatformDismiss` (panel) | — | The browser closed the panel's popover (another tooltip, an `auto` popover opening, Escape, a click outside). Set your own visibility state to `false` here. Omitting it is safe: the panel demotes to normal stacking and stays visible, never invisible. The wrapper wires this up for you. |
| `hideOnScroll` (wrapper) | `false` | Dismiss on any scroll. Position *recompute* on scroll is unconditional and needs no prop. |
| `mouseOffsetX`, `mouseOffsetY` | `12`, `16` | Gap from cursor to tooltip in px. |
| `hysteresisPx` | `20` | Clearance required before un-flipping from an edge-overflow position. Prevents flicker. Bypassed in anchored mode. |
| `edgePadPx` | `8` | Minimum distance from viewport edge. |
| `minWidth`, `maxWidth` | `120`, `300` | Size bounds. |
| `role` | `'tooltip'` | ARIA role. |
| `ariaLabel` | — | Labels the panel element itself. Note this is *not* what a screen-reader user hears — see Accessibility. |
| `description` (wrapper) | derived from `entries` | The tooltip's text for assistive tech. Required for an `extraContent`-only tooltip (arbitrary JSX is not stringified). |
| `describeTrigger` (wrapper) | `true` | Set `false` to opt out of the whole accessible-description contract (hidden node, `aria-describedby`, focus/Escape) and get the 0.2.x mouse-only behaviour. |
| `focusable` (wrapper) | auto | Whether the wrapper takes `tabindex="0"`. Auto = only when the trigger contains no focusable element of its own. |
| `wrapperLayout` (wrapper) | `'text'` | How the wrapper lays out. `'text'` = inline + ellipsis clip (right for prose, wrong for controls). `'control'` = `inline-flex`, no clip — use when wrapping a button/icon/badge. `'contents'` = `display: contents`, wrapper leaves layout entirely so the child stays the parent's flex/grid item; `focusable` is ignored (a boxless wrapper cannot host a focus ring) so the child must be focusable. |
| `class`, `panelClass`, `portalTarget` | — | Passthrough styling / mount hooks. |

## Accessibility

The panel is `<Portal>`-rendered, mounted only while hovered, and referenced by
nothing, so `role="tooltip"` on it announces **nothing** — a tooltip role is
only spoken through an `aria-describedby` relationship. Through 0.2.x that made
this component a strictly-worse replacement for a native `title` for anyone not
using a mouse, and you cannot keep both: a `title` and a KvTooltip on one
trigger fire two competing popups on the same hover.

From 0.3.0 the wrapper carries the text itself:

- an **always-mounted, visually-hidden node** holds the description (derived
  from `entries`, or whatever `description` says);
- **`aria-describedby`** points at it from the wrapper *and* from your own
  trigger element — the attribute is not inherited, so it has to sit where
  focus lands. Existing ids on your trigger are merged, never overwritten;
- the wrapper takes a **tab stop** only when your trigger has none of its own;
- **focus shows** the panel, **blur hides** it, **Escape dismisses** it;
- the visible panel is **`aria-hidden`** whenever the hidden node duplicates it,
  so nothing is announced twice.

```tsx
// Derived: "Delta: 0.42. Gamma: 0.03"
<KvTooltip entries={{ Delta: '0.42', Gamma: '0.03' }}>{price}</KvTooltip>

// extraContent has no derivable text — say it explicitly, or the tooltip
// stays mouse-only.
<KvTooltip
  entries={{}}
  extraContent={<HelpProse />}
  description="Live Preview mounts a real workspace per card and can lag a slow machine."
>
  <InfoIcon />
</KvTooltip>
```

`KvTooltipPanel` (controlled mode) is unchanged: it renders only the panel, so
the surrounding trigger and its description belong to the caller.

## Viewport clamping with hysteresis

Default position is below-right of the cursor. If the tooltip would overflow the right or bottom edge, it flips to the opposite side. Once flipped, it requires `hysteresisPx` of clearance before flipping back — this prevents the tooltip from jittering when the cursor is right at the boundary.

## Anchored placement

Passing an `anchor` switches the panel from following the cursor to taking a side of a rect:

```tsx
let field!: HTMLDivElement;

<KvTooltip
  entries={quote}
  anchor={() => field.getBoundingClientRect()}
  placement="above-start"
  hideOnPointerDown
>
  <div ref={field}>SPY</div>
</KvTooltip>
```

Why it exists: a panel placed at a cursor *point* can only stay clear of a menu opening from the same trigger by luck. Anchoring to the trigger's *rect* lets the tooltip take one side while the menu takes the other, so neither covers the other. This is about **overlap**, not paint order — since 0.6.0 the panel paints above open popovers anyway (see Top layer), but a tooltip that *covers* the menu it describes is barely better than one hidden behind it, and only placement keeps the two apart.

Overflow flips to the opposite side of the **rect**, never onto it: an `above-*` placement on a trigger near the top of the window moves *below* the trigger rather than sliding down on top of it. Horizontal overflow switches `-start` alignment to `-end` (and back) rather than jumping a full panel width. `hysteresisPx` is bypassed here — it damps a moving cursor, and a static rect cannot flicker.

If the panel fits on neither side, it keeps the side with more room and stays flush against the anchor, overflowing the viewport edge instead. Covering the anchor defeats the point of anchoring, so viewport overflow is the lesser failure.

## Scroll

Any clamped position — anchored or cursor — re-derives on scroll, via a single shared capture-phase listener (`scroll` does not bubble out of a nested scroller, so a bubble-phase listener would miss exactly the case that matters). An `anchor` passed as an accessor therefore tracks its element down the page on its own. Set `hideOnScroll` when the tooltip's *content* goes stale on scroll, not merely its geometry.

## Top layer

The panel is promoted into the browser's **top layer** as a `popover="hint"`,
so it paints above open menus, dialogs and other popovers — which ordinary
`position: fixed` content cannot do at *any* z-index. That restores parity with
the native `title` this component replaces.

`hint` is the platform's tooltip popover type, and picking it (over `manual`)
hands four behaviours to the browser instead of to this library:

- **one tooltip at a time** — a second tooltip closes the first;
- **yielding** — opening an `auto` popover closes the tooltip, while showing
  the tooltip does *not* close an already-open one;
- **Escape**, and **click-outside light-dismiss**.

When any of those fire, the panel **demotes to normal stacking and stays
visible** (the pre-0.6.0 fixed/z-index box) and `onPlatformDismiss` is called.
It is never left mounted-but-invisible, so a controlled-mode caller that omits
the callback degrades rather than breaks. The panel is not re-promoted
afterwards — two panels re-promoting on each other's close would fight the
one-at-a-time rule forever; unmount and remount to get the top layer back.

Escape is layered innermost-first: the first press closes the tooltip, the
second closes the menu underneath it. Where `showPopover` is unavailable the
panel is a plain `div` with the same position and z-index — under the top
layer, but never invisible; an engine that does not recognise `hint` treats it
as `manual` per the spec's invalid-value default, which is exactly the 0.6.0
behaviour.

## Theming

```css
:root {
  --kv-bg: #0f172a;
  --kv-border: #334155;
  --kv-key-color: #64748b;
  --kv-value-color: #e2e8f0;
  --kv-separator-color: #334155;
  --kv-radius: 5px;
  --kv-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
  --kv-padding: 6px 9px;
  --kv-key-font-size: 10px;
  --kv-value-font-size: 11px;
  --kv-key-min-width: 32px;
  --kv-gap: 8px;
  --kv-line-height: 1.6;
  --kv-min-width: 120px;
  --kv-max-width: 300px;
}
```

## Version notes

### 0.7.0

- The panel's popover type changes from `manual` to **`hint`** (see Top layer).
  Paint order is unchanged; what is new is that the platform now enforces
  one-tooltip-at-a-time, closes the tooltip when an `auto` popover opens, and
  dismisses it on Escape or an outside click.
- New **`onPlatformDismiss`** on `KvTooltipPanel`, for resyncing controlled
  visibility state when the browser closes the panel. The hover wrapper wires
  it internally. Omitting it in controlled mode is safe: the panel demotes to
  normal stacking and stays visible.
- Escape consumed by a visible tooltip is now `preventDefault`ed, so a menu
  underneath survives the first press and closes on the second.
- Fixed: a visible tooltip counted as an open top-layer surface in its own
  `suppressWhileTopLayerOpen` check (a 0.6.0 regression), which blocked every
  consumer of that prop.
- Behaviour change to be aware of: a click anywhere outside the panel now
  dismisses it. `hideOnPointerDown` is still the only thing that suppresses a
  pending `showDelayMs` show.

## Future ideas (not shipped)

- Full WAI-ARIA focus-triggered tooltip pattern (also appears on keyboard focus, dismisses on Escape). Current version is mouse-only.

## License

MIT
