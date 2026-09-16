import { createContext, onCleanup, useContext, type Accessor, type JSX } from 'solid-js';

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

/**
 * Which edge the rail is docked against (`horizontal` only). The rail is the ANCHOR:
 * columns always grow AWAY from it, so a panel emerges from its own button either way.
 */
export type AccordionRailSide = 'left' | 'right';

/** How open panels consume space along the growth axis. */
export type AccordionMode =
  /** Group has a fixed extent; collapsed panels shrink to their header/rail button and
   *  open panels split the leftover space. This is the Visual Studio dock behaviour. */
  | 'fill'
  /** Each open panel is as big as its content; the group (or its container) scrolls. */
  | 'natural';

/**
 * Where a newly-opened panel lands. There is exactly ONE order, read twice — by the rail and
 * by the columns.
 */
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

/**
 * A panel's chrome, registered as ACCESSORS rather than values: the GROUP renders the rail
 * button, and a snapshot would freeze a count that ticks.
 */
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
  /**
   * The id of this panel's CONTENT element. Published because the rail button that must
   * reference it is rendered by the GROUP, and `aria-controls` has to name a real id.
   */
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

/**
 * The complete user-owned arrangement of a group, plain and serialisable. The SAME shape the
 * group persists, so a saved workspace and a session have one migration story.
 */
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

/**
 * The two listeners hover-to-open attaches to an activator. Spelled out rather than typed as
 * an attribute bag, whose `ref` would have to match at every spread site.
 */
export interface ActivatorHoverProps {
  onPointerEnter?: (e: PointerEvent) => void;
  onPointerLeave?: () => void;
}

export interface AccordionGroupApi {
  orientation: Accessor<AccordionOrientation>;
  railSide: Accessor<AccordionRailSide>;
  mode: Accessor<AccordionMode>;
  policy: Accessor<AccordionPolicy>;
  reorderable: Accessor<boolean>;
  resizable: Accessor<boolean>;
  /** Nesting depth of this group. 0 = outermost. Drives header indent. */
  depth: number;

  /** Which panels are open. Membership only — for the on-screen SEQUENCE use `order`, the
   *  single source of truth for both the rail and the columns. */
  openOrder: Accessor<readonly string[]>;
  /** THE order: every registered panel id, rail order and column order at once. Leaves are
   *  excluded, being terminal by definition. */
  order: Accessor<readonly string[]>;
  /** Open panels in painted sequence — `order` filtered to open, leaves appended. */
  visualOpenIds: Accessor<readonly string[]>;
  /**
   * Does any OPEN member declare `grow`? Read by every member, because a declaration retires
   * the trailing-member default for the whole group. Scoped to OPEN members.
   */
  hasDeclaredGrower: Accessor<boolean>;
  /** Registered panels (leaves excluded), already sorted into `order`. */
  panels: Accessor<readonly PanelMeta[]>;
  /** Registered leaves, in registration order. */
  leaves: Accessor<readonly PanelMeta[]>;
  meta: (id: string) => PanelMeta | undefined;

  isOpen: (id: string) => boolean;
  isPinned: (id: string) => boolean;
  /** Position of `id` among the open panels, or -1. Drives the flex `order` that
   *  puts columns in open-order without reordering the DOM. */
  openIndex: (id: string) => number;

  // ── Rail-as-divider (see `visualOrder.ts` for the state model) ─────────────
  /** Is the rail acting as the static/dynamic boundary? */
  railDivider: Accessor<boolean>;
  /** Flex `order` for one open panel — static columns before the rail, the rest
   *  after it. */
  columnOrder: (id: string) => number;
  /** Flex `order` for the rail itself. */
  railOrder: Accessor<number>;
  /** Is this column against a boundary (group edge or rail), so it drops its own
   *  separator rather than doubling one that is already drawn? */
  isEdgeColumn: (id: string) => boolean;
  /** Is this an open pinned column, i.e. in the static region? */
  isStaticColumn: (id: string) => boolean;
  /** Is this the LAST static column — the one whose trailing edge is the rail? Its splitter
   *  is suppressed: the rail is a boundary, not a resizer. */
  isRailBoundary: (id: string) => boolean;
  /** Shown whenever the panel is closed; hidden only when open AND pinned. */
  showsRailButton: (id: string) => boolean;
  /** Collapse to a rail button, KEEPING the pin (the column title bar). */
  collapseKeepPin: (id: string) => void;
  /** Close and DROP the pin (the column ×). */
  closeAndUnpin: (id: string) => void;
  /** The next OPEN panel after `id` in visual sequence. This is what a splitter dragged on
   *  `id`'s trailing edge resizes against. */
  neighborOpenId: (id: string) => string | undefined;

  toggle: (id: string) => void;
  /**
   * Open or close a panel. For a LEAF this is a REQUEST: it calls `requestClose`, so the
   * consumer that owns the `open` prop reacts and the group's state follows.
   */
  setOpen: (id: string, open: boolean) => void;
  /**
   * The leaf's own mirror of its open state — `<AccordionLeaf>` ONLY. Routing this through
   * `setOpen` would send it back to `requestClose` and the leaf would never leave the list.
   */
  setLeafOpen: (id: string, open: boolean) => void;
  togglePin: (id: string) => void;

  /** Every panel opens. In `single` policy this is intentionally a no-op —
   *  see AccordionGroup for why that is not a policy escape hatch. */
  expandAll: () => void;
  /** Every UNPINNED panel closes. Pinned panels are exactly the ones this spares —
   *  that is what the pin is for. */
  collapseAll: () => void;

  /** Move a panel to an absolute index in the user order. */
  moveTo: (id: string, toIndex: number) => void;
  /** Move a panel by a relative offset — the keyboard path for reordering, so drag
   *  is never the ONLY way to do it. */
  moveBy: (id: string, delta: number) => void;

  /** Explicit size in px along the growth axis, once the user has dragged a splitter.
   *  Undefined means "still following the mode's automatic sizing". */
  sizeOf: (id: string) => number | undefined;
  setSize: (id: string, px: number) => void;
  /** Drop every explicit size and hand sizing back to the mode. */
  resetSizes: () => void;
  /** Begin a splitter drag on `id`'s trailing edge. */
  beginResize: (id: string, e: PointerEvent) => void;
  /** Move that boundary by keyboard. Shares the drag's clamping arithmetic, so the two paths
   *  cannot disagree about a panel's minimum. */
  nudgeResize: (id: string, steps: number, coarse: boolean) => void;
  /** The resizable panel's current extent and travel limits, for the separator's
   *  `aria-value*`. Undefined when `id` has no neighbour to resize against. */
  resizeBoundsOf: (id: string) => { value: number; min: number; max: number } | undefined;
  /** True while a splitter drag is live — used to suppress transitions/selection. */
  resizing: Accessor<boolean>;
  /** Panel that will collapse to the rail if the splitter is released now. */
  collapseCandidate: Accessor<string | null>;

  /** Snapshot the current arrangement — for named workspaces, server-side sync, or
   *  an undo stack. Pure data; safe to JSON.stringify. */
  getLayout: () => AccordionLayout;
  /** Restore a snapshot. A layout whose `version` does not match is ignored and
   *  reported false, rather than being partially applied. */
  setLayout: (layout: AccordionLayout) => boolean;

  /** Panels self-register so the group can apply `defaultOpen` in declaration order,
   *  render the rail in `horizontal`, and drive roving keyboard focus. */
  register: (meta: PanelMeta, defaultOpen: boolean) => void;
  unregister: (id: string) => void;
  /**
   * The focusable element for a panel: the vertical header, or the rail button. ALWAYS fill
   * it through `slotRef` — see there for the two defects a bare `ref` produced.
   */
  activators: ElementSlot;
  /**
   * The `⋯` overflow trigger, which STANDS IN for every rail button that did not fit. Needed
   * as an element: it is the anchor and focus target for those panels.
   */
  railOverflowSlot: ElementSlot;
  /** Panels currently rendering into their own window. */
  tornOff: Accessor<readonly string[]>;
  isTornOff: (id: string) => boolean;
  /** Pop a panel into its own window. MUST be called synchronously from the user gesture, which
   *  `window.open` needs. Returns the outcome rather than throwing. */
  tearOff: (id: string) => { ok: boolean; reason?: string };
  /** Bring a panel home and close its window. */
  dock: (id: string) => void;
  /** Where a torn-off panel's content should mount, or undefined when it is in
   *  this document. */
  tearOffMountFor: (id: string) => HTMLElement | undefined;
  /** True when the panel is currently an auto-hide OVERLAY rather than a docked
   *  column. Its column collapses to nothing while this holds. */
  isFlyout: (id: string) => boolean;
  /** Where a flying-out panel's content should mount, or undefined when it belongs
   *  inline in its own column. */
  flyoutMountFor: (id: string) => HTMLElement | undefined;
  /**
   * Hover-intent listeners for a panel's ACTIVATOR. Reached through the group because WHO
   * renders the activator differs by orientation; the listeners are the same either way.
   */
  activatorHoverProps: (id: string) => ActivatorHoverProps;
  /**
   * The element that currently REPRESENTS this panel, reactively: its activator, or the `⋯`
   * trigger once the rail collapsed its button. See DESIGN_NOTES.md § src/context.ts:373.
   */
  activatorElOf: (id: string) => HTMLElement | undefined;
  /** The group's density, exposed so a PORTALLED surface (a flyout leaves
   *  `.acc-group` and stops inheriting its token overrides) can restate it. */
  density: Accessor<'comfortable' | 'compact'>;
  /**
   * The panel's outer element, measured when seeding a resize. A slot because these were
   * registered with a bare `ref` and never cleared, and a detached node's rect is all zeros.
   */
  panelElements: ElementSlot;
  /** Move DOM focus to another header/rail button in THIS group. `delta` is ±1, or an edge. */
  moveFocus: (fromId: string, delta: 1 | -1 | 'first' | 'last') => void;

  /** Drag-reorder plumbing, spread onto whichever element is the panel's activator. */
  reorderItemProps: (id: string) => Record<string, unknown>;
  /** Drag-reorder plumbing for the COLUMN itself (its title bar), horizontal only.
   *  Lands in the same `order`, so dragging a column moves its rail button too. */
  reorderColumnProps: (id: string) => Record<string, unknown>;
  reorderActiveId: Accessor<string | null>;
}

/**
 * A place the dock keeps element references, keyed. Two methods rather than one setter, and
 * `clear` takes the ELEMENT — see `slotRef` for why that identity guard matters.
 */
export interface ElementSlot<T extends HTMLElement = HTMLElement> {
  set: (key: string, el: T) => void;
  /** Forget `key`, but ONLY if `el` is still what is stored there. */
  clear: (key: string, el: T) => void;
}

/**
 * A `ref` callback that fills a slot and empties it on unmount. An unguarded clear deletes the
 * LIVE replacement. See DESIGN_NOTES.md § src/context.ts:429.
 */
export function slotRef<T extends HTMLElement>(
  slot: ElementSlot<T>,
  key: string,
): (el: T) => void {
  return (el) => {
    slot.set(key, el);
    onCleanup(() => {
      /*
                   * A throwing cleanup is not local: one exception abandons the whole walk. That once
                   * orphaned popped-out windows. See DESIGN_NOTES.md § src/context.ts:465.
                   */
      try {
        slot.clear(key, el);
      } catch (err) {
        // eslint-disable-next-line no-console -- silence here would trade a visible
        // error for an invisible resource leak elsewhere.
        console.error(
          '[accordion-dock] an element slot\'s clear() threw during teardown. The rest ' +
            'of the teardown continued. clear() must not read reactive state — it is ' +
            'given the key and the element precisely so it does not have to.',
          err,
        );
      }
    });
  };
}

/** An `ElementSlot` over a plain `Map`, for references nothing renders from. */
export function createMapSlot<T extends HTMLElement>(map: Map<string, T>): ElementSlot<T> {
  return {
    set: (key, el) => {
      map.set(key, el);
    },
    clear: (key, el) => {
      // The identity guard from `slotRef`, in the one place a Map-backed slot needs
      // it. A bare `map.delete(key)` is the defect described there.
      if (map.get(key) === el) map.delete(key);
    },
  };
}

/** The single key `railOverflowSlot` is stored under — it holds one element, but wears the
 *  keyed shape so it can use `slotRef`. */
export const RAIL_OVERFLOW_SLOT_KEY = 'rail-overflow';

export const AccordionGroupContext = createContext<AccordionGroupApi>();

export function useAccordionGroup(): AccordionGroupApi {
  const ctx = useContext(AccordionGroupContext);
  if (ctx === undefined) {
    throw new Error('<AccordionPanel> must be rendered inside an <AccordionGroup>.');
  }
  return ctx;
}
