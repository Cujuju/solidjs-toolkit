import { For, Show, createMemo, createSignal, useContext, type JSX } from 'solid-js';
import {
  ACCORDION_LAYOUT_VERSION,
  AccordionGroupContext,
  type AccordionGroupApi,
  type AccordionLayout,
  type AccordionMode,
  type AccordionOpenPlacement,
  type AccordionOrientation,
  type AccordionPolicy,
  type AccordionRailSide,
  type ElementSlot,
  type PanelMeta,
  createMapSlot,
  slotRef,
  RAIL_OVERFLOW_SLOT_KEY,
} from './context';
import { Pin } from './icons';
import { createActivatorKeyDown } from './keys';
import { bindLeafChain, createLeafChain } from './leafChain';
import {
  orderVisualOpen,
  partitionAtRail,
  showsRailButton,
  survivesBulkClose,
} from './visualOrder';
import { createResize, DEFAULT_MIN_SIZE_PX } from './resize';
import { createPanelMenu } from './panelMenu';
import { createRailOverflow, RAIL_ITEM_ATTR } from './railOverflow';
import { RailOverflowMenu } from './RailOverflowMenu';
import { createRailPan } from './railPan';
import { createAutoHide, flyoutDataAttr, type AutoHideApi } from './autoHide';
import { createTearOff, type TearOffController } from './tearOff';
import { createReorderList } from './vendor/createReorderList';

export interface AccordionGroupProps {
  children: JSX.Element;

  /** See `AccordionOrientation`. Default `vertical`. */
  orientation?: AccordionOrientation;
  /** See `AccordionRailSide`. `horizontal` only; ignored otherwise. Default `left`. */
  railSide?: AccordionRailSide;
  /** See `AccordionMode`. Default `natural` — the non-surprising one. */
  mode?: AccordionMode;
  /** See `AccordionPolicy`. Default `single` — the accordion behaviour. */
  policy?: AccordionPolicy;
  /** See `AccordionOpenPlacement`. Default `in-order` — a stable rail. */
  openPlacement?: AccordionOpenPlacement;

  /** Drag a rail button (or a vertical header) to reorder the panels. Default true.
   *  Alt+Up/Alt+Down does the same thing from the keyboard, always. */
  reorderable?: boolean;
  /** Show splitters between adjacent open panels. Default true. */
  resizable?: boolean;

  /** Cap on simultaneously open panels. Opening past it evicts the least recently
   *  opened UNPINNED panel. Leaves and pinned panels never count as victims — see
   *  `evictForCap`. Omit for no cap. */
  maxOpen?: number;

  /**
   * Unpinned panels open as a transient OVERLAY anchored to their rail button
   * instead of a docked column; pinning promotes one to a real column. This is
   * what turns the pin from "exempt from auto-collapse" into "make this
   * permanent". `horizontal` only. Default false.
   */
  autoHide?: boolean;

  /**
   * The rail acts as the BOUNDARY between the pinned columns and everything
   * still dynamic: pinned columns paint before it (in pin order), it slides to
   * sit after them, and flyouts overlay from there on. A pinned column shows no
   * rail button while it is open — the column is the panel's presence — and the
   * rail collapses to zero width once nothing is left dynamic.
   *
   * Defaults to whatever `autoHide` is, because this is the layout `autoHide`
   * already implies rather than a second feature layered on it: auto-hide's whole
   * proposition is that pinning FREEZES a panel into permanence, and a frozen
   * panel that still sits downstream of the rail, still carrying a button that
   * re-reveals something already on screen, is only half of that metaphor. Set it
   * to `false` for a group that wants the rail welded to one edge.
   *
   * `horizontal` only, like `autoHide` itself.
   */
  railDivider?: boolean;
  /** With `autoHide`, also open a flyout on hover. Default false — hover is
   *  unavailable to keyboard and touch, so it is an accelerator, never the only
   *  way in. */
  hoverToOpen?: boolean;
  /**
   * What the rail does when its buttons do not fit.
   * `menu` collapses the overflow into a `⋯` menu; `pan` leaves them reachable by
   * dragging the rail. A 40px strip cannot carry a legible scrollbar, which is why
   * there is no third option.
   */
  railOverflow?: 'menu' | 'pan';

  /** Chrome scale. `compact` shrinks header/rail/padding tokens for dense docks.
   *  Surfaces as `data-density`; the whole implementation is CSS. */
  density?: 'comfortable' | 'compact';
  /** Animate columns/panels opening and closing. Surfaces as `data-animated`. */
  animated?: boolean;

  /** Persist open + pinned + order + sizes under this localStorage key. Ephemeral if
   *  omitted. NESTED groups need their OWN key — state is per-group, not per-tree. */
  storageKey?: string;

  /** Explicit group extent. Any CSS length.
   *  - vertical: the group's height (required for `fill` to mean anything).
   *  - horizontal: the group's height too — the rail and columns are full-height,
   *    and it is the WIDTH that `fill` divides. */
  height?: string;

  class?: string;
  ariaLabel?: string;

  /** Hands the group's API to the consumer so `collapseAll()` / `expandAll()` and the
   *  open set can be driven from OUTSIDE the group. `useAccordionGroup()` only works
   *  for descendants, and in `horizontal` orientation there is nowhere sensible to put
   *  a toolbar inside the group — it would land in the column strip. Named `apiRef`
   *  rather than `ref` so it cannot be mistaken for an element ref. */
  apiRef?: (api: AccordionGroupApi) => void;

  /** Fires on every effective open-state change, INCLUDING the auto-collapse of a
   *  sibling — a consumer that mirrors this state needs the collapses, not just
   *  the click it caused. */
  onChange?: (id: string, open: boolean) => void;
  onPinChange?: (id: string, pinned: boolean) => void;
  onOrderChange?: (order: readonly string[]) => void;
  onTearOff?: (id: string) => void;
  onDock?: (id: string) => void;
  /** A tear-off that could not happen — a blocked popup, most often. The dock has
   *  no opinion about how a host reports that, so it does not report it itself. */
  onTearOffError?: (id: string, reason: string) => void;
  onSizeChange?: (sizes: Readonly<Record<string, number>>) => void;
}

/**
 * What goes to localStorage. Deliberately `AccordionLayout` itself rather than a
 * parallel shape: a saved workspace and an auto-persisted session are the same
 * data, so there is one migration story instead of two — which is exactly what
 * `AccordionLayout`'s own doc comment already promised, and what the two paths
 * had quietly stopped agreeing on.
 */
type PersistedState = AccordionLayout;

/**
 * Drag activation is skipped when the pointerdown lands on something matching this.
 * The primitive's own default is `button, input, a, [role="button"]` — which would
 * disable dragging entirely here, because the rail ACTIVATOR IS a `<button>`. So the
 * skip is inverted: everything drags except controls explicitly opted out.
 */
const REORDER_SKIP_SELECTOR = '[data-no-drag]';

/** Shared empty array for the torn-off accessor before the controller exists.
 *  A fresh `[]` per call would be a new identity every read and defeat memo
 *  equality downstream. */
const EMPTY_IDS: readonly string[] = [];

/**
 * Read a persisted layout, or null.
 *
 * VERSION-GATED, exactly like `setLayout`. The two paths restore the same shape
 * into the same signals, and only one of them used to check that the shape was
 * the one it expected: `setLayout` refused a mismatched `version` outright — "a
 * half-restored dock is harder to diagnose than one that visibly fell back to
 * defaults" — while this function, which runs on EVERY page load, read whatever
 * was in storage field by field with no version check at all.
 *
 * So the guarded path was the rare one and the unguarded path was the constant
 * one. Bumping `ACCORDION_LAYOUT_VERSION` for a shape change would have protected
 * consumers who saved a workspace server-side and silently mis-restored everyone
 * who had simply used the dock before.
 *
 * A layout with no `version` at all is from before this gate existed, and is
 * rejected by the same comparison rather than by a special case — there is no
 * shape to migrate FROM on record, so "fall back to defaults" is the honest
 * answer and the one `setLayout` already gives.
 */
function readPersisted(key: string | undefined): PersistedState | null {
  if (key === undefined) return null;
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const p = parsed as Partial<PersistedState>;
    if (p.version !== ACCORDION_LAYOUT_VERSION) return null;
    const strings = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
    const sizes: Record<string, number> = {};
    if (typeof p.sizes === 'object' && p.sizes !== null) {
      for (const [k, v] of Object.entries(p.sizes)) {
        if (typeof v === 'number' && Number.isFinite(v)) sizes[k] = v;
      }
    }
    return {
      version: ACCORDION_LAYOUT_VERSION,
      open: strings(p.open),
      pinned: strings(p.pinned),
      order: strings(p.order),
      sizes,
    };
  } catch {
    // A corrupt/blocked localStorage must not take the panel group down.
    return null;
  }
}

export function AccordionGroup(props: AccordionGroupProps): JSX.Element {
  const orientation = (): AccordionOrientation => props.orientation ?? 'vertical';
  const railSide = (): AccordionRailSide => props.railSide ?? 'left';
  const mode = (): AccordionMode => props.mode ?? 'natural';
  const policy = (): AccordionPolicy => props.policy ?? 'single';
  const openPlacement = (): AccordionOpenPlacement => props.openPlacement ?? 'in-order';
  const reorderable = (): boolean => props.reorderable ?? true;
  const resizable = (): boolean => props.resizable ?? true;

  const parent = useContext(AccordionGroupContext);
  const depth = parent === undefined ? 0 : parent.depth + 1;

  const persisted = readPersisted(props.storageKey);
  /** True when localStorage answered — in that case `defaultOpen` on a panel is
   *  IGNORED, because a remembered state the user produced outranks an author default. */
  const hydrated = persisted !== null;

  /**
   * Open MEMBERSHIP. Kept as an array rather than a Set only so persistence has a
   * stable serialisation; the on-screen sequence does NOT come from here.
   *
   * That sequence is `orderIds` — one order, rendered twice (rail + columns). It is
   * the reason dragging a rail button moves its column and dragging a column moves
   * its rail button: there is nothing to keep in sync, because there is only one
   * thing. An earlier draft made open-order the column order and left the rail on
   * declaration order, which meant the two representations disagreed the moment
   * anything was dragged — two orders is a bug surface, not a feature.
   */
  const [openList, setOpenList] = createSignal<readonly string[]>(persisted?.open ?? []);
  const [pinned, setPinnedSet] = createSignal<ReadonlySet<string>>(
    new Set(persisted?.pinned ?? []),
  );
  /** User-controlled panel order (leaves excluded — they are always terminal). */
  const [orderIds, setOrderIds] = createSignal<readonly string[]>(persisted?.order ?? []);
  const [sizes, setSizesRaw] = createSignal<Readonly<Record<string, number>>>(
    persisted?.sizes ?? {},
  );
  const [metaMap, setMetaMap] = createSignal<ReadonlyMap<string, PanelMeta>>(new Map());

  /**
   * Activator elements, REACTIVELY.
   *
   * A plain Map was enough while these only served `moveFocus`, which reads them
   * inside an event handler long after mount. An anchored flyout reads one during
   * render — before the rail button's ref callback has fired — so a non-reactive
   * read returns undefined once and never corrects itself, leaving the popover
   * anchored to nothing. The signal is what lets the anchor re-resolve when the
   * ref lands.
   */
  const [headerEls, setHeaderEls] = createSignal<ReadonlyMap<string, HTMLElement>>(new Map());
  /**
   * The `⋯` trigger, when the rail is overflowing. Signal-backed for the same
   * reason `headerEls` is: it is read during render as a popover anchor, and it
   * appears and disappears as the dock is resized.
   */
  const [railOverflowEl, setRailOverflowEl] = createSignal<HTMLElement | null>(null);

  /**
   * The activators, as a slot. Signal-backed because a flyout resolves its anchor
   * during render, before the ref has fired — a plain Map read would answer
   * `undefined` once and never correct itself.
   */
  const activators: ElementSlot = {
    set: (id, el) => {
      setHeaderEls((prev) => {
        if (prev.get(id) === el) return prev;
        const next = new Map(prev);
        next.set(id, el);
        return next;
      });
    },
    clear: (id, el) => {
      setHeaderEls((prev) => {
        // Identity-guarded: on an orientation swap the incoming activator registers
        // BEFORE the outgoing one's cleanup runs, and an unconditional delete then
        // removes the live element. See `slotRef`.
        if (prev.get(id) !== el) return prev;
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
    },
  };

  /** One element, keyed so it can share `slotRef`. */
  const railOverflowSlot: ElementSlot = {
    set: (_key, el) => setRailOverflowEl(el),
    clear: (_key, el) => setRailOverflowEl((prev) => (prev === el ? null : prev)),
  };
  const panelEls = new Map<string, HTMLElement>();
  /** Plain Map: nothing renders from these, they are only measured. The slot is
   *  what makes the clear identity-guarded — see `slotRef`. */
  const panelElements = createMapSlot(panelEls);

  const persist = (): void => {
    if (props.storageKey === undefined) return;
    try {
      const state: PersistedState = {
        // Stamped, so `readPersisted` has something to gate on. Same constant the
        // explicit `getLayout`/`setLayout` pair uses — one version for one shape.
        version: ACCORDION_LAYOUT_VERSION,
        open: [...openList()],
        pinned: [...pinned()],
        order: [...orderIds()],
        sizes: { ...sizes() },
      };
      localStorage.setItem(props.storageKey, JSON.stringify(state));
    } catch {
      // silent — persistence is a nicety, never a hard dependency
    }
  };

  const metaOf = (id: string): PanelMeta | undefined => metaMap().get(id);
  const isLeaf = (id: string): boolean => metaOf(id)?.isLeaf ?? false;

  /** Panels (never leaves) in user order, skipping ids that have unregistered. */
  const panels = createMemo<readonly PanelMeta[]>(() => {
    const m = metaMap();
    return orderIds()
      .map((id) => m.get(id))
      .filter((v): v is PanelMeta => v !== undefined && !v.isLeaf);
  });

  const leaves = createMemo<readonly PanelMeta[]>(() =>
    [...metaMap().values()].filter((v) => v.isLeaf),
  );

  /**
   * Is this panel currently an auto-hide OVERLAY rather than a column?
   *
   * Late-bound with a `false` default because `createAutoHide` needs the finished
   * `api` object, so it cannot exist yet at this point in the body — and
   * `visualOpenIds` below is an eagerly-evaluated memo, so a bare `let` read here
   * would hit the temporal dead zone on the group's very first render. The default
   * is the correct answer for every group that never turns auto-hide on, which is
   * also what this returns for the one frame before the assignment lands.
   *
   * It stays reactive through the wrapper: the assigned implementation reads
   * `enabled`/`orientation`/`isOpen`/`isPinned`, and this indirection does not
   * break that chain because the call happens inside the reader's tracking scope.
   */
  let isFlyoutId: (id: string) => boolean = () => false;

  /**
   * Open panels in the sequence they are painted — the order a splitter walks to
   * find its neighbour, the breadcrumb reads, and the flex `order` follows.
   *
   * The RULE lives in `visualOrder.ts` and is documented there. This memo is only
   * the reactive wrapper around it: its job is to name which signals the rule's
   * inputs come from, so the sequence recomputes when any of them moves. Keeping
   * the rule out of here is what let the test stub stop carrying a copy of it.
   */
  /**
   * The group's leaf chain — `parentId` edges, published by each `<AccordionLeaf>`
   * and read back here to sort the open leaves.
   *
   * Created BEFORE `visualOpenIds` because that memo consumes it, and bound to the
   * api object further down (`bindLeafChain`) so the leaves can find it. Both
   * halves were missing until now: nothing called `bindLeafChain`, so every
   * chained leaf fell through to `leafChainFor`'s unshared fallback, warned once
   * on the console, and painted in open-list order — the exact ordering the chain
   * exists to stop being an accident.
   */
  const leafChain = createLeafChain();

  const visualOpenIds = createMemo<readonly string[]>(() =>
    orderVisualOpen({
      order: orderIds(),
      open: openList(),
      isLeaf,
      isFlyout: (id) => isFlyoutId(id),
      orderLeaves: leafChain.orderOpen,
    }),
  );

  /** Divider mode follows `autoHide` unless the consumer says otherwise — see the
   *  prop's JSDoc for why that is the default rather than a separate opt-in. */
  const railDivider = (): boolean =>
    orientation() === 'horizontal' && (props.railDivider ?? props.autoHide ?? false);

  /**
   * The static/dynamic split and every flex `order` in the group.
   *
   * PIN ORDER comes from the pinned Set's own iteration order, which is insertion
   * order — and `togglePin` re-adds on repin, so a re-pinned panel moves to the
   * end of the static run exactly as the rule requires. That is also what the
   * persisted `pinned` array round-trips, so the static sequence survives a
   * reload rather than being rebuilt from panel order.
   */
  const railPartition = createMemo(() =>
    partitionAtRail({
      visualOpen: visualOpenIds(),
      pinOrder: [...pinned()],
      isLeaf,
      enabled: railDivider(),
    }),
  );
  const railOrder = (): number => railPartition().railOrder;

  /**
   * THE writer for open membership. Every path that changes which panels are open
   * goes through here — `setOpen`, `expandAll`, `collapseAll`, `setLayout` — and
   * that is not a stylistic preference, it is where two invariants are enforced.
   *
   * The cap USED to be applied in `setOpen` only, so `expandAll` and `setLayout`
   * both sailed past it: a group with `maxOpen={2}` opened all six of its panels
   * if the consumer called `expandAll()`. A cap that three of four writers honour
   * is not a cap. Applying it here makes "more than `maxOpen` panels are open" a
   * state the group cannot represent, rather than one that four callsites have to
   * remember to avoid.
   *
   * `justOpened` names the panel that must survive eviction — the one the user
   * just asked for. Bulk paths pass nothing, and then the cap simply evicts the
   * least recently opened, which is the same rule with no exception.
   */
  const commitOpen = (next: readonly string[], justOpened?: string): void => {
    const prev = openList();
    const capped = evictForCap(next, justOpened);
    setOpenList(capped);
    persist();
    if (props.onChange === undefined) return;
    // Diff BOTH directions: the interesting event in an accordion is usually the
    // panel that closed without being clicked. Diffed against the CAPPED result,
    // so a consumer is told about an eviction it did not ask for.
    for (const id of capped) if (!prev.includes(id)) props.onChange(id, true);
    for (const id of prev) if (!capped.includes(id)) props.onChange(id, false);
  };

  /**
   * THE writer for the pinned set, for the same reason `commitOpen` is the writer
   * for open membership.
   *
   * `setLayout` used to call `setPinnedSet` directly, so restoring a layout
   * changed which panels were pinned and told nobody: it fired `onChange` for
   * every panel it opened or closed, `onOrderChange`, and `onSizeChange` — and
   * silently skipped `onPinChange`. A consumer mirroring pin state went stale on
   * every restore, with the dock and the mirror disagreeing until the user
   * happened to toggle a pin by hand.
   */
  const commitPinned = (next: ReadonlySet<string>): void => {
    const prev = pinned();
    setPinnedSet(next);
    persist();
    if (props.onPinChange === undefined) return;
    for (const id of next) if (!prev.has(id)) props.onPinChange(id, true);
    for (const id of prev) if (!next.has(id)) props.onPinChange(id, false);
  };

  /**
   * Enforce `maxOpen` by evicting least-recently-opened panels.
   *
   * `openList` is insertion-ordered, so its FRONT is the least recently opened —
   * that is the whole reason open membership is stored as an ordered array now that
   * the on-screen sequence comes from `order` instead. Eviction skips pinned panels
   * and leaves: the pin's entire job in this control is to survive bulk operations,
   * and a leaf is the result of a selection rather than a panel competing for space.
   *
   * If every open panel is exempt the cap simply does not bind — refusing to open the
   * new panel would be a worse failure than briefly exceeding a soft limit, because
   * the user's click would appear to do nothing.
   *
   * `justOpened` is optional because the bulk writers (`expandAll`, `setLayout`)
   * have no such panel: nothing there was "just asked for", so nothing is exempt
   * and eviction is plain least-recently-opened.
   */
  const evictForCap = (next: readonly string[], justOpened?: string): readonly string[] => {
    const cap = props.maxOpen;
    if (cap === undefined || cap <= 0) return next;
    const result = [...next];
    const countable = (): string[] => result.filter((v) => !isLeaf(v));
    while (countable().length > cap) {
      const victim = result.find(
        (v) => v !== justOpened && !isLeaf(v) && !pinned().has(v),
      );
      if (victim === undefined) return result;
      result.splice(result.indexOf(victim), 1);
    }
    return result;
  };

  const setOpen = (id: string, want: boolean): void => {
    const current = openList();
    if (!want) {
      if (!current.includes(id)) return;
      /*
       * A LEAF is controlled — see `PanelMeta.requestClose`. Editing the open list
       * here would leave the leaf painting (its own `<Show>` still reads
       * `props.open`) while the group believed it closed: a pane on screen with a
       * broken flex `order` and a splitter that cannot find its neighbour.
       *
       * So the group asks, and the leaf's own effect reports back through
       * `setLeafOpen` once its owner has actually flipped the prop.
       */
      const requestClose = metaOf(id)?.requestClose;
      if (requestClose !== undefined) {
        requestClose();
        return;
      }
      commitOpen(current.filter((v) => v !== id));
      return;
    }
    if (current.includes(id)) return;
    // `append` placement moves the panel within THE order, so the rail follows the
    // column. Deferred to a microtask-free direct call after the open commit so the
    // order change and the open change land as one user-visible step.
    const placeLast = (): void => {
      if (openPlacement() !== 'append' || isLeaf(id)) return;
      moveTo(id, orderIds().length - 1);
    };
    if (policy() === 'multi' || isLeaf(id)) {
      commitOpen([...current, id], id);
      placeLast();
      return;
    }
    // single policy: every PINNED panel that was already open keeps its slot — and
    // its position — then the newly-opened panel is APPENDED after them. Leaves are
    // implicitly exempt: a detail pane is the RESULT of the selection being made in
    // the columns, so auto-collapsing it on the next click would destroy the very
    // thing the click produced.
    commitOpen([...current.filter((v) => pinned().has(v) || isLeaf(v)), id], id);
    placeLast();
  };

  /** THE writer for explicit sizes — persists and notifies, so no path can change
   *  sizes without a consumer hearing about it. */
  const commitSizes = (next: Record<string, number>): void => {
    setSizesRaw(next);
    persist();
    props.onSizeChange?.(next);
  };

  const commitOrder = (next: readonly string[]): void => {
    setOrderIds(next);
    persist();
    props.onOrderChange?.(next);
  };

  const moveTo = (id: string, toIndex: number): void => {
    const cur = [...orderIds()];
    const from = cur.indexOf(id);
    if (from < 0) return;
    const clamped = Math.max(0, Math.min(toIndex, cur.length - 1));
    if (clamped === from) return;
    cur.splice(from, 1);
    cur.splice(clamped, 0, id);
    commitOrder(cur);
  };

  const resize = createResize({
    axis: () => (orientation() === 'horizontal' ? 'x' : 'y'),
    // Rail on the right mirrors the main axis, so pointer-right SHRINKS the panel
    // whose trailing edge is being dragged. One sign flip, no second code path.
    direction: () => (orientation() === 'horizontal' && railSide() === 'right' ? -1 : 1),
    visualOpenIds,
    elementOf: (id) => panelEls.get(id),
    minSizeOf: (id) => metaOf(id)?.minSize() ?? DEFAULT_MIN_SIZE_PX,
    sizes,
    // Two writers, because a drag has intermediate states and a commit does not —
    // see the PREVIEW vs COMMIT note in `resize.ts`. `previewSizes` moves the
    // signal only; every persisted, reported size change goes through
    // `commitSizes`, which keeps the "one writer per piece of state" rule intact
    // (the preview writes a state that is by definition not yet a decision).
    previewSizes: setSizesRaw,
    commitSizes,
    // A leaf's visibility belongs to the consumer, so the dock must not close one
    // behind its back; it clamps at the minimum instead.
    canCollapse: (id) => !isLeaf(id),
    collapse: (id) => {
      if (isLeaf(id)) return false;
      setOpen(id, false);
      return true;
    },
  });

  /**
   * Drag-reorder, using the project's OWN primitive (vendored — see ./vendor). The
   * alternative was a third hand-rolled pointer-drag implementation in a codebase
   * that already has a tested one; that is how gesture behaviour drifts between
   * controls.
   *
   * Both orientations stack their activators vertically (headers go down, rail
   * buttons go down), so the drag axis is 'y' in both cases.
   */
  const reorder = createReorderList({
    ids: () => panels().map((m) => m.id),
    axis: 'y',
    skipSelector: REORDER_SKIP_SELECTOR,
    stopPropagation: false,
    onReorder: (fromIndex, toIndex) => {
      const ids = panels().map((m) => m.id);
      const moved = ids[fromIndex];
      if (moved !== undefined) moveTo(moved, toIndex);
    },
  });

  /**
   * Reorder driven by dragging a COLUMN (its title bar) rather than a rail button.
   *
   * A second primitive instance rather than a second mode on the first, because the
   * two drags disagree on both inputs: the rail drags every registered panel along
   * the Y axis, while columns drag only the OPEN ones along X. Trying to serve both
   * from one instance would mean swapping its `ids` and `axis` mid-gesture.
   *
   * The result still lands in the one shared `order`, so dragging a column moves its
   * rail button — the coupling is not extra work here, it is the absence of work.
   */
  const draggableColumnIds = (): string[] => visualOpenIds().filter((id) => !isLeaf(id));

  /**
   * Apply a move made in the OPEN subsequence back onto the full order.
   *
   * Closed panels keep their absolute slots: they are not visible on screen, so a
   * drag between two columns carries no information about where a closed panel
   * should end up, and silently relocating one would surprise the user the next time
   * they opened it. Only the open ids are permuted, into the same positions they
   * already occupied.
   */
  const moveOpenTo = (fromIndex: number, toIndex: number): void => {
    const visual = draggableColumnIds();
    const moved = visual[fromIndex];
    if (moved === undefined) return;
    const nextVisual = [...visual];
    nextVisual.splice(fromIndex, 1);
    nextVisual.splice(Math.max(0, Math.min(toIndex, nextVisual.length)), 0, moved);

    const openSlots = new Set(visual);
    let cursor = 0;
    const nextOrder = orderIds().map((id) => (openSlots.has(id) ? nextVisual[cursor++] : id));
    commitOrder(nextOrder);
  };

  const columnReorder = createReorderList({
    ids: draggableColumnIds,
    // Columns lie along the group's main axis, which is horizontal. `row-reverse`
    // for a right-docked rail is handled by the primitive measuring real rects —
    // it reads positions, not declaration order, so the mirror needs no special case.
    axis: 'x',
    skipSelector: REORDER_SKIP_SELECTOR,
    stopPropagation: false,
    onReorder: moveOpenTo,
  });

  const [railEl, setRailEl] = createSignal<HTMLElement | undefined>();
  const overflowStrategy = (): 'menu' | 'pan' => props.railOverflow ?? 'menu';

  /**
   * Built BEFORE `api` — unlike auto-hide and tear-off below — because `api`
   * genuinely depends on it: `activatorElOf` has to know whether a panel's button
   * was collapsed into the `⋯` menu. Its own inputs (`railEl`, `panels`,
   * `orientation`) are all available at this point, so the dependency runs one way
   * and needs no late binding.
   */
  /**
   * The panels the rail is actually serving.
   *
   * Under the divider an OPEN PINNED panel has no button — its column is its
   * presence — so it is filtered out here rather than hidden in the button's own
   * render. That distinction matters: the overflow measurement divides the rail's
   * extent among the buttons it is given, and a hidden-but-counted button would
   * reserve space for something that never paints, pushing a real button into the
   * `⋯` menu for no reason.
   */
  const railServedIds = createMemo<readonly string[]>(() =>
    panels()
      .map((m) => m.id)
      .filter((id) =>
        showsRailButton(id, {
          isOpen: (v) => openList().includes(v),
          isPinned: (v) => pinned().has(v),
          enabled: railDivider(),
        }),
      ),
  );

  const railOverflow = createRailOverflow({
    railEl,
    ids: railServedIds,
    enabled: () => orientation() === 'horizontal' && overflowStrategy() === 'menu',
  });

  /**
   * Late-bound: `createAutoHide` needs the finished `api` to read group state, and
   * `api` needs the auto-hide answers. One of the two has to be resolved after the
   * other is built, and a mutable reference read through a closure is the smaller
   * lie than constructing a half-populated api object.
   */
  let autoHideApi: AutoHideApi | undefined;
  let tearOffApi: TearOffController | undefined;

  const api: AccordionGroupApi = {
    orientation,
    railSide,
    mode,
    policy,
    reorderable,
    resizable,
    depth,

    openOrder: openList,
    order: orderIds,
    visualOpenIds,
    panels,
    leaves,
    meta: metaOf,

    isOpen: (id) => openList().includes(id),
    isPinned: (id) => pinned().has(id),
    openIndex: (id) => visualOpenIds().indexOf(id),
    railDivider,
    columnOrder: (id) => railPartition().orderOf(id),
    isEdgeColumn: (id) => railPartition().isEdgeColumn(id),
    railOrder,
    isStaticColumn: (id) => railPartition().staticIds.includes(id),
    /** The last pinned column — the one whose trailing edge IS the rail. */
    isRailBoundary: (id) => {
      const s = railPartition().staticIds;
      return s.length > 0 && s[s.length - 1] === id;
    },
    showsRailButton: (id) =>
      showsRailButton(id, {
        isOpen: (v) => openList().includes(v),
        isPinned: (v) => pinned().has(v),
        enabled: railDivider(),
      }),
    /**
     * Collapse a column but REMEMBER that it docks — the column title bar's own
     * activator. Deliberately NOT the same path as the × beside it: that one is
     * close-and-FORGET (see `closeAndUnpin`), and the only difference between
     * them is whether `pinned` survives. Two names, because a future reader who
     * folds them into one handler silently destroys the distinction the whole
     * open×pinned model rests on.
     */
    collapseKeepPin: (id) => setOpen(id, false),
    /**
     * Close a column AND drop its pin — the ×. The panel forgets it was docked,
     * so its rail button reopens it as a flyout like any other unpinned panel,
     * and nothing is left pinned-but-invisible.
     */
    closeAndUnpin: (id) => {
      const next = new Set(pinned());
      if (next.delete(id)) commitPinned(next);
      setOpen(id, false);
    },
    neighborOpenId: (id) => {
      const ids = visualOpenIds();
      const i = ids.indexOf(id);
      return i < 0 ? undefined : ids[i + 1];
    },

    setOpen,
    // The leaf reporting its own state, bypassing the request path above — see
    // `setLeafOpen` on the interface for why the two directions are separate.
    setLeafOpen: (id, open) => {
      const current = openList();
      if (open) {
        if (current.includes(id)) return;
        commitOpen([...current, id], id);
        return;
      }
      if (!current.includes(id)) return;
      commitOpen(current.filter((v) => v !== id));
    },
    toggle: (id) => setOpen(id, !openList().includes(id)),

    togglePin: (id) => {
      const next = new Set(pinned());
      if (next.has(id)) next.delete(id);
      else next.add(id);
      commitPinned(next);
    },

    expandAll: () => {
      // Deliberately a no-op under `single`: "expand all" is not a thing an
      // accordion can do, and silently switching policy for one click would make
      // the group's contract depend on which button you last pressed.
      if (policy() === 'single') return;
      // Through `commitOpen`, which applies `maxOpen`. This used to open every
      // panel unconditionally, so a group with a cap of 2 ended up with six
      // columns and no way for the user to have produced that state themselves.
      const open = openList();
      commitOpen([...open, ...panels().map((m) => m.id).filter((id) => !open.includes(id))]);
    },

    collapseAll: () => {
      commitOpen(
        openList().filter((id) =>
          survivesBulkClose(id, { isPinned: (pid) => pinned().has(pid), isLeaf }),
        ),
      );
    },

    getLayout: () => ({
      version: ACCORDION_LAYOUT_VERSION,
      open: [...openList()],
      pinned: [...pinned()],
      order: [...orderIds()],
      sizes: { ...sizes() },
    }),

    setLayout: (layout) => {
      // All-or-nothing. A layout from an older shape could be missing a field the
      // group now depends on, and a half-restored dock is harder to diagnose than
      // one that visibly fell back to defaults.
      if (layout.version !== ACCORDION_LAYOUT_VERSION) return false;
      /*
       * FOUR COMMITS, no raw setters.
       *
       * This used to write `setPinnedSet` and `setSizesRaw` directly and then
       * hand-fire the callbacks it remembered — which was `onChange`,
       * `onOrderChange` and `onSizeChange`, but never `onPinChange`. A restore
       * silently changed which panels were pinned, so a consumer mirroring that
       * state went stale until the user happened to toggle a pin by hand.
       *
       * Going through the same writers every other path uses removes the
       * remembering. Each one persists and notifies, so a restore is reported
       * exactly like the equivalent sequence of user actions — including the cap,
       * which a stored layout can violate and which `commitOpen` now enforces.
       */
      commitOrder([...layout.order]);
      commitPinned(new Set(layout.pinned));
      commitSizes({ ...layout.sizes });
      commitOpen([...layout.open]);
      return true;
    },

    moveTo,
    moveBy: (id, delta) => {
      const from = orderIds().indexOf(id);
      if (from < 0) return;
      moveTo(id, from + delta);
    },

    sizeOf: (id) => sizes()[id],
    setSize: (id, px) => commitSizes({ ...sizes(), [id]: px }),
    resetSizes: () => commitSizes({}),
    beginResize: resize.begin,
    nudgeResize: resize.nudge,
    resizeBoundsOf: resize.boundsOf,
    resizing: resize.resizing,
    collapseCandidate: resize.collapseCandidate,

    register: (meta, defaultOpen) => {
      if (metaMap().has(meta.id)) {
        /*
         * Two panels sharing an id silently became ONE registration: the second
         * lost its chrome (the rail renders the first one's title and count), both
         * toggled together because open state is keyed by id, and whichever
         * unmounted first unregistered the pair. Every symptom of that reads as a
         * bug in the dock rather than as a duplicated string in the caller's JSX.
         *
         * Reported rather than thrown: the group's other panels are unaffected and
         * still work, so taking the whole dock down would turn a chrome bug into an
         * outage. `id` is documented as unique among siblings; this is that
         * document made noisy.
         */
        // eslint-disable-next-line no-console -- see above
        console.error(
          `[accordion-dock] two panels registered the id "${meta.id}". Ids must be ` +
            'unique within a group: they key open/pinned/order/size state and ' +
            'persistence, so the second panel shares the first one\'s state and ' +
            'loses its own chrome.',
        );
      }
      setMetaMap((prev) => {
        if (prev.has(meta.id)) return prev;
        const next = new Map(prev);
        next.set(meta.id, meta);
        return next;
      });
      // Leaves never enter the user order — they are pinned to the end by
      // definition, and letting one be dragged into the middle of the rail would
      // put a button on a thing that has no activator.
      if (!meta.isLeaf && !orderIds().includes(meta.id)) {
        setOrderIds((prev) => [...prev, meta.id]);
      }
      if (hydrated || !defaultOpen) return;
      // First-wins under `single`: two panels both declaring defaultOpen is an
      // author bug, and honouring the LAST one would make the initial view depend
      // on child order in a way that reads as random.
      if (policy() === 'single' && openList().some((id) => !isLeaf(id))) return;
      setOpen(meta.id, true);
    },

    unregister: (id) => {
      const wasLeaf = metaOf(id)?.isLeaf === true;
      setMetaMap((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      // No manual element purge here. Every element reference is filled through a
      // slot and emptied by that slot's own cleanup when the element unmounts, so
      // deleting them again on unregister would be a second, unguarded clear —
      // exactly the one `slotRef` documents as deleting a live replacement.
      // The ORDER entry deliberately survives: a panel that unmounts and remounts
      // (a route change, a `<Show>`) must come back where the user put it, not at
      // the end of the rail.
      //
      // A LEAF's open state does NOT survive, and the asymmetry is the point. A
      // panel's open state is the group's own — remembering it across a remount is
      // the same courtesy as remembering its position. A leaf's is a mirror of a
      // prop the consumer owns, so a stale entry is not a memory, it is a claim
      // about a component that no longer exists; it kept `isOpen` true forever and
      // was persisted.
      if (wasLeaf && openList().includes(id)) {
        commitOpen(openList().filter((v) => v !== id));
      }
    },

    activators,

    railOverflowSlot,

    // The fallback is the whole point — see `activatorElOf` on the interface. A
    // panel whose rail button was collapsed into the `⋯` menu is REPRESENTED by
    // that trigger, so that is what a flyout anchors to and what focus returns to.
    // Resolved once here so no caller has to know rail overflow exists.
    activatorElOf: (id) => {
      const own = headerEls().get(id);
      if (own !== undefined) return own;
      if (!railOverflow.overflowIds().includes(id)) return undefined;
      return railOverflowEl() ?? undefined;
    },
    tornOff: () => tearOffApi?.tornOff() ?? EMPTY_IDS,
    isTornOff: (id) => tearOffApi?.isTornOff(id) ?? false,
    tearOff: (id) => {
      const result = tearOffApi?.tearOff(id);
      return result === undefined ? { ok: false, reason: 'unavailable' } : result;
    },
    dock: (id) => tearOffApi?.dock(id),
    tearOffMountFor: (id) => tearOffApi?.mountFor(id),
    // Through the same late-bound reference `visualOpenIds` uses, so the panel's
    // `data-flyout` attribute and the painted sequence can never disagree about
    // which panels are overlays.
    isFlyout: (id) => isFlyoutId(id),
    flyoutMountFor: (id) => autoHideApi?.flyoutMountFor(id),
    density: () => props.density ?? 'comfortable',

    panelElements,

    moveFocus: (fromId, delta) => {
      const order = panels();
      if (order.length === 0) return;
      const from = order.findIndex((m) => m.id === fromId);
      let target: number;
      if (delta === 'first') target = 0;
      else if (delta === 'last') target = order.length - 1;
      else {
        // Wraps. A roving group of 3 activators is faster to traverse by wrapping
        // than by making the user reverse direction at each end.
        target = (from + delta + order.length) % order.length;
      }
      // Through `activatorElOf`, so arrowing onto a panel whose button collapsed
      // into the `⋯` menu focuses that trigger rather than silently focusing
      // nothing — which is what a raw `headerEls` read did.
      api.activatorElOf(order[target].id)?.focus();
    },

    reorderItemProps: (id) =>
      reorderable() ? (reorder.itemProps(id) as Record<string, unknown>) : {},
    reorderColumnProps: (id) =>
      reorderable() && orientation() === 'horizontal'
        ? (columnReorder.itemProps(id) as Record<string, unknown>)
        : {},
    reorderActiveId: reorder.activeId,
  };

  createRailPan({
    railEl,
    group: api,
    // The two strategies are mutually exclusive by construction: under `menu` the
    // rail never overflows, so there is nothing to pan and the listeners are not
    // attached at all rather than attached and inert.
    enabled: () => orientation() === 'horizontal' && overflowStrategy() === 'pan',
  });

  const autoHide: AutoHideApi = createAutoHide({
    group: api,
    enabled: () => props.autoHide === true,
    hoverToOpen: () => props.hoverToOpen === true,
  });

  autoHideApi = autoHide;
  // Closes the late-binding described at `isFlyoutId`'s declaration. From here on
  // `visualOpenIds` sees flyouts for what they are — overlays, not columns.
  isFlyoutId = (id) => autoHide.isFlyout(id);

  /**
   * Publish the chain against the finished api object, which is the only handle a
   * leaf and its group both hold. Until this call every `<AccordionLeaf parentId>`
   * resolved to `leafChainFor`'s private fallback: the edges were recorded into a
   * chain nobody read, so the console warning fired and chained leaves painted in
   * open order. `visualOpenIds` already sorts through `leafChain.orderOpen`, so
   * this line is what makes that sort see any edges at all.
   */
  bindLeafChain(api, leafChain);

  tearOffApi = createTearOff({
    // The OS window chrome is a torn-off panel's ONLY label, so a non-string title
    // (a JSX badge row, say) has to degrade to something identifiable rather than
    // to "[object Object]". The id is the honest fallback: it is unique and it is
    // what the author named the panel.
    titleOf: (id) => {
      const title = metaOf(id)?.title();
      return typeof title === 'string' ? title : id;
    },
    storageKey: props.storageKey === undefined ? undefined : `${props.storageKey}:tearoff`,
    onTearOff: (id) => props.onTearOff?.(id),
    onDock: (id) => props.onDock?.(id),
    onError: (id, reason) => props.onTearOffError?.(id, reason),
  });

  props.apiRef?.(api);

  return (
    <AccordionGroupContext.Provider value={api}>
      <div
        class={`acc-group ${props.class ?? ''}`.trim()}
        data-orientation={orientation()}
        data-rail-side={railSide()}
        data-mode={mode()}
        data-policy={policy()}
        data-density={props.density ?? 'comfortable'}
        data-animated={props.animated ? 'true' : 'false'}
        data-depth={depth}
        data-resizing={resize.resizing() ? 'true' : 'false'}
        data-collapse-candidate={resize.collapseCandidate() ?? undefined}
        role="region"
        aria-label={props.ariaLabel}
        style={props.height !== undefined ? { height: props.height } : undefined}
      >
        {/* The rail exists only in `horizontal`, and it is the GROUP that owns it —
            not the panels. The whole point of this orientation is that every panel's
            activator lives in ONE stacked strip regardless of where (or whether) its
            column is rendered, which a per-panel header physically cannot do. */}
        <Show when={orientation() === 'horizontal'}>
          <div
            ref={setRailEl}
            class="acc-rail"
            /* The rail's slot is COMPUTED under the divider — it sits after the
               static columns — where the stylesheet used to weld it to `order:
               -1`. Written as a style so the one number the layout turns on has a
               single source; the stylesheet reads it back through the custom
               property and keeps `-1` as the non-divider default. */
            style={railDivider() ? { order: railOrder() } : undefined}
            /* Everything is pinned: nothing is left for the rail to serve, so it
               collapses to zero width rather than leaving a dead strip between
               the static columns and the leaf. */
            data-rail-empty={
              railDivider() && railOverflow.visibleIds().length === 0 && !railOverflow.hasOverflow()
                ? 'true'
                : 'false'
            }
            role="tablist"
            aria-orientation="vertical"
            /* Under `multi` several tabs are selected at once, which a plain
               tablist does not allow — a screen reader reading two selected tabs
               in a single-select list is being told something contradictory. */
            aria-multiselectable={policy() === 'multi' ? 'true' : undefined}
            /* NAME MUST MATCH `rail.css`, which selects `data-overflow-mode`.
               This emitted `data-overflow` — one character of disagreement between
               the two authors — so every overflow-strategy rule was inert: the
               `menu` strategy never got its `overflow-y: hidden`, and `pan` never
               got `scrollbar-width: none`, the webkit scrollbar suppression or the
               end fades. The rail's base `overflow-y: auto` therefore stood in both
               strategies, which is precisely the scrollbar-in-a-40px-strip that the
               overflow work existed to remove. */
            data-overflow-mode={overflowStrategy()}
          >
            <For each={railOverflow.visibleIds()}>
              {(id) => {
                const meta = (): PanelMeta | undefined => api.meta(id);
                return (
                  <Show when={meta()}>
                    {(m) => <RailButton group={api} meta={m()} autoHide={autoHide} />}
                  </Show>
                );
              }}
            </For>
            <Show when={railOverflow.hasOverflow()}>
              <RailOverflowMenu
                group={api}
                ids={railOverflow.overflowIds}
                onMeasure={railOverflow.setTriggerExtent}
              />
            </Show>
          </div>
        </Show>

        {props.children}

        {/* Soaks up the leftover space when nothing is open, so the header stack (or
            the rail) sits flush at the start of the group instead of being stretched
            apart by the flex container. */}
        <div class="acc-filler" aria-hidden="true" />

        {/* Every open flyout's popover lives here. Rendered once, inside the group,
            so it inherits the group's token scope for anything not portalled. */}
        {autoHide.element}
      </div>
    </AccordionGroupContext.Provider>
  );
}

/**
 * One button in the horizontal rail.
 *
 * Reads its label through the meta ACCESSORS rather than a snapshot, so a count that
 * ticks or a title that changes updates on the rail — see `PanelMeta`.
 */
function RailButton(props: {
  group: AccordionGroupApi;
  meta: PanelMeta;
  autoHide: AutoHideApi;
}): JSX.Element {
  const open = (): boolean => props.group.isOpen(props.meta.id);
  const pinned = (): boolean => props.group.isPinned(props.meta.id);
  const dragProps = (): Record<string, unknown> => props.group.reorderItemProps(props.meta.id);
  /**
   * The id is CAPTURED, not read through `props` on each call.
   *
   * `trackedRef`'s cleanup runs during disposal, and this component is rendered
   * inside a `<Show when={meta()}>` — so by then `props.meta` is `undefined` and
   * `props.meta.id` throws, taking every later cleanup in the owner tree with it.
   * The id is fixed for this button's lifetime (the `<For>` keys on it), so there
   * is nothing to gain by re-reading it and a teardown to lose.
   */
  const panelId = props.meta.id;
  const registerHeaderEl = slotRef(props.group.activators, panelId);
  // The id is passed as an accessor: this button is rendered from a <For> over
  // reactive metadata, so a snapshot would bind the menu to whichever panel held
  // the slot at mount and act on the wrong one after a reorder.
  const menu = createPanelMenu(props.group, () => props.meta.id);
  // The menu is passed INTO the key handler rather than attached separately: one
  // element, one `onKeyDown`. See `createActivatorKeyDown`.
  const onKeyDown = createActivatorKeyDown(props.group, () => props.meta.id, {
    onMenu: (el) => menu.openAtElement(el),
  });

  return (
    <>
    <button
      {...dragProps()}
      {...props.autoHide.railHoverProps(props.meta.id)}
      {...menu.triggerProps}
      {...{ [RAIL_ITEM_ATTR]: props.meta.id }}
      data-flyout={flyoutDataAttr(props.autoHide.isFlyout(props.meta.id))}
      ref={(el) => {
        // `trackedRef`, NOT a bare `setHeaderEl(id, el)`: this button unmounts
        // whenever the rail overflows and its panel collapses into the `⋯` menu,
        // and the panel is not unregistered by that, so nothing else would ever
        // clear the entry. See `trackedRef` for what the stale node did.
        registerHeaderEl(el);
        // The reorder primitive registers its own node via `itemProps.ref`; Solid
        // lets the later `ref` win, so it is called through explicitly rather than
        // silently dropped.
        const viaDrag = dragProps().ref as ((e: HTMLElement) => void) | undefined;
        viaDrag?.(el);
      }}
      type="button"
      class={`acc-rail-btn ${props.meta.railClass() ?? ''}`.trim()}
      role="tab"
      title={props.meta.tooltip()}
      /* The other half of the tab/tabpanel pattern — see `PanelMeta.contentId`.
         A tab that controls nothing is a button wearing a role. */
      aria-controls={props.meta.contentId}
      aria-selected={open()}
      data-open={open() ? 'true' : 'false'}
      data-pinned={pinned() ? 'true' : 'false'}
      style={props.meta.accent() !== undefined ? { '--acc-accent': props.meta.accent() } : undefined}
      onClick={() => props.group.toggle(props.meta.id)}
      onKeyDown={onKeyDown}
    >
      <Show when={pinned()}>
        <span class="acc-rail-pin" aria-hidden="true">
          <Pin />
        </span>
      </Show>
      <Show when={props.meta.icon()}>
        <span class="acc-rail-icon">{props.meta.icon()}</span>
      </Show>
      <span class="acc-rail-label">{props.meta.railLabel() ?? props.meta.title()}</span>
      <Show when={props.meta.count() !== undefined}>
        <span class="acc-rail-count">{props.meta.count()}</span>
      </Show>
      <Show when={props.meta.badge()}>
        <span class="acc-badge" data-badge={props.meta.badge()} aria-hidden="true" />
      </Show>
    </button>
    {menu.element}
    </>
  );
}
