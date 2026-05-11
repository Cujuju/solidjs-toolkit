# @cujuju/solidjs-tri-state-chip

A single tri-state filter chip for SolidJS. One button cycling `unselected` → `included` → `excluded` → `unselected` on click. Ships pure state helpers (`cycleTriState`, `applyTriState`, `tristateOf`, `EMPTY_TRI_STATE`) so callsites can manage upstream `TriStateValue` shape without re-implementing the disjoint-set math.

Not a popover. Just the chip. Drop it inside whatever filter shell you already have (popover, inline bar, drawer) — the panel, dismissal, and viewport clamping are your concern.

## Install

```
pnpm add @cujuju/solidjs-tri-state-chip
```

Stylesheet is side-effect-imported via the entrypoint; or `import '@cujuju/solidjs-tri-state-chip/styles.css'` manually.

## Usage

```tsx
import {
  TriStateChip,
  applyTriState,
  tristateOf,
  EMPTY_TRI_STATE,
  type TriStateValue,
} from '@cujuju/solidjs-tri-state-chip';
import { createSignal, For } from 'solid-js';

const [value, setValue] = createSignal<TriStateValue>(EMPTY_TRI_STATE);
const options = ['action', 'comedy', 'drama'];

<For each={options}>
  {(opt) => (
    <TriStateChip
      label={opt}
      value={tristateOf(value(), opt)}
      onCycle={(next) => setValue(applyTriState(value(), opt, next))}
    />
  )}
</For>
```

## API — `<TriStateChip>`

| Prop | Default | Description |
|---|---|---|
| `label` | (required) | Chip body content. Plain text or JSX. |
| `value` | (required) | Current state: `'unselected'` / `'included'` / `'excluded'`. |
| `onCycle` | (required) | Fires with the next state on click. |
| `disabled` | `false` | Non-interactive, dimmed. |
| `nextState` | `cycleTriState` | Override the cycle order. |
| `includePrefix` | `'+ '` | Glyph shown before the label when included. Pass `''` to suppress. |
| `excludePrefix` | `'− '` | Glyph shown before the label when excluded. |
| `ariaLabel` | — | Override for screen readers. |
| `class`, `style`, `dataAttr` | — | Passthrough. |

## API — state helpers

```ts
type TriState = 'unselected' | 'included' | 'excluded';
interface TriStateValue { included: string[]; excluded: string[] }

const EMPTY_TRI_STATE: TriStateValue;
cycleTriState(current: TriState): TriState;
tristateOf(value: TriStateValue, item: string): TriState;
applyTriState(value: TriStateValue, item: string, next: TriState): TriStateValue;
```

All pure, no Solid dependency — safe to import in stores, tests, or workers.

## Theming

```css
:root {
  --ctc-bg: transparent;
  --ctc-color: inherit;
  --ctc-border: 1px solid currentColor;
  --ctc-border-hover: 1px solid #6366f1;

  --ctc-bg-included: rgba(16, 185, 129, 0.15);
  --ctc-color-included: #10b981;
  --ctc-border-included: 1px solid #10b981;
  --ctc-bg-included-hover: rgba(16, 185, 129, 0.25);

  --ctc-bg-excluded: rgba(244, 63, 94, 0.15);
  --ctc-color-excluded: #f43f5e;
  --ctc-border-excluded: 1px solid #f43f5e;
  --ctc-bg-excluded-hover: rgba(244, 63, 94, 0.25);

  --ctc-padding: 5px 10px;
  --ctc-radius: 6px;
  --ctc-font-size: 0.875rem;
  --ctc-font-weight: 500;
  --ctc-transition: 150ms ease;
  --ctc-disabled-opacity: 0.5;
  --ctc-focus-ring: 2px solid #6366f1;
  --ctc-focus-ring-offset: 2px;
}
```

## A11y

The chip emits `aria-pressed="true"` when the state is `included` or `excluded`, and `aria-pressed="false"` when `unselected`. The include-vs-exclude distinction is carried visually (color, prefix glyph) and via `data-state="included" | "excluded" | "unselected"` on the root for CSS / automation. `aria-pressed="mixed"` is intentionally NOT used — per W3C, `mixed` is reserved for partially-selected groups, not for distinguishing two pressed flavors of a single toggle. Pass `ariaLabel="Genre: action (included)"` from the consumer if richer screen-reader output is needed.

## License

MIT
