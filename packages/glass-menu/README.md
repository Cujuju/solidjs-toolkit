# @cujuju/solidjs-glass-menu

A glass-surfaced **menu shell** for SolidJS: an optional header (title +
optional action slot + optional close button) above a scrollable body,
painted with the `.glass-menu` surface from
[`@cujuju/solidjs-glass`](../glass).

When `title`, `headerAction`, and `onClose` are all omitted the header
row is dropped entirely — so `GlassMenu` doubles as a plain glass
container for headerless menus (option lists, context menus).

It is purely presentational — it owns no positioning, no Portal, and no
dismiss lifecycle. Outside-click / Escape / open-state belong to
whatever caller controls the menu. The root element carries the
`.glass-menu` class, so a positioned popover can use `GlassMenu` itself
as the positioned element.

## Install

```sh
pnpm add @cujuju/solidjs-glass-menu @cujuju/solidjs-glass
```

## Usage

```tsx
import { GlassMenu } from '@cujuju/solidjs-glass-menu';

<GlassMenu
  title="Filters"
  headerAction={<button onClick={clearAll}>Clear</button>}
  onClose={() => setOpen(false)}
>
  <FilterChips />
</GlassMenu>;
```

Make it the positioned element directly — `ref`, `style`, `class`,
`role`, and `aria-*` all pass through to the root:

```tsx
<GlassMenu
  ref={panelEl}
  style={{ position: 'fixed', top: `${y}px`, left: `${x}px` }}
  role="dialog"
  aria-label="Filter dialog"
  title="Filters"
  onClose={close}
>
  …
</GlassMenu>
```

## Props

| Prop | Type | Notes |
|------|------|-------|
| `title` | `JSX.Element?` | Header content (left side). Omit `title` + `headerAction` + `onClose` to drop the header row entirely. |
| `headerAction` | `JSX.Element?` | Optional node between the title and the close button. |
| `onClose` | `() => void`? | Close-button handler. The close button renders **only** when this is set. |
| `headerDivider` | `boolean?` | Hairline under the header. Default `true`; `false` = flush header. |
| `children` | `JSX.Element?` | Body content. |
| ...rest | `JSX.HTMLAttributes<HTMLDivElement>` | `ref` / `style` / `class` / `role` / `aria-*` forwarded to the root. |

## Styling

`GlassMenu` registers its own chrome stylesheet and pulls `glass.css`
from `@cujuju/solidjs-glass` automatically. Host theme tokens
(`--color-text`, `--color-text-secondary`, `--color-border`,
`--font-size-base`, `--radius-md`, `--radius-sm`, `--spacing-xs`,
`--spacing-sm`, `--transition-speed`) are referenced with inline
fallbacks, so the shell renders standalone and themes when a host
provides them.

## License

MIT
