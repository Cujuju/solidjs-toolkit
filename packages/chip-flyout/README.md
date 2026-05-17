# @cujuju/solidjs-chip-flyout

A filter **flyout** primitive for SolidJS: a secondary-button-sized
trigger that opens a Portal'd [glass menu](../glass-menu) of selectable
chips. Two selection modes, optional server-backed typeahead, and the
positioning / dismiss lifecycle handled for you.

- **`tri-state`** — each chip cycles unselected → included → excluded.
- **`multi`** — each chip toggles unselected ↔ included.

The panel follows the trigger via `getBoundingClientRect`, clamps
inside the viewport, and dismisses on outside click, Escape, viewport
resize, and page scroll (in-panel scroll is preserved).

## Install

```sh
pnpm add @cujuju/solidjs-chip-flyout \
  @cujuju/solidjs-glass-menu @cujuju/solidjs-tri-state-chip @cujuju/solidjs-hooks
```

## Usage

```tsx
import { ChipFlyout, EMPTY_TRI_STATE, type TriStateValue } from '@cujuju/solidjs-chip-flyout';

const [tags, setTags] = createSignal<TriStateValue>({ ...EMPTY_TRI_STATE });

<ChipFlyout
  mode="tri-state"
  label="Tags"
  options={[{ value: 'action', label: 'Action' }, { value: 'drama', label: 'Drama' }]}
  value={tags()}
  onChange={setTags}
/>;
```

Multi-select:

```tsx
<ChipFlyout mode="multi" label="Genres" options={opts} value={genres()} onChange={setGenres} />
```

## Props

| Prop | Type | Notes |
|------|------|-------|
| `mode` | `'tri-state' \| 'multi'` | Selection model. |
| `label` | `string` | Trigger text + default panel title. |
| `options` | `ChipOption[]` | `{ value, label, group? }`. Options sharing a `group` render under a header. |
| `value` / `onChange` | `TriStateValue` / `string[]` | Shape depends on `mode`. |
| `panelTitle` | `string?` | Overrides the panel header text. |
| `sort` | `boolean?` | Sort options alphabetically. |
| `disabled` | `boolean?` | |
| `placement` | `'bottom-start' \| 'bottom-end'` | Default `bottom-start`. |
| `panelMinWidth` / `panelMaxWidth` | `number?` | Default 280 / 480. |
| `open` / `onOpenChange` | `boolean?` / `(b) => void` | Optional controlled open state. |
| `loading`, `hasMore`, `onLoadMore`, `searchValue`, `onSearchInput`, `topSlot` | — | Server-backed typeahead extensions; each is independent. |

## Styling

`ChipFlyout` registers its own stylesheet and pulls the glass surface +
menu chrome transitively through `@cujuju/solidjs-glass-menu`. Chip
colors are themed via the `--ctc-*` variables (see
`@cujuju/solidjs-tri-state-chip`), pre-mapped to the host palette.

It references host theme tokens directly — `--color-*`, `--font-size-*`
(`xs`, `2xs`, `sm`, `base`), `--radius-*` (`sm`, `md`, `btn`),
`--height-btn`, `--spacing-xs`, `--spacing-sm`, `--transition-speed`,
and the alpha scales `--color-primary-alpha-10`,
`--color-success-alpha-{15,20,25}`, `--color-danger-alpha-{15,25}`.
`--z-flyout` has an inline fallback (`1000`).

## License

MIT
