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
| `suppressWhileTopLayerOpen` (wrapper) | `false` | Refuse to show while any native popover is open (`[popover]:popover-open`). |
| `hideOnScroll` (wrapper) | `false` | Dismiss on any scroll. Position *recompute* on scroll is unconditional and needs no prop. |
| `mouseOffsetX`, `mouseOffsetY` | `12`, `16` | Gap from cursor to tooltip in px. |
| `hysteresisPx` | `20` | Clearance required before un-flipping from an edge-overflow position. Prevents flicker. Bypassed in anchored mode. |
| `edgePadPx` | `8` | Minimum distance from viewport edge. |
| `minWidth`, `maxWidth` | `120`, `300` | Size bounds. |
| `role` | `'tooltip'` | ARIA role. |
| `ariaLabel` | — | Describes the panel for screen readers. |
| `class`, `panelClass`, `portalTarget` | — | Passthrough styling / mount hooks. |

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

Why it exists: a panel placed at a cursor *point* can only stay clear of a menu opening from the same trigger by luck. Anchoring to the trigger's *rect* lets the tooltip take one side while the menu takes the other, so neither covers the other. That matters specifically because the native Popover API paints in the browser **top layer** — this Portal-rendered panel is ordinary stacking content and can never paint above an open popover at *any* z-index. Placement, not z-index, is the fix.

Overflow flips to the opposite side of the **rect**, never onto it: an `above-*` placement on a trigger near the top of the window moves *below* the trigger rather than sliding down on top of it. Horizontal overflow switches `-start` alignment to `-end` (and back) rather than jumping a full panel width. `hysteresisPx` is bypassed here — it damps a moving cursor, and a static rect cannot flicker.

If the panel fits on neither side, it keeps the side with more room and stays flush against the anchor, overflowing the viewport edge instead. Covering the anchor defeats the point of anchoring, so viewport overflow is the lesser failure.

## Scroll

Any clamped position — anchored or cursor — re-derives on scroll, via a single shared capture-phase listener (`scroll` does not bubble out of a nested scroller, so a bubble-phase listener would miss exactly the case that matters). An `anchor` passed as an accessor therefore tracks its element down the page on its own. Set `hideOnScroll` when the tooltip's *content* goes stale on scroll, not merely its geometry.

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

## Future ideas (not shipped)

- Full WAI-ARIA focus-triggered tooltip pattern (also appears on keyboard focus, dismisses on Escape). Current version is mouse-only.

## License

MIT
