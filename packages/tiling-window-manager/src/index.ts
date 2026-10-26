import './styles.css';

export { TilingWorkspace, DEFAULT_GAP_PX, DEFAULT_MIN_TILE_PX, type TileContext, type TilingWorkspaceProps } from './TilingWorkspace';
export type { Placing } from './PlacementLayer';
export { DOCK_THRESHOLD_PX, MOVE_ZONES } from './createDockGesture';
export {
  computeTileLayout, equalisedShares, minimumSize, resizedShares, RESIZE_KEY_STEPS, RESIZE_STEP_RATIO,
  type LayoutHandle, type LayoutRect, type ResizeSnap, type TileLayout, type TileLayoutOptions, type TileSize,
} from './layout';
export { planInsertion, planMove, planReflow, tileHitAt, TOO_SMALL, UNAVAILABLE, WOULD_RESIZE, type InsertionPlan, type PlacementMode, type TileHit } from './plan';
export {
  appendTile, canonicalize, dock, dropZoneAt, findTile, insertTile, normalize, removeTile, resizeSplit, swapTiles, tileIds,
  DOCK_EDGE_SHARE, MIN_SHARE_RATIO,
  type DockSide, type DropZone, type InsertionShares, type SplitDir, type TileLeaf, type TileNode, type TilePath, type TileSplit,
} from './tileTree';
