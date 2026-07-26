import { createContext, onCleanup, useContext, type Accessor, type JSX } from 'solid-js';

/**
 * Everything here is deliberately token-driven (--acc-*), which is what let the
 * promotion out of playground/src/mock/ into this package (2026-07-26) be a file
 * move rather than a rewrite: nothing in the control hard-codes a colour or a
 * metric a consumer might need to restate.
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
   * The id of this panel's CONTENT element.
   *
   * Published because the element that must reference it — the rail button — is
   * rendered by the GROUP, not by the panel, and `aria-controls` has to name a real
   * id. Without it the rail was a `role="tablist"` of `role="tab"` buttons that
   * controlled nothing, which is a shape assistive technology cannot navigate: the
   * relationship between a tab and its panel IS the pattern.
   */
  contentId: string;
  /**
   * A LEAF is a terminal detail pane with no activator of its own: no rail button,
   * no header to click, not reorderable, and exempt from `single`-policy
   * auto-collapse. It is what turns the dock into a Miller-column browser — folder,
   * folder, folder, then the file's detail view pinned to the end.
   */
  isLeaf: boolean;
  /**
   * How the group ASKS a leaf to close. Present on leaves, absent on panels.
   *
   * A leaf is CONTROLLED: its visibility is `props.open` on `<AccordionLeaf>`,
   * mirrored into the group by an effect that only re-runs when that prop changes.
   * So the group cannot close one by editing its own open list — the leaf would go
   * on painting while the group believed it closed, leaving a pane on screen with a
   * broken flex `order` and a splitter that no longer finds its neighbour.
   *
   * That hazard used to be prevented by COMMENTS at the two callsites that knew
   * about it (the breadcrumb's truncation skipped leaves explicitly), which is the
   * shape of bug this codebase keeps finding: a rule enforced by remembering.
   * `setOpen(leafId, false)` now routes here instead, so the desync is not
   * something a caller can cause.
   */
  requestClose?: () => void;
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
  /**
   * Open or close a panel.
   *
   * For a LEAF this is a REQUEST, not a command: closing one calls its
   * `requestClose` so the consumer that owns its `open` prop can react, and the
   * group's own state follows from that. See `PanelMeta.requestClose`.
   */
  setOpen: (id: string, open: boolean) => void;
  /**
   * The leaf's own mirror of its effective open state — `<AccordionLeaf>` ONLY.
   *
   * Separate from `setOpen` because the two directions are genuinely different:
   * everyone else ASKS a leaf to close, while the leaf itself REPORTS what it has
   * decided. Routing the report through `setOpen` would send it straight back to
   * `requestClose` and the leaf would never actually leave the open list.
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
  /** Move that same boundary by keyboard. `steps` is signed like pointer movement;
   *  `coarse` is the Shift-held step. Shares the drag's clamping arithmetic, so the
   *  two paths cannot disagree about a panel's minimum. */
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
   * The focusable element for a panel: the vertical header in `vertical`, the rail
   * button in `horizontal`. Whichever one renders claims the slot, keyed by panel
   * id.
   *
   * ALWAYS fill it through `slotRef`, never with a bare `ref={(el) => …}` — see
   * `slotRef` for the two defects that shortcut produced.
   */
  activators: ElementSlot;
  /**
   * The `⋯` overflow trigger, which STANDS IN for every rail button that did not
   * fit. Filled by `RailOverflowMenu`.
   *
   * The group needs it as an element rather than a boolean because it is the anchor
   * and the focus target for panels whose own button is not rendered — see
   * `activatorElOf`. Keyed like the others so it can share `slotRef`; there is only
   * ever one, under `RAIL_OVERFLOW_SLOT_KEY`.
   */
  railOverflowSlot: ElementSlot;
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
  /**
   * The element that currently REPRESENTS this panel in the chrome, reactively.
   *
   * Normally the panel's own activator: the vertical header, or the rail button.
   * When the rail overflowed and this panel's button was collapsed into the `⋯`
   * menu, it is that TRIGGER instead — because the trigger is where the panel now
   * lives as far as the user is concerned, and it is the only element on screen a
   * flyout can sensibly emerge from or focus can sensibly return to.
   *
   * Every consumer wants that fallback, which is why it is resolved here rather
   * than at each callsite: an anchored flyout, `moveFocus`, and the focus-restore
   * on dismiss would each otherwise have to know about rail overflow.
   *
   * Reactive because a flyout resolves it during render, before the ref has fired,
   * and because overflow re-partitions the rail as the dock is resized.
   *
   * Returns `undefined` only when the panel has no on-screen representation at all
   * (unregistered, or a leaf — leaves have no activator by definition).
   */
  activatorElOf: (id: string) => HTMLElement | undefined;
  /** The group's density, exposed so a PORTALLED surface (a flyout leaves
   *  `.acc-group` and stops inheriting its token overrides) can restate it. */
  density: Accessor<'comfortable' | 'compact'>;
  /**
   * The panel's outer element — measured when seeding a resize.
   *
   * A slot for the same reason the others are: these were registered with a bare
   * `ref` and NEVER cleared, so every panel that unmounted left a detached node
   * behind. `resize` measures through this map, and a detached node's rect is all
   * zeros — so a stale entry does not fail, it silently seeds a panel's extent as 0.
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
 * A place the dock keeps element references, keyed.
 *
 * Two methods rather than one `set(key, el | null)`, and the second one takes the
 * ELEMENT — which is the whole point. See `slotRef` for what a clear that cannot
 * identify what it is clearing does.
 */
export interface ElementSlot<T extends HTMLElement = HTMLElement> {
  set: (key: string, el: T) => void;
  /** Forget `key`, but ONLY if `el` is still what is stored there. */
  clear: (key: string, el: T) => void;
}

/**
 * A `ref` callback that fills a slot and empties it on unmount.
 *
 * TWO DEFECTS THIS EXISTS TO REMOVE, both invisible to tsc and to any test that
 * does not look at the DOM afterwards.
 *
 * 1. NOTHING EVER CLEARED. Solid invokes `ref={(el) => …}` exactly once, when the
 *    element is created; there is no second call on unmount. So the obvious
 *    spelling registers an element and then keeps it FOREVER, including after it
 *    has left the document. A detached node reports a zero-size rect at the origin
 *    and swallows `.focus()` — so a flyout anchored to one opened in the corner of
 *    the viewport, `moveFocus` moved focus nowhere, and `resize` seeded a panel's
 *    extent as 0.
 *
 * 2. A CLEAR THAT COULD NOT IDENTIFY ITSELF. Fixing (1) with `clear(key)` produced
 *    a second, quieter bug: when one element replaces another for the same key, the
 *    OUTGOING element's cleanup can run after the incoming one has registered, and
 *    an unconditional clear then deletes the live element.
 *
 *    That is not hypothetical — it is what a vertical→horizontal orientation swap
 *    did. The rail button mounts and registers, the vertical header unmounts and
 *    clears, and the panel is left with no activator at all: `activatorElOf`
 *    returned undefined, so the flyout had no anchor and the keyboard had no
 *    target. (The opposite direction happened to interleave the other way and
 *    worked, which is how it stayed hidden.)
 *
 * Passing the element to `clear` makes the guard something the slot performs rather
 * than something each caller remembers.
 */
export function slotRef<T extends HTMLElement>(
  slot: ElementSlot<T>,
  key: string,
): (el: T) => void {
  return (el) => {
    slot.set(key, el);
    onCleanup(() => {
      /*
       * A throwing cleanup is not a local failure. Solid unwinds an owner tree by
       * walking its cleanups, and an exception in ONE of them abandons the walk —
       * every cleanup that had not run yet is skipped, silently.
       *
       * That is not hypothetical either: an earlier version of this helper read an
       * id off a `<Show>`-provided prop during teardown, threw a TypeError, and the
       * abandoned cleanups included the tear-off controller's. The visible result
       * was that navigating away from the dock left its popped-out OS WINDOWS open,
       * orphaned, with no opener to close them — a leak two layers from the line
       * that threw, reported as nothing at all.
       *
       * The root fix is that a slot's `clear` must not read reactive state (it is
       * handed everything it needs). This is the guard that keeps a future
       * violation local instead of taking down every other cleanup in the tree.
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

/** The single key `railOverflowSlot` is stored under — it holds one element, but
 *  wears the keyed shape so it can use `slotRef` like everything else. */
export const RAIL_OVERFLOW_SLOT_KEY = 'rail-overflow';

export const AccordionGroupContext = createContext<AccordionGroupApi>();

export function useAccordionGroup(): AccordionGroupApi {
  const ctx = useContext(AccordionGroupContext);
  if (ctx === undefined) {
    throw new Error('<AccordionPanel> must be rendered inside an <AccordionGroup>.');
  }
  return ctx;
}
