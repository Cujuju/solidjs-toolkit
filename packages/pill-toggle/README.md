# @cujuju/solidjs-pill-toggle

iOS-style pill toggle for SolidJS. Icons, loading/readOnly/disabled states, press effects, `role="switch"` a11y, indeterminate ("mixed") state.

## Install

```
pnpm add @cujuju/solidjs-pill-toggle
```

Stylesheet is side-effect-imported via the entrypoint; or `import '@cujuju/solidjs-pill-toggle/styles.css'` manually.

## Usage

```tsx
import { PillToggle } from '@cujuju/solidjs-pill-toggle';
const [on, setOn] = createSignal(false);

<PillToggle
  enabled={on()}
  onToggle={() => setOn(!on())}
  size="md"
  ariaLabel="Notifications"
/>
```

## API

| Prop | Default | Description |
|---|---|---|
| `enabled` | (required) | Controlled on/off state. |
| `onToggle` | (required) | Fired on click / Space keypress. |
| `indeterminate` | `false` | Renders a "mixed" visual state (centered, dimmed dot) and emits `aria-checked="mixed"` for partially-selected group toggles. `enabled` is still the prediction of what the next commit would set; consumer decides target state in `onToggle`. |
| `size` | `'md'` | `'xs'` (24×12), `'sm'` (28×14), `'md'` (32×18), `'lg'` (40×22). |
| `width`, `height`, `dotSize` | (preset) | Raw overrides. Numbers → px. |
| `onColor`, `offColor`, `dotColor` | (CSS vars) | Direct color overrides. |
| `disabled` | `false` | Non-interactive, dimmed. |
| `readOnly` | `false` | Non-interactive but Tab-focusable and not dimmed to disabled level. |
| `loading` | `false` | Shows spinner inside dot. Sets `aria-busy`. |
| `onIcon`, `offIcon` | — | JSX inside the dot when `enabled` / `!enabled`. |
| `animation` | `'linear'` | `'linear'` / `'ease'` / `'bounce'` / `'none'`. |
| `transitionMs`, `easing` | (preset) | Raw animation overrides. |
| `pressEffect` | `'none'` | `'scale'` (dot briefly shrinks) or `'ripple'` (radial flash). |
| `ariaLabel`, `ariaLabelledBy`, `title` | — | a11y / tooltip. |
| `class`, `style`, `dataAttr` | — | Passthrough. |

## Animation preset defaults

| `animation` | `transitionMs` | `easing` |
|---|---|---|
| `linear` | 150 | `linear` |
| `ease` | 150 | `cubic-bezier(0.4, 0, 0.2, 1)` |
| `bounce` | 300 | `cubic-bezier(0.68, -0.55, 0.265, 1.55)` |
| `none` | 0 | — |

Explicit `transitionMs` / `easing` override the preset per-property. `prefers-reduced-motion` collapses to `none`.

## Theming

```css
:root {
  --tp-on-bg: #10b981;
  --tp-off-bg: #334155;
  --tp-dot: #ffffff;
  --tp-dot-mixed: color-mix(in srgb, var(--tp-dot) 55%, transparent); /* indeterminate dot fill */
  --tp-disabled-opacity: 0.5;
  --tp-readonly-opacity: 0.85;
  --tp-focus-ring: 2px solid #6366f1;
  --tp-focus-ring-offset: 2px;
}
```

## A11y

Emits `role="switch"` with `aria-checked` (`"true"` / `"false"` / `"mixed"`). Space toggles (Enter does not, matching the `role="switch"` spec). Full `:focus-visible` ring.

## License

MIT
