import './styles.css';

export { TilingWorkspace, DEFAULT_GAP_PX, DEFAULT_MIN_TILE_PX, type CollapseControls, type TabGroup, type TileContext, type TilingWorkspaceProps } from './TilingWorkspace.js';
export { TabStrip, type TabStripProps } from './TabStrip.js';
export { DockZoneGuides } from './DockZoneGuides.js';
export type { Placing } from './PlacementLayer.js';
export { ResizeReadout, percentTenths, type ReadoutSide } from './ResizeReadout.js';
export { DEFAULT_TAB_TARGET, DOCK_THRESHOLD_PX, MOVE_ZONES, TAB_TARGET_ATTR, type DragPhase } from './createDockGesture.js';
export * from './model.js';
