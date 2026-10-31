import type { Accessor } from 'solid-js';
import type { Align } from './core/anchor';

export interface VirtualLogOptions<R> {
  /** Chronological: oldest first. */
  rows: Accessor<readonly R[]>;
  /** Stable per row; default `row.key`. */
  getKey?: (row: R) => string;
  /** Height guess before a row is measured. */
  estimateSize: number | ((row: R) => number);
  /** Pixels drawn beyond each viewport edge; default one viewport. */
  overscanPx?: number;
  /** Rows drawn beyond `overscanPx`; default 4. */
  overscan?: number;
  /** Space under the newest row, kept visible when scrolling to it. */
  endPadding?: number | Accessor<number>;
  /** The view follows the newest row: it stays on it as rows arrive or grow. */
  following?: Accessor<boolean>;
  /** Older rows exist beyond the oldest loaded: reserves a runway above it. Unset, no runway. */
  hasOlder?: Accessor<boolean>;
  /** Prepends older rows. */
  loadOlder?: () => Promise<unknown>;
  /** Load older rows when the top edge is within this many rows of the oldest, or two viewports; default 10. */
  olderThreshold?: number;
  /** Newer rows exist beyond the newest loaded (a log opened around an older row). */
  hasNewer?: Accessor<boolean>;
  /** Appends newer rows; called as the bottom edge nears the newest loaded row, as loadOlder is at the top. */
  loadNewer?: () => Promise<unknown>;
  /** Blank space above the oldest row while `hasOlder` (and below the newest while `hasNewer`), so a fling isn't stopped
   * at the loaded edge while more loads; default 3 viewports. */
  runwayPx?: number;
  /** Changing it (density, font size) marks every measurement stale. */
  layoutKey?: Accessor<unknown>;
}

export interface VirtualLogController<R> {
  /** Ref for the scroll container. Sets its structural styles (column-reverse, no native anchoring). */
  ref: (el: HTMLElement) => void;
  rows: Accessor<readonly R[]>;
  rowByKey: (key: string) => R | undefined;
  /** Every row's key, oldest first. */
  allKeys: Accessor<string[]>;
  /** Keys of the drawn rows, oldest first. */
  keys: Accessor<string[]>;
  /** A row's distance from the canvas bottom to its bottom edge. */
  startOf: (key: string) => number;
  /** The canvas height. Changes only while the scroller is at rest. */
  extent: Accessor<number>;
  /** Corrections taken while scrolling, shown by translating the rows; moved into the scroll offset at rest. */
  shift: Accessor<number>;
  /** Pixels from the view's bottom edge to the newest row's end. */
  distanceFromBottom: () => number;
  /** Pixels from the view's top edge to the top; positive while older rows remain or a runway is still drawn. */
  distanceFromTop: () => number;
  /** How far the user's last scroll moved the view up (positive) or down; 0 for the log's own writes. */
  lastScrollDelta: () => number;
  /** The newest row wholly or mostly in view. */
  inViewKey: () => string | null;
  /** A row's bottom edge above the view's bottom edge, in pixels (negative: below it); null for an unknown key. holdRow's `{ bottom }` restores it. */
  bottomOf: (key: string) => number | null;
  /** Brings a row into view; false when no row has the key. */
  scrollToKey: (key: string, opts?: { align?: Align }) => boolean;
  /** Keeps a row centered (or at `align`) as rows are measured, until the user scrolls. Null lets go. */
  holdRow: (key: string | null, align?: Align) => boolean;
  holding: Accessor<boolean>;
  scrollToBottom: () => void;
  /** The user or a scroll animation is moving the view. */
  isScrolling: () => boolean;
  /** Loads older rows if the top is near; coalesced. */
  checkOlder: () => Promise<void>;
  /** Loads newer rows if the bottom is near and `hasNewer()`; coalesced. */
  checkNewer: () => Promise<void>;
  /** @internal VirtualLog's canvas. */
  attachCanvas: (el: HTMLElement) => void;
  /** @internal VirtualLog's rows. */
  observeRow: (el: HTMLElement, key: string) => void;
  /** @internal */
  unobserveRow: (el: HTMLElement) => void;
}

