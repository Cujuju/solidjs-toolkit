# @cujuju/solidjs-pill-number-picker

Compact number stepper for SolidJS. 8 layouts (horizontal + vertical). Auto-repeat with optional acceleration. Full spinbutton a11y. RTL-ready via CSS logical properties.

## Install

```
pnpm add @cujuju/solidjs-pill-number-picker
```

Stylesheet auto-imports; or import `@cujuju/solidjs-pill-number-picker/styles.css` manually.

## Usage

```tsx
import { PillNumberPicker } from '@cujuju/solidjs-pill-number-picker';

const [qty, setQty] = createSignal(1);

<PillNumberPicker
  value={qty()}
  onChange={setQty}
  min={1}
  max={10}
  ariaLabel="Quantity"
/>
```

## API (highlights)

| Prop | Default | Description |
|---|---|---|
| `value` | (required) | Controlled current value. |
| `onChange(v)` | (required) | Called on any change. |
| `min`, `max`, `step` | `1`, `100`, `1` | Range + step size. `step` may be non-integer (e.g., `0.5`, `0.01`). |
| `precision` | (inferred from `step`) | Decimal places for parsing, step rounding, and display. Auto-inferred from `step` (so `step={0.5}` gives precision 1). Set explicitly to override — e.g. `step={1}, precision={2}` for integer steps with two-decimal display ('5.00'). Set to 0 to force integer mode regardless of step. |
| `size` | `'md'` | `'xs'` / `'sm'` / `'md'`. |
| `width`, `height`, `buttonWidth`, `fontSize` | (preset) | Raw overrides. |
| `layout` | `'value-inc-dec'` | See layout table below. |
| `editable` | `true` | Click value to edit inline. |
| `suffix` | — | Label appended after the value (e.g., `"px"`). |
| `zeroLabel` | — | Display text when value is 0 (e.g., `"∞"`). |
| `displayValue(v)` | — | Format the displayed value. |
| `incrementIcon`, `decrementIcon` | `+`, `−` | JSX content for the buttons. |
| `showRange`, `rangeFormat` | `false` | Show `"3 / 100"`-style range. |
| `invertScroll` | `false` | Wheel-up decrements instead of increments. |
| `disableWheel` | `false` | No mouse-wheel handling. |
| `requireFocus` | `false` | Wheel only works when focused (prevents scroll-trap in scrollable containers). |
| `autoRepeatDelay` | `400` | ms before held +/− starts repeating. |
| `autoRepeatInterval` | `60` | ms between repeats. |
| `autoRepeatAcceleration` | `false` | Interval halves every 1.5s held, floor 15ms. |
| `ariaLabel` | — | Screen-reader name for the picker. |
| `incrementLabel`, `decrementLabel` | `'Increase'`, `'Decrease'` | Button labels (i18n). |
| `disabled` | `false` | Non-interactive. |

## Layouts

| `layout` | Visual |
|---|---|
| `'value-inc-dec'` (default) | `[value][+][−]` |
| `'value-dec-inc'` | `[value][−][+]` |
| `'inc-value-dec'` | `[+][value][−]` |
| `'dec-value-inc'` | `[−][value][+]` |
| `'inc-dec-value'` | `[+][−][value]` |
| `'dec-inc-value'` | `[−][+][value]` |
| `'v-inc-value-dec'` | `[+] / [value] / [−]` (stacked) |
| `'v-dec-value-inc'` | `[−] / [value] / [+]` (stacked) |

## A11y

- Wrapper has `role="group"`; value span has `role="spinbutton"` with `aria-valuenow/min/max`.
- Keyboard: ArrowUp/ArrowDown (±step), PageUp/PageDown (±step×10), Home/End (min/max), Enter commits edit, Escape cancels.
- `:focus-visible` ring via `--pnp-focus-ring`.
- RTL: CSS logical properties flip corners for `dir="rtl"` layouts.

## Theming

```css
:root {
  --pnp-bg: #1e293b;
  --pnp-border: #334155;
  --pnp-text: #e2e8f0;
  --pnp-text-muted: #94a3b8;
  --pnp-suffix-color: #64748b;
  --pnp-radius: 9999px;
  --pnp-disabled-opacity: 0.3;
  --pnp-focus-ring: 2px solid #6366f1;
  --pnp-focus-ring-offset: 2px;
}
```

## Future ideas (not shipped)

- Live digit-filter on input (`filterInput?: 'numeric' | 'digits'`) — today, non-numeric keypresses sit in the draft and are discarded on commit.

## License

MIT
