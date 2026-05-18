# @cujuju/solidjs-select-flyout

A keyboard-accessible **`<select>` replacement** for SolidJS — roving
focus, type-ahead, and full ARIA `combobox` + `listbox` semantics. The
dropdown is painted by the `.glass-menu` surface from
[`@cujuju/solidjs-glass`](../glass) (via
[`@cujuju/solidjs-glass-menu`](../glass-menu)) and positioned through
[`@cujuju/solidjs-anchored-popover`](../anchored-popover).

Native UA-rendered `<option>` lists cannot accept `backdrop-filter` or
other modern CSS effects — the OS owns the popup chrome. `Flyout` is a
fully author-rendered panel, so a glass-styled select is possible.

`Flyout` is **controlled**: it owns no value state. Pass `value` +
`onChange` and render it wherever a native single-choice `<select>`
would go.

## Install

```sh
pnpm add @cujuju/solidjs-select-flyout @cujuju/solidjs-anchored-popover @cujuju/solidjs-glass-menu @cujuju/solidjs-glass @cujuju/solidjs-hooks
```

`@cujuju/solidjs-anchored-popover`, `@cujuju/solidjs-glass-menu`, and
`@cujuju/solidjs-hooks` are peer dependencies; `glass-menu` in turn
needs `@cujuju/solidjs-glass`. `solid-js >=1.7.0` is also a peer
dependency.

## Quick start

```tsx
import { createSignal } from 'solid-js';
import { Flyout } from '@cujuju/solidjs-select-flyout';

function Example() {
  const [fruit, setFruit] = createSignal('apple');

  return (
    <Flyout
      value={fruit()}
      onChange={setFruit}
      ariaLabel="Fruit"
      options={[
        { value: 'apple', label: 'Apple' },
        { value: 'banana', label: 'Banana' },
        { value: 'cherry', label: 'Cherry', disabled: true },
      ]}
    />
  );
}
```

## Props — `FlyoutProps`

| Prop | Type | Notes |
|------|------|-------|
| `options` | `FlyoutOption[]` | The selectable options — see [`FlyoutOption`](#flyoutoption). |
| `value` | `string` | Currently selected option `value`. No match → the trigger shows `placeholder` (and a dev warning fires when `value` is non-empty). |
| `onChange` | `(value: string) => void` | Called with the chosen option's `value`. |
| `placeholder` | `string?` | Trigger text when `value` matches no option. |
| `disabled` | `boolean?` | Disables the trigger; the panel never opens. |
| `ariaLabel` | `string?` | Accessible name for the trigger (`combobox`) and the `listbox`. |
| `class` | `string?` | Class applied to the trigger button — for width / margin. The trigger's own structural styles are emitted at single-class specificity, so author rules merge as expected. |
| `id` | `string?` | Trigger element `id` — useful when an external `<label for=...>` points at it. |

### `FlyoutOption`

| Field | Type | Notes |
|-------|------|-------|
| `value` | `string` | Stable identity passed to `onChange`. |
| `label` | `string` | Display text — also the type-ahead match target. |
| `disabled` | `boolean?` | Not focusable, not selectable; skipped by arrow / Home / End navigation. |

## Keyboard

| Key | Closed trigger | Open panel |
|-----|----------------|------------|
| `Space` / `Enter` | open | select focused option |
| `ArrowDown` / `ArrowUp` | open | move focus (wraps, skips disabled) |
| `Home` / `End` | — | first / last enabled option |
| `Escape` | — | close, restore focus to trigger |
| `Tab` | — | close, restore focus, let Tab proceed |
| printable char | — | type-ahead jump (500 ms idle buffer) |

## What Flyout does NOT do

- **Multi-select** — `value` is a single `string`. Fork if you need multi.
- **Async / virtualized option lists** — the panel scrolls past ~10
  rows; keep option counts modest, like a native select.
- **Search / filter input** — use a chip-flyout or a bespoke combobox.
- **Form association** — the trigger is a `<button type="button">`
  with no hidden input; the value lives only in the `value`/`onChange`
  pair, not in `<form>` FormData.

## Styling

`Flyout` uses stable global classes, prefixed `cujuju-select-flyout-*`
(`-trigger`, `-trigger-open`, `-chevron`, `-label`, `-placeholder`,
`-panel`, `-list`, `-option`, `-option-selected`, `-option-focused`,
`-check`).

The stylesheet registers itself as an import side effect — **when the
package is consumed from source** (the `solid` export condition). A
**published `dist` build** extracts CSS to a separate file that the
JS bundle does not reference; `dist` consumers must import it once:

```ts
import '@cujuju/solidjs-select-flyout/styles.css';
```

The `.glass-menu` surface is themed through `@cujuju/solidjs-glass`
(see that package's menu-tint engine).

### Host theme tokens

The trigger / panel reference these CSS custom properties — provide
them on a host ancestor (e.g. `:root`): `--height-btn`,
`--color-border`, `--color-surface`, `--color-surface-hover`,
`--color-text`, `--color-text-secondary`, `--color-primary`,
`--color-primary-alpha-10`, `--radius-btn`, `--radius-sm`,
`--font-size-sm`, `--z-flyout`.

## License

MIT
