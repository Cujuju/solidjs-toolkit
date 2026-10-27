import './styles.css';

export { TilingWorkspace, DEFAULT_GAP_PX, DEFAULT_MIN_TILE_PX, type CollapseControls, type TabGroup, type TileContext, type TilingWorkspaceProps } from './TilingWorkspace';
export { TabStrip, type TabStripProps } from './TabStrip';
export { planTabFold, tabShowsName, FOLD_HYSTERESIS_PX, type TabFold, type TabFoldInput, type TabWidths } from './tabStripFold';
export type { Placing } from './PlacementLayer';
export { DOCK_THRESHOLD_PX, MOVE_ZONES, TAB_TARGET_ATTR } from './createDockGesture';
export {
  computeTileLayout, DEFAULT_COLLAPSED_PX, equalisedShares, minimumSize, resizedShares, slotRects, RESIZE_KEY_STEPS, RESIZE_STEP_RATIO,
  type LayoutHandle, type LayoutRect, type LayoutSlot, type ResizeSnap, type TileLayout, type TileLayoutOptions, type TileSize,
} from './layout';
export {
  planInsertion, planMove, planReflow, planTab, tileHitAt, TOO_SMALL, UNAVAILABLE, WOULD_RESIZE,
  type InsertionPlan, type PlacementMode, type TileHit,
} from './plan';
export { addToTabs, appendTile, dock, insertTile, moveTab, removeTile, resizeSplit, setActiveTab, swapTiles } from './tileEdits';
export { normalize } from './tileRepair';
export {
  canCollapse, canCollapseAlone, canExpandAlone, collapsedIndices, collapseSlotAlone, expandSlotAlone, setSlotCollapsed,
  shareHolders, viewShares, type CollapsePermission,
} from './tileCollapse';
export {
  canonicalize, dropZoneAt, findSlot, findTile, slotIds, slotKey, tileIds, DOCK_EDGE_SHARE, MIN_SHARE_RATIO,
  type CollapseEdge, type DockSide, type DropZone, type TileCollapse, type InsertionShares, type SlotLocation, type SplitDir, type TileLeaf, type TileLocation,
  type TileNode, type TilePath, type TileSlot, type TileSplit, type TileTabs,
} from './tileTree';
