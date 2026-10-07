# @cujuju/solidjs-virtual-log

A virtualized, bottom-anchored log for SolidJS: chat, logs, activity feeds. Rows are measured as they draw, older rows
page in as the top nears, and **the scroll offset is never written while the user is scrolling** — the property that
keeps iOS momentum scrolling smooth.

```tsx
import { createVirtualLog, VirtualLog } from '@cujuju/solidjs-virtual-log';

const log = createVirtualLog({ rows, estimateSize: 44, hasOlder, loadOlder, following });

<div ref={log.ref} style={{ height: '100%', 'overflow-y': 'auto' }}>
  <VirtualLog log={log} onRowMenu={openMenu}>{(row) => <Message msg={row()} />}</VirtualLog>
</div>;
```

## Model

- **Bottom-anchored.** `ref` makes the scroller `column-reverse`, so offsets count up from the newest row. Rows loaded
  or measured above the view never move it, with no scroll write.
- **Measured by key.** One `ResizeObserver` reads each row's border box; sizes stay with row keys across prepends,
  appends and replacements.
- **One anchor rule.** After rows change size or come and go, the view keeps the row cut by its top edge in place
  (reading history), keeps its bottom edge (following, scrolled slightly up), stays on the newest row (following, at
  the bottom), or keeps a held row centered.
- **Corrections wait for rest.** While a touch, mouse button, wheel, keyboard or momentum scroll is active, a correction
  only translates the rows (`shift`); the native scroll offset and extent are untouched. Nearing the newest row, the
  shift is folded away in step with the scroll, so there is no false bottom. Once the scroller rests (no
  input, no movement, in bounds for 3 frames and 150ms), the extent and offset are set in one step, invisibly.
- **Runway.** While `hasOlder()`, blank space above the oldest row lets a fling run on while the next page loads.

## API

`createVirtualLog(options)`:

| option | |
|---|---|
| `rows` | `Accessor<readonly R[]>`, oldest first |
| `getKey` | default `row.key` |
| `estimateSize` | px, or per row |
| `overscanPx`, `overscan` | drawn beyond the view: px (default one viewport) plus rows (default 4) |
| `endPadding` | space under the newest row |
| `following` | the view follows the newest row |
| `hasOlder`, `loadOlder`, `olderThreshold` | paging; loads when the top edge is within `olderThreshold` rows (10) or two viewports |
| `runwayPx` | default 3 viewports |
| `layoutKey` | changing it (density, font) marks measurements stale |

Returns `ref`, `keys`, `allKeys`, `rowByKey`, `startOf`, `extent`, `shift`, `distanceFromBottom`, `distanceFromTop`,
`inViewKey`, `bottomOf(key)`, `scrollToKey(key, { align })`, `holdRow(key | null, align?)`, `holding`, `scrollToBottom`,
`isScrolling`, `checkOlder`. `align` is `'auto'`, `'center'` (holdRow's default) or `{ bottom }`: the row's bottom edge
that many pixels above the view's bottom, as `bottomOf` reads it, so a saved place can be restored.

`<VirtualLog log class? onRowMenu?>`: one Tab stop (the last focused row, else the newest in view); ArrowUp/ArrowDown
move between rows; the ContextMenu key or Shift+F10 calls `onRowMenu(rowEl)`.

## Limits

- A correction held mid-scroll (posts arriving, rows below growing) is folded away as the view nears the newest row:
  content runs up to 2x the scroll over that stretch, so the newest row arrives exactly at the bottom.
- A fling longer than the runway still stops at the loaded top.
- Media without a reserved size grows after it loads, and the rows around it move by that growth (above it while
  following the newest row, below it otherwise). Reserve media boxes where the size is known.
- Playwright's WebKit is not iOS: check momentum and rubber-banding on a device.
