# @cujuju/solidjs-collapsible

Collapsible section for SolidJS. Persisted open state, `forceOpen` override with manual-toggle semantics, `'section'` and `'panel'` visual variants, full a11y (`aria-expanded` / `aria-controls` / `role="region"`), keyboard-friendly.

## Install

```
pnpm add @cujuju/solidjs-collapsible
```

Stylesheet auto-imported via entrypoint (or import `@cujuju/solidjs-collapsible/styles.css` manually).

## Usage

```tsx
import { Collapsible } from '@cujuju/solidjs-collapsible';

<Collapsible
  title="Filters"
  storageKey="search-filters"
  storageKeyPrefix="myapp:section:"
  count={activeFilters().length}
>
  <FiltersPanel />
</Collapsible>
```

## Hook + component

- **`useCollapsible`** is the state-machine hook (for consumers who want custom visuals).
- **`<Collapsible>`** is the batteries-included component.

```tsx
import { useCollapsible } from '@cujuju/solidjs-collapsible';

const state = useCollapsible({ storageKey: 'myapp:filters' });
<button onClick={state.toggle}>
  {state.open() ? 'Collapse' : 'Expand'}
</button>
<Show when={state.open()}>...content...</Show>
```

## API

### `<Collapsible>` props

| Prop | Default | Description |
|---|---|---|
| `title` | (required) | string or JSX. |
| `children` | (required) | Content body. |
| `count` | — | Optional number rendered as `(N)` after the title. |
| `actions` | — | Right-aligned JSX in the header row. |
| `icon` | `▶` | Single icon; rotates 90° when open. |
| `openIcon`, `closedIcon` | — | Distinct icons per state (overrides `icon`). |
| `storageKey` | — | localStorage key for persistence. If omitted, state is ephemeral. |
| `storageKeyPrefix` | `''` | Prefix prepended to `storageKey`. Empty by default — consumers control their own namespace. |
| `defaultOpen` | `true` | Initial value when no persisted state exists. |
| `forceOpen` | — | Override value (e.g., from an "expand all" button). See semantics below. |
| `onChange(open)` | — | Fires whenever the effective open state changes. |
| `uppercase` | `false` | Applies uppercase + letter-spacing to the title. |
| `variant` | `'section'` | `'section'` (transparent header) or `'panel'` (card with background + border). |
| `lazyMount` | `false` | Render children only after first open. |
| `keepMounted` | `true` | Keep DOM when closed (hidden via CSS). Set false to unmount on close. |
| `animated` | `false` | Animate content height on toggle. |
| `ariaLabel`, `id` | — | a11y hooks. `ariaLabel` names the section (the root gets `role="group"`). |
| `class`, `headerClass`, `contentClass` | — | Style passthrough. |

### `useCollapsible(options)`

Same state-related options as the component plus `forceOpen` is an **accessor** (`() => boolean | null | undefined`) rather than a value.

Returns `{ open, toggle, setOpen, manuallyToggled, reset }`.

## `forceOpen` + `manuallyToggled` semantics

Designed for "Expand All" / "Collapse All" buttons where the user can still override per-section:

```
forceOpen: null              → section respects its own local state
forceOpen: true              → section opens (unless manuallyToggled is true)
user toggles (open→closed)   → manuallyToggled = true; user's choice sticks
forceOpen: true (unchanged)  → no effect; user's choice still wins
forceOpen: false             → NEW value: manuallyToggled resets, section closes
forceOpen: true              → NEW value: manuallyToggled resets, section opens
```

Detection is **by value**: re-asserting the same `forceOpen` value is a no-op. Only a *change* to a different value resets `manuallyToggled`.

## Theming

```css
:root {
  --cl-arrow-color-open: #64748b;
  --cl-arrow-color-closed: #f59e0b;
  --cl-title-color: #64748b;
  --cl-title-size: 14px;
  --cl-title-weight: 600;
  --cl-title-tracking: 0.08em;
  --cl-count-color: #94a3b8;
  --cl-panel-bg: #1e293b;
  --cl-panel-border: #334155;
  --cl-panel-radius: 4px;
  --cl-animation-duration: 180ms;
}
```

## A11y

- Header: `<button>` with `aria-expanded` + `aria-controls`.
- Content: `role="region"` with `aria-labelledby` pointing back to the header id.
- Arrow icons: `aria-hidden="true"` (decorative).
- Space/Enter toggle (native button behavior).
- `prefers-reduced-motion` disables arrow rotation and height transitions.

## Animation caveat

When `animated={true}`, open↔close animates `grid-template-rows: 0fr ↔ 1fr` on the content wrapper, which tracks the content's natural height with no JS measurement — dynamic content needs no re-measure. Collapsed animated content stays mounted but `inert` (out of the tab order and accessibility tree). The transition itself needs grid-track interpolation — Chrome 107+ / Firefox 66+ / Safari 16+ (MDN BCD `css.properties.grid-template-rows.animation`). The `@supports (grid-template-rows: 0fr)` gate only tests that the declaration parses, so every CSS Grid engine (Chrome 57+ / Firefox 52+ / Safari 10.1+) enters it: older ones still collapse, just without a transition. Pre-Grid engines fall outside the gate and collapse through a `display: none` fallback, so `animated={true}` stays safe everywhere — only the animation degrades.

## License

MIT
