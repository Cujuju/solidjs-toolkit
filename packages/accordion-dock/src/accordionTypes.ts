import type { Accessor, JSX } from 'solid-js';
/**
 * Everything here is token-driven (--acc-*), which let the promotion out of
 * playground/src/mock/ be a file move rather than a rewrite.
 */

/** Which axis the panels open along. */
export type AccordionOrientation =
  /** Headers stack top-to-bottom; opening a panel grows it DOWNWARD. Classic accordion. */
  | 'vertical'
  /** Collapsed panels live as buttons in a RAIL; opening one grows a column out from it.
   *  Columns sit in open order, not declaration order. */
  | 'horizontal';

/**
 * How the dock's CHROME is drawn. Purely visual, and orthogonal to everything
 * else: open/pin/reorder/sizing behave identically under both.
 */
export type AccordionAppearance =
  /** ONE frame around the whole dock, panels divided by hairline separators. The
   *  default, and the only appearance that existed before this prop. */
  | 'flush'
  /** Each panel is its OWN card — border, radius, surface — separated from its
   *  siblings by a gap, with the group drawing no frame of its own. */
  | 'cards';

/** Which edge the rail is docked against (`horizontal` only). See DESIGN_NOTES.md § src/context.ts:31. */
export type AccordionRailSide = 'left' | 'right';

/** How open panels consume space along the growth axis. */
export type AccordionMode =
  /** Group has a fixed extent; collapsed panels shrink to their header/rail button and
   *  open panels split the leftover space. This is the Visual Studio dock behaviour. */
  | 'fill'
  /** Each open panel is as big as its content; the group (or its container) scrolls. */
  | 'natural';

/** Where a newly-opened panel lands. See DESIGN_NOTES.md § src/context.ts:50. */
export type AccordionOpenPlacement =
  /** The panel appears in its rail slot. Opening never reorders anything, so the rail
   *  is stable and a column's position is always predictable from its button's. */
  | 'in-order'
  /** The panel moves to the END of the order, so the newest column is outermost. The rail
   *  button moves too — unavoidable, given a single sequence. */
  | 'append';

/** What opening one panel does to its siblings. */
export type AccordionPolicy =
  /** True accordion — opening a panel auto-collapses its unpinned siblings. */
  | 'single'
  /** Independent disclosures — opening one leaves the rest alone. Pins still work
   *  (they exempt a panel from `collapseAll`). */
  | 'multi';

/**
 * Severity of a panel's state dot. Named rather than a free colour, so a consumer cannot
 * invent a seventh amber; `accent` exists for genuine branding.
 */
export type PanelBadge = 'info' | 'success' | 'warning' | 'danger';

/** A panel's chrome, registered as ACCESSORS rather than values: the GROUP renders the rail button, and a snapshot would freeze a count that ticks. See DESIGN_NOTES.md § src/context.ts:83. */
export interface PanelMeta {
  id: string;
  title: Accessor<string | JSX.Element>;
  /** Short label for the rail button, when the full title is too long rotated. */
  railLabel: Accessor<string | JSX.Element | undefined>;
  count: Accessor<number | undefined>;
  /**
   * A state DOT, distinct from `count`. A count says "how many", a badge says "something
   * needs you" — which has no number and often coexists with a count of zero.
   */
  badge: Accessor<PanelBadge | undefined>;
  icon: Accessor<JSX.Element | undefined>;
  /** Native tooltip for the rail button / header. */
  tooltip: Accessor<string | undefined>;
  /** Per-panel accent override — recolours the rail marker, the pin and the focus
   *  ring for this panel only. Any CSS colour. */
  accent: Accessor<string | undefined>;
  pinnable: Accessor<boolean>;
  /** Show a close (×) affordance on the panel's own title bar. */
  closable: Accessor<boolean>;
  /** Floor for interactive resize, px. */
  minSize: Accessor<number | undefined>;
  /** This panel absorbs the group's leftover extent in `fill` mode — see
   *  `AccordionPanelProps.grow` and `columnFlex`. */
  grow: Accessor<boolean>;
  /** Extra class for this panel's rail button. */
  railClass: Accessor<string | undefined>;
  /** The id of this panel's CONTENT element. See DESIGN_NOTES.md § src/context.ts:122. */
  contentId: string;
  /**
   * A LEAF is a terminal detail pane with no activator: no rail button, not reorderable, and
   * exempt from `single`-policy auto-collapse. It is what makes the dock a Miller browser.
   */
  isLeaf: boolean;
  /**
   * How the group ASKS a leaf to close. A leaf is CONTROLLED, so editing the open list would
   * leave it painting. See DESIGN_NOTES.md § src/context.ts:139.
   */
  requestClose?: () => void;
}

/** The complete user-owned arrangement of a group, plain and serialisable. See DESIGN_NOTES.md § src/context.ts:157. */
export interface AccordionLayout {
  version: number;
  /** Which panels are open. Membership; sequence lives in `order`. */
  open: string[];
  pinned: string[];
  order: string[];
  /** Explicit px sizes, by panel id. Absent id = automatic sizing. */
  sizes: Record<string, number>;
}

/** Bumped when `AccordionLayout`'s shape changes incompatibly. A stored layout with a
 *  different version is IGNORED rather than half-applied. */
export const ACCORDION_LAYOUT_VERSION = 1;
