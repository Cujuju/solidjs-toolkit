import { createContext, useContext, type Accessor } from 'solid-js';
import type {
  AccordionLayout,
  AccordionMode,
  AccordionOrientation,
  AccordionPolicy,
  AccordionRailSide,
  PanelMeta,
} from './accordionTypes';
import type { ElementSlot } from './elementSlot';

/** The two listeners hover-to-open attaches to an activator. See DESIGN_NOTES.md § src/context.ts:180. */
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
  /** Does any OPEN member declare `grow`? See DESIGN_NOTES.md § src/context.ts:214. */
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
  /** Restore a snapshot; panels registering later then skip `defaultOpen`. A layout whose
   *  `version` does not match is ignored and reported false, rather than partially applied. */
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
  /** The `⋯` overflow trigger, which STANDS IN for every rail button that did not fit. See DESIGN_NOTES.md § src/context.ts:335. */
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
  /** The panel's outer element, measured when seeding a resize. See DESIGN_NOTES.md § src/context.ts:396. */
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

export const AccordionGroupContext = createContext<AccordionGroupApi>();

export function useAccordionGroup(): AccordionGroupApi {
  const ctx = useContext(AccordionGroupContext);
  if (ctx === undefined) {
    throw new Error('<AccordionPanel> must be rendered inside an <AccordionGroup>.');
  }
  return ctx;
}

export * from './accordionTypes';

export { createMapSlot, RAIL_OVERFLOW_SLOT_KEY, slotRef } from './elementSlot';
export type { ElementSlot } from './elementSlot';
