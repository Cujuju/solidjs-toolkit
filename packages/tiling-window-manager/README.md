# @cujuju/solidjs-tiling-window-manager

Split-pane tiles for SolidJS. Users resize tiles by dragging the gaps, re-dock them by dragging a grip, and add new ones by pointing at a spot. Extracted from StockApp's tiled workspace.

- **Controlled:** you own the layout tree (`layout` / `onLayoutChange`) and save it however you like. `normalize()` repairs a saved tree.
- **Resize:** drag a gap; it snaps to 0.5% steps, and holding Ctrl drags freely. Arrow keys move a focused gap 1%; double-click splits the two sides evenly. Tiles never shrink below `minSize`.
- **Move:** bind `tile.startMove` to a grip's `onPointerDown`. Dropping on another tile's edge docks the tile beside it; dropping on its centre swaps them. Esc cancels. Buttons and other controls inside the grip keep their clicks.
- **Add:** set `placing` to `{ id, label }`. Hovering previews the split, and clicking places the tile. Spots that won't work are shown in red with the reason. An empty workspace places the tile at once.
  - `placement="preserve"` (the default): the new tile only splits the tile it is placed on. Both keep their minimums, and every other tile stays put (`planInsertion`).
  - `placement="reflow"`: the new tile takes half the target's share, and other tiles may move but never drop below their minimums (`planReflow`). Use this when a full workspace should still accept tiles.
- **Grow:** with `growHeight`, the workspace sets its own `min-height` to its tiles' minimums, so placing or moving tiles can make it taller. Put it in a scrolling container.

Opt-in features:

- **Tab groups** (`tabs`): a centre drop asks **Swap** or **Tab**; a drop on an element marked `data-twm-tab-target` (usually the header) joins as a tab directly. Put `<TabStrip tile={tile} label={…} />` in the header: click or arrow keys select, dragging along the strip reorders, dragging off it docks the tab elsewhere. With an `icon`, names fold away (inactive first) when room runs out, and a More button lists every tab. Placing on a tile's centre adds the new tile as a tab.
- **Collapse** (`collapse`, or `collapse={{ barPx, stripPx }}`): `tile.collapse.set(edge)` folds a tile to a strip; the open neighbour on the other side shows its space, and reopening puts every tile back where it was. `expandAlone` / `collapseAlone` roll a split's siblings; each action has a `can…` check that gives a reason when it cannot run. `tile.collapse.peek()` tells a strip where its content could open and how far.
- **Resize readout** (`readout`, or `readout={{ color }}`): while a gap is dragged, a panel shows every share and length in its split. Shift moves it to the other side.
- **Guides** (`alignWith={[{ name, layout }]}`): a dragged gap snaps to the same-axis gaps of other layouts (sibling workspaces) laid out at this size, and the readout names the one it lined up with.
- **Keyboard placement** (`keyboardPlacement`, or `keyboardPlacement={{ label }}`): while placing, Tab moves between tiles, arrow keys pick a side (T picks the centre when tabs are on), Enter places and Esc cancels.

```tsx
import { TabStrip, TilingWorkspace, normalize, type TileNode } from '@cujuju/solidjs-tiling-window-manager';
import '@cujuju/solidjs-tiling-window-manager/styles.css';

<TilingWorkspace
  layout={layout()}
  onLayoutChange={setLayout}
  minSize={(id) => ({ width: 200, height: 140 })}
  placing={placing()}
  onPlace={(id, next) => { addPanel(id); setLayout(next); setPlacing(null); }}
  onPlacingCancel={() => setPlacing(null)}
  tabs
  collapse
  readout
  keyboardPlacement
>
  {(tile) => (
    <section>
      <header onPointerDown={tile.startMove} data-twm-tab-target>
        {tile.tabs() ? <TabStrip tile={tile} label={(id) => titleOf(id)} /> : titleOf(tile.id)}
        <button onClick={() => tile.collapse.set(tile.collapse.edge() ? null : 'left')}>Fold</button>
        <button onClick={tile.remove}>×</button>
      </header>
      …
    </section>
  )}
</TilingWorkspace>
```

The workspace fills its own box. Give it a height. A collapsed tile keeps rendering at strip size, so show only its header there.

## Model

These are pure functions with no DOM. Every edit returns a canonical tree: no row directly inside a row, every share positive and finite, and only collapse flags that can hold.

- Tree: `insertTile`, `dock`, `swapTiles`, `removeTile`, `resizeSplit`, `appendTile`, `addToTabs`, `moveTab`, `setActiveTab`, `normalize`.
- Collapse: `setSlotCollapsed`, `canCollapse`, `expandSlotAlone`, `collapseSlotAlone`, `shareHolders`, `viewShares`.
- Layout and planning: `computeTileLayout`, `minimumSize`, `resizedShares`, `planInsertion`, `planReflow`, `planTab`, `planMove`, `resizeGuides`, `planTabFold`.

A slot is a tile or a tab group. Collapse state lives on slots: a collapsed slot keeps its own share as its come-back size while the neighbour that shows its space holds it.

## Theming

Set the `--twm-*` custom properties: `accent`, `accent-soft`, `danger`, `danger-soft`, `border`, `border-strong`, `surface`, `text`, `text-muted`, `shadow`, `radius`.

## Not included

- Popping a tile out to another window (StockApp's cross-window drag): it depends on the host app's windows.
- Hover peeks for collapsed tiles: `tile.collapse.peek()` gives the edge and reach, and drawing the peek is left to you.
