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
| `mouseOffsetX`, `mouseOffsetY` | `12`, `16` | Gap from cursor to tooltip in px. |
| `hysteresisPx` | `20` | Clearance required before un-flipping from an edge-overflow position. Prevents flicker. |
| `edgePadPx` | `8` | Minimum distance from viewport edge. |
| `minWidth`, `maxWidth` | `120`, `300` | Size bounds. |
| `role` | `'tooltip'` | ARIA role. |
| `ariaLabel` | — | Describes the panel for screen readers. |
| `class`, `panelClass`, `portalTarget` | — | Passthrough styling / mount hooks. |

## Viewport clamping with hysteresis

Default position is below-right of the cursor. If the tooltip would overflow the right or bottom edge, it flips to the opposite side. Once flipped, it requires `hysteresisPx` of clearance before flipping back — this prevents the tooltip from jittering when the cursor is right at the boundary.

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
