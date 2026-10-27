import type { LayoutRect } from './layout';
import type { CollapsePermission } from './tileCollapse';
import type { CollapseEdge } from './tileTree';

/** Collapse actions for a tile's slot. They do nothing while the workspace's `collapse` prop is off. */
export interface CollapseControls {
  /** The edge the slot is collapsed toward, or null when open. */
  edge: () => CollapseEdge | null;
  /** Where a collapsed slot's content would open from, and how far it may reach; null when open. */
  peek: () => { edge: CollapseEdge; extentPx: number } | null;
  /** Collapses toward `edge`, or reopens with `null`. */
  set: (edge: CollapseEdge | null) => void;
  can: (edge: CollapseEdge) => CollapsePermission;
  /** Opens this slot and rolls its siblings toward it. */
  expandAlone: () => void;
  canExpandAlone: () => CollapsePermission;
  /** Opens its siblings and collapses this slot. */
  collapseAlone: () => void;
  canCollapseAlone: () => CollapsePermission;
}

/** The tab group a tile belongs to, with the edits its strip needs. */
export interface TabGroup {
  ids: string[];
  active: number;
  select: (index: number) => void;
  /** Moves tab `id` to `toIndex`; the same tab stays active. */
  move: (id: string, toIndex: number) => void;
  /** Continues a pointer drag of tab `id` as a dock drag, from `event`. */
  drag: (id: string, event: MouseEvent) => void;
}

export interface TileContext {
  id: string;
  /** The tile's box in workspace pixels. */
  rect: () => LayoutRect;
  /** Bind to the tile's grip (`onPointerDown` or `onMouseDown`): dragging docks it beside another tile or swaps with it. */
  startMove: (event: MouseEvent) => void;
  remove: () => void;
  /** True while this tile is being dragged. */
  dragging: () => boolean;
  /** False while another tab of this tile's group is showing. */
  visible: () => boolean;
  /** The tile's tab group, or null when it has its own slot. */
  tabs: () => TabGroup | null;
  collapse: CollapseControls;
}
