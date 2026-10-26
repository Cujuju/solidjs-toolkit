# @cujuju/solidjs-tiling-window-manager

Split-pane tiles for SolidJS. Users resize tiles by dragging the gaps, re-dock them by dragging a grip, and add new ones by pointing at a spot. Extracted from StockApp's tiled workspace.

- **Controlled:** you own the layout tree (`layout` / `onLayoutChange`) and save it however you like. `normalize()` repairs a saved tree.
- **Resize:** drag a gap; it snaps to 0.5% steps, and holding Ctrl drags freely. Arrow keys move a focused gap 1%; double-click splits the two sides evenly. Tiles never shrink below `minSize`.
- **Move:** bind `tile.startMove` to a grip's `onPointerDown`. Dropping on another tile's edge docks the tile beside it; dropping on its centre swaps them. Esc cancels. Buttons and other controls inside the grip keep their clicks.
- **Add:** set `placing` to `{ id, label }`. Hovering previews the split, and clicking places the tile. Spots that won't work are shown in red with the reason. An empty workspace places the tile at once.
  - `placement="preserve"` (the default): the new tile only splits the tile it is placed on. Both keep their minimums, and every other tile stays put (`planInsertion`).
  - `placement="reflow"`: the new tile takes half the target's share, and other tiles may move but never drop below their minimums (`planReflow`). Use this when a full workspace should still accept tiles.
- **Grow:** with `growHeight`, the workspace sets its own `min-height` to its tiles' minimums, so placing or moving tiles can make it taller. Put it in a scrolling container.

```tsx
import { TilingWorkspace, normalize, type TileNode } from '@cujuju/solidjs-tiling-window-manager';
import '@cujuju/solidjs-tiling-window-manager/styles.css';

<TilingWorkspace
  layout={layout()}
  onLayoutChange={setLayout}
  minSize={(id) => ({ width: 200, height: 140 })}
  placing={placing()}
  onPlace={(id, next) => { addPanel(id); setLayout(next); setPlacing(null); }}
  onPlacingCancel={() => setPlacing(null)}
>
  {(tile) => (
    <section>
      <header onPointerDown={tile.startMove}>Chart <button onClick={tile.remove}>×</button></header>
      …
    </section>
  )}
</TilingWorkspace>
```

The workspace fills its own box. Give it a height.

## Model

These are pure functions with no DOM: `insertTile`, `dock`, `swapTiles`, `removeTile`, `resizeSplit`, `appendTile`, `normalize`, `computeTileLayout`, `minimumSize`, `planInsertion`, `planReflow`, `planMove`. Every edit returns a canonical tree: no row directly inside a row, and every share positive and finite.

## Theming

Set the `--twm-*` custom properties: `accent`, `accent-soft`, `danger`, `danger-soft`, `border`, `border-strong`, `surface`, `text`, `text-muted`, `shadow`, `radius`.

## Not included (yet)

- Tabs and collapsible tiles (StockApp has both).
- Resize readouts.
- Keyboard placement: adding a tile takes a pointer.
