# @cujuju/solidjs-seg-buttons

Segmented button control for SolidJS. Controlled or uncontrolled. Full a11y. RTL-ready via CSS logical properties.

## Install

```
pnpm add @cujuju/solidjs-seg-buttons
```

The package ships its own stylesheet, auto-imported via the entrypoint. If your bundler doesn't pick up the side-effect import, add it manually:

```ts
import '@cujuju/solidjs-seg-buttons/styles.css';
```

## Usage

### Uncontrolled (caller manages state per button)

```tsx
import { SegGroup, SegButton } from '@cujuju/solidjs-seg-buttons';

const [tf, setTf] = createSignal('day');

<SegGroup ariaLabel="Timeframe">
  <SegButton label="Day"   active={tf() === 'day'}   onClick={() => setTf('day')} />
  <SegButton label="Week"  active={tf() === 'week'}  onClick={() => setTf('week')} />
  <SegButton label="Month" active={tf() === 'month'} onClick={() => setTf('month')} />
</SegGroup>
```

### Controlled (SegGroup owns the selected value)

```tsx
<SegGroup value={tf()} onChange={setTf} ariaLabel="Timeframe">
  <SegButton value="day"   label="Day" />
  <SegButton value="week"  label="Week" />
  <SegButton value="month" label="Month" />
</SegGroup>
```

When `SegGroup.value` is set, `SegButton`s read state from context and call `onChange` with their own `value` prop on click. Falls back to `active`/`onClick` props when context is absent.

### Radiogroup semantics (recommended for mutually-exclusive selections)

```tsx
<SegGroup role="radiogroup" value={tf()} onChange={setTf} ariaLabel="Timeframe">
  <SegButton value="day" label="Day" />
  <SegButton value="week" label="Week" />
</SegGroup>
```

- `role="radiogroup"` on the wrapper; each SegButton emits `role="radio"` with `aria-checked`
- Roving tabindex: only the active button is Tab-focusable
- ArrowLeft / ArrowRight move focus (and selection) between siblings

The default is `role="group"` with `aria-pressed` on each button — simpler and works fine for non-exclusive toggle patterns.

## API

### `<SegGroup>`

| Prop | Default | Description |
|---|---|---|
| `value` | — | Controlled-mode selected value. If set, enables context-driven selection. |
| `onChange(value)` | — | Called when a child SegButton with a `value` is clicked. |
| `role` | `'group'` | `'group'` (aria-pressed mode) or `'radiogroup'` (ARIA radio mode). |
| `ariaLabel` | — | Describes the group for screen readers. |
| `class` | — | Additional class on the wrapper span. |

### `<SegButton>`

| Prop | Default | Description |
|---|---|---|
| `label` | (required) | Button label. Also used for bold-width reservation. |
| `active` | `false` | Selected state (uncontrolled mode). |
| `onClick` | — | Click handler (uncontrolled mode). |
| `value` | — | This button's value in controlled mode. |
| `size` | `'md'` | Preset — `'xs'` / `'sm'` / `'md'`. |
| `height` | (preset) | Raw override. Numbers → px. |
| `paddingX` | (preset) | Raw override. |
| `fontSize` | (preset) | Raw override. |
| `minWidth` | — | Optional px minimum width. |
| `reserveBoldWidth` | `true` | Reserves bold-weight width so active state doesn't shift layout. |
| `children` | — | Alternate content (icon + text, etc.). Falls back to `label`. |
| `disabled` | `false` | Non-interactive, dimmed. |
| `ariaLabel` | — | Screen-reader label override. |
| `title` | — | Native tooltip. |
| `class` | — | Additional class. |

## Theming

Override any of these CSS custom properties at any ancestor level:

```css
:root {
  --seg-active-bg: #10b981;
  --seg-active-border: #059669;
  --seg-active-text: #ffffff;
  --seg-active-weight: 600;

  --seg-inactive-bg: #1e293b;
  --seg-inactive-border: #334155;
  --seg-inactive-text: #94a3b8;

  --seg-disabled-opacity: 0.4;
  --seg-focus-ring: 2px solid #6366f1;
  --seg-focus-ring-offset: 2px;
  --seg-radius: 4px;
}
```

### Intent variants (extension pattern)

The library ships with one accent. For red/green/etc. variants, define a scoped override:

```css
.seg-danger {
  --seg-active-bg: #fee2e2;
  --seg-active-border: #ef4444;
  --seg-active-text: #dc2626;
}
```

Then apply the class to the `SegGroup` or individual `SegButton`:

```tsx
<SegButton class="seg-danger" active={mode() === 'delete'} onClick={...} label="Delete" />
```

## RTL

All corner-rounding and button-overlap uses CSS logical properties (`border-start-start-radius`, `margin-inline-start`, etc.), so RTL layouts flip correctly when `dir="rtl"` is set on any ancestor.

## Touch targets

Preset sizes `xs` (20px) and `sm` (24px) fall below WCAG 2.1 AA minimum touch target size of 44×44 CSS px. For touch-primary UIs, use `size="md"` (28px) with a `height` override:

```tsx
<SegButton height={44} paddingX="1rem" label="Mobile" active={...} onClick={...} />
```

## License

MIT
