import type { LayoutRect } from './layout';

/** The tab group a tile belongs to, with the edits its strip needs. */
export interface TabGroup {
  ids: string[];
  active: number;
  select: (index: number) => void;
  /** Moves tab `id` to `toIndex`; the same tab stays active. */
  move: (id: string, toIndex: number) => void;
  /** Continues a pointer drag of tab `id` as a dock drag, from `event`. */
  drag: (id: string, event: PointerEvent) => void;
}

export interface TileContext {
  id: string;
  /** The tile's box in workspace pixels. */
  rect: () => LayoutRect;
  /** Bind to the tile's grip (`onPointerDown`): dragging docks it beside another tile or swaps with it. */
  startMove: (event: PointerEvent) => void;
  remove: () => void;
  /** True while this tile is being dragged. */
  dragging: () => boolean;
  /** False while another tab of this tile's group is showing. */
  visible: () => boolean;
  /** The tile's tab group, or null when it has its own slot. */
  tabs: () => TabGroup | null;
}
