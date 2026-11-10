import './styles.css';

export { TilingWorkspace, DEFAULT_GAP_PX, DEFAULT_MIN_TILE_PX, type CollapseControls, type TabGroup, type TileContext, type TilingWorkspaceProps } from './TilingWorkspace.js';
export { TabStrip, type TabStripProps } from './TabStrip.js';
export { planTabFold, tabShowsName, FOLD_HYSTERESIS_PX, type TabFold, type TabFoldInput, type TabWidths } from './tabStripFold.js';
export type { Placing } from './PlacementLayer.js';
export { ResizeReadout, percentTenths, type ReadoutSide } from './ResizeReadout.js';
export { GUIDE_SNAP_PX, handleCentre, nearestGuide, resizeGuides, type AlignLayout, type ResizeGuide } from './resizeGuides.js';
export { DEFAULT_TAB_TARGET, DOCK_THRESHOLD_PX, MOVE_ZONES, TAB_TARGET_ATTR, type DragPhase } from './createDockGesture.js';
export {
  computeTileLayout, DEFAULT_COLLAPSED_PX, equalisedShares, minimumSize, resizedShares, slotRects, RESIZE_KEY_STEPS, RESIZE_STEP_RATIO,
  type LayoutHandle, type LayoutRect, type LayoutSlot, type ResizeSnap, type TileLayout, type TileLayoutOptions, type TileSize,
} from './layout.js';
export {
  planInsertion, planMove, planReflow, planTab, tileHitAt, TOO_SMALL, UNAVAILABLE, WOULD_RESIZE,
  type InsertionPlan, type PlacementMode, type TileHit,
} from './plan.js';
export { addToTabs, appendTile, dock, insertTile, moveTab, removeTile, resizeSplit, setActiveTab, swapTiles } from './tileEdits.js';
export { normalize } from './tileRepair.js';
export { pushedLayout, PUSH_KEY_STEP_PX, type PushedLayout, type PushTarget } from './push.js';
export {
  canCollapse, canCollapseAlone, canExpandAlone, collapsedIndices, collapseSlotAlone, expandSlotAlone, setSlotCollapsed,
  shareHolders, viewShares, type CollapsePermission,
} from './tileCollapse.js';
export {
  canonicalize, dropZoneAt, findSlot, findTile, slotIds, slotKey, tileIds, DOCK_EDGE_SHARE, MIN_SHARE_RATIO,
  type CollapseEdge, type DockSide, type DropZone, type TileCollapse, type InsertionShares, type SlotLocation, type SplitDir, type TileLeaf, type TileLocation,
  type TileNode, type TilePath, type TileSlot, type TileSplit, type TileTabs,
} from './tileTree.js';
