import { createContext, useContext, type Accessor, type JSX } from 'solid-js';

/**
 * MOCK — not a published package yet. Lives under playground/src/mock/ on purpose:
 * this is the design surface we iterate on before promoting it to
 * packages/accordion. Everything here is deliberately token-driven (--acc-*) so
 * the promotion is a file move, not a rewrite.
 */

/** Which axis the panels open along. */
export type AccordionOrientation =
  /** Headers stack top-to-bottom; opening a panel grows it DOWNWARD. Classic accordion. */
  | 'vertical'
  /** Collapsed panels live as buttons in a RAIL; opening one grows a column out from
   *  the rail. Columns sit in the order they were opened, not declaration order —
   *  VS Code's activity bar crossed with Visual Studio's auto-hide tab strip. */
  | 'horizontal';

/**
 * Which edge the rail is docked against (`horizontal` orientation only).
 *
 * The rail is the ANCHOR: columns always grow AWAY from it, in open order. Rail on
 * the left → the first-opened column sits against the rail and later ones extend
 * rightward. Rail on the right → the same thing mirrored, so columns read
 * right-to-left. A panel visually emerges from its own button either way, which is
 * the whole point of docking the rail to an edge rather than floating it.
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
 * Where a newly-opened panel lands in the column sequence.
 *
 * There is exactly ONE order in this control — `AccordionGroupApi.order` — and both
 * the rail and the columns render from it. That is what makes reordering the rail
 * reorder the columns and vice versa: they are not two sequences kept in sync, they
 * are one sequence read twice. This prop only decides whether OPENING a panel also
 * moves it within that sequence.
 */
export type AccordionOpenPlacement =
  /** The panel appears in its rail slot. Opening never reorders anything, so the rail
   *  is stable and a column's position is always predictable from its button's. */
  | 'in-order'
  /** The panel moves to the END of the order, so the most recently opened column is
   *  always the outermost one. The cost is real and unavoidable given a single
   *  sequence: the rail button moves too. */
  | 'append';

/** What opening one panel does to its siblings. */
export type AccordionPolicy =
  /** True accordion — opening a panel auto-collapses its unpinned siblings. */
  | 'single'
  /** Independent disclosures — opening one leaves the rest alone. Pins still work
   *  (they exempt a panel from `collapseAll`). */
  | 'multi';

/**
 * Severity of a panel's state dot. Named rather than a free colour so a dock stays
 * visually coherent and a consumer cannot invent a seventh shade of amber; a
 * per-panel `accent` already exists for genuine branding.
 */
export type PanelBadge = 'info' | 'success' | 'warning' | 'danger';

/**
 * A panel's chrome, registered with the group as ACCESSORS rather than values.
 *
 * This matters: in `horizontal` orientation the GROUP renders the rail button for
 * each panel, so it needs the panel's title/count/icon — and a snapshot taken at
 * registration time would freeze them, so a count that ticks would never update on
 * the rail. Thunks keep every read reactive at the group's use site.
 */
export interface PanelMeta {
  id: string;
  title: Accessor<string | JSX.Element>;
  /** Short label for the rail button, when the full title is too long rotated. */
  railLabel: Accessor<string | JSX.Element | undefined>;
  count: Accessor<number | undefined>;
  /**
   * A state DOT, distinct from `count`.
   *
   * The two answer different questions and must not share a slot: a count says
   * "how many", a badge says "something here needs you" — unsaved edits, a failed
   * connection — which has no number and often coexists with a count of zero.
   * Collapsing them would force a consumer to fake a number to get attention.
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
  /** Extra class for this panel's rail button. */
  railClass: Accessor<string | undefined>;
  /**
   * A LEAF is a terminal detail pane with no activator of its own: no rail button,
   * no header to click, not reorderable, and exempt from `single`-policy
   * auto-collapse. It is what turns the dock into a Miller-column browser — folder,
   * folder, folder, then the file's detail view pinned to the end.
   */
  isLeaf: boolean;
}

/**
 * The complete user-owned arrangement of a group, as a plain serialisable object.
 *
 * This is the SAME shape the group persists to localStorage, deliberately: a saved
 * workspace and an auto-persisted session are the same data, so there is one
 * migration story rather than two. `version` exists so a consumer that stored a
 * layout server-side can be told, later, that the shape moved on.
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

/** Bumped when `AccordionLayout`'s shape changes incompatibly. A stored layout with
 *  a different version is IGNORED rather than half-applied — a partly-restored dock
 *  is harder to diagnose than one that obviously fell back to defaults. */
export const ACCORDION_LAYOUT_VERSION = 1;

export interface AccordionGroupApi {
  orientation: Accessor<AccordionOrientation>;
  railSide: Accessor<AccordionRailSide>;
  mode: Accessor<AccordionMode>;
  policy: Accessor<AccordionPolicy>;
  reorderable: Accessor<boolean>;
  resizable: Accessor<boolean>;
  /** Nesting depth of this group. 0 = outermost. Drives header indent. */
  depth: number;

  /** Which panels are open. Membership only — for the on-screen SEQUENCE use
   *  `order` (or `visualOpenIds`), which is the single source of truth for both the
   *  rail and the columns. */
  openOrder: Accessor<readonly string[]>;
  /** THE order: every registered panel id, rail order and column order at once. The
   *  user changes it by dragging either representation. Leaves are excluded — they
   *  are terminal by definition. */
  order: Accessor<readonly string[]>;
  /** Open panels in painted sequence — `order` filtered to open, leaves appended. */
  visualOpenIds: Accessor<readonly string[]>;
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
  /** The next OPEN panel after `id` in visual sequence, or undefined if `id` is last.
   *  This is the panel a splitter dragged on `id`'s trailing edge resizes against. */
  neighborOpenId: (id: string) => string | undefined;

  toggle: (id: string) => void;
  setOpen: (id: string, open: boolean) => void;
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
  /** The focusable element for a panel is the vertical header in `vertical` and the
   *  rail button in `horizontal`, so whichever one renders claims the ref. */
  setHeaderEl: (id: string, el: HTMLElement | null) => void;
  /** Panels currently rendering into their own window. */
  tornOff: Accessor<readonly string[]>;
  isTornOff: (id: string) => boolean;
  /** Pop a panel into its own window. MUST be called synchronously from the user
   *  gesture — window.open needs transient user activation, which an await or a
   *  timeout spends. Returns the outcome rather than throwing: a blocked popup is
   *  an ordinary result of the user's browser settings, not an exception. */
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
  /** The panel's activator element, reactively — an anchored flyout resolves this
   *  during render, before the ref has fired. */
  headerElOf: (id: string) => HTMLElement | undefined;
  /** The group's density, exposed so a PORTALLED surface (a flyout leaves
   *  `.acc-group` and stops inheriting its token overrides) can restate it. */
  density: Accessor<'comfortable' | 'compact'>;
  /** The panel's outer element — measured when seeding a resize. */
  setPanelEl: (id: string, el: HTMLElement | null) => void;
  /** Move DOM focus to another header/rail button in THIS group. `delta` is ±1, or an edge. */
  moveFocus: (fromId: string, delta: 1 | -1 | 'first' | 'last') => void;

  /** Drag-reorder plumbing, spread onto whichever element is the panel's activator. */
  reorderItemProps: (id: string) => Record<string, unknown>;
  /** Drag-reorder plumbing for the COLUMN itself (its title bar), horizontal only.
   *  Lands in the same `order`, so dragging a column moves its rail button too. */
  reorderColumnProps: (id: string) => Record<string, unknown>;
  reorderActiveId: Accessor<string | null>;
}

export const AccordionGroupContext = createContext<AccordionGroupApi>();

export function useAccordionGroup(): AccordionGroupApi {
  const ctx = useContext(AccordionGroupContext);
  if (ctx === undefined) {
    throw new Error('<AccordionPanel> must be rendered inside an <AccordionGroup>.');
  }
  return ctx;
}
