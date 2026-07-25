import { For, Show, createMemo, createSignal, useContext, type JSX } from 'solid-js';
import {
  ACCORDION_LAYOUT_VERSION,
  AccordionGroupContext,
  type AccordionGroupApi,
  type AccordionMode,
  type AccordionOpenPlacement,
  type AccordionOrientation,
  type AccordionPolicy,
  type AccordionRailSide,
  type PanelMeta,
} from './context';
import { Pin } from './icons';
import { createActivatorKeyDown } from './keys';
import { bindLeafChain, createLeafChain } from './leafChain';
import { orderVisualOpen, survivesBulkClose } from './visualOrder';
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

interface PersistedState {
  open: string[];
  pinned: string[];
  order: string[];
  sizes: Record<string, number>;
}

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

function readPersisted(key: string | undefined): PersistedState | null {
  if (key === undefined) return null;
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const p = parsed as Partial<PersistedState>;
    const strings = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
    const sizes: Record<string, number> = {};
    if (typeof p.sizes === 'object' && p.sizes !== null) {
      for (const [k, v] of Object.entries(p.sizes)) {
        if (typeof v === 'number' && Number.isFinite(v)) sizes[k] = v;
      }
    }
    return { open: strings(p.open), pinned: strings(p.pinned), order: strings(p.order), sizes };
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
  const panelEls = new Map<string, HTMLElement>();

  const persist = (): void => {
    if (props.storageKey === undefined) return;
    try {
      const state: PersistedState = {
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

  const commitOpen = (next: readonly string[]): void => {
    const prev = openList();
    setOpenList(next);
    persist();
    if (props.onChange === undefined) return;
    // Diff BOTH directions: the interesting event in an accordion is usually the
    // panel that closed without being clicked.
    for (const id of next) if (!prev.includes(id)) props.onChange(id, true);
    for (const id of prev) if (!next.includes(id)) props.onChange(id, false);
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
   */
  const evictForCap = (next: readonly string[], justOpened: string): readonly string[] => {
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
      commitOpen(evictForCap([...current, id], id));
      placeLast();
      return;
    }
    // single policy: every PINNED panel that was already open keeps its slot — and
    // its position — then the newly-opened panel is APPENDED after them. Leaves are
    // implicitly exempt: a detail pane is the RESULT of the selection being made in
    // the columns, so auto-collapsing it on the next click would destroy the very
    // thing the click produced.
    commitOpen(evictForCap([...current.filter((v) => pinned().has(v) || isLeaf(v)), id], id));
    placeLast();
  };

  const setSizes = (next: Record<string, number>): void => {
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
    setSizes,
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
    neighborOpenId: (id) => {
      const ids = visualOpenIds();
      const i = ids.indexOf(id);
      return i < 0 ? undefined : ids[i + 1];
    },

    setOpen,
    toggle: (id) => setOpen(id, !openList().includes(id)),

    togglePin: (id) => {
      const next = new Set(pinned());
      const nowPinned = !next.has(id);
      if (nowPinned) next.add(id);
      else next.delete(id);
      setPinnedSet(next);
      persist();
      props.onPinChange?.(id, nowPinned);
    },

    expandAll: () => {
      // Deliberately a no-op under `single`: "expand all" is not a thing an
      // accordion can do, and silently switching policy for one click would make
      // the group's contract depend on which button you last pressed.
      if (policy() === 'single') return;
      commitOpen([...openList(), ...panels().map((m) => m.id).filter((id) => !openList().includes(id))]);
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
      setOrderIds([...layout.order]);
      setPinnedSet(new Set(layout.pinned));
      setSizesRaw({ ...layout.sizes });
      // Routed through commitOpen so consumers still hear onChange for every panel
      // the restore opened or closed — a restore is a state change like any other.
      commitOpen([...layout.open]);
      persist();
      props.onOrderChange?.(orderIds());
      props.onSizeChange?.(sizes());
      return true;
    },

    moveTo,
    moveBy: (id, delta) => {
      const from = orderIds().indexOf(id);
      if (from < 0) return;
      moveTo(id, from + delta);
    },

    sizeOf: (id) => sizes()[id],
    setSize: (id, px) => setSizes({ ...sizes(), [id]: px }),
    resetSizes: () => setSizes({}),
    beginResize: resize.begin,
    resizing: resize.resizing,
    collapseCandidate: resize.collapseCandidate,

    register: (meta, defaultOpen) => {
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
      setMetaMap((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      setHeaderEls((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      panelEls.delete(id);
      // The ORDER entry deliberately survives: a panel that unmounts and remounts
      // (a route change, a `<Show>`) must come back where the user put it, not at
      // the end of the rail.
    },

    setHeaderEl: (id, el) => {
      setHeaderEls((prev) => {
        if (el === null) {
          if (!prev.has(id)) return prev;
          const next = new Map(prev);
          next.delete(id);
          return next;
        }
        if (prev.get(id) === el) return prev;
        const next = new Map(prev);
        next.set(id, el);
        return next;
      });
    },

    headerElOf: (id) => headerEls().get(id),
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

    setPanelEl: (id, el) => {
      if (el === null) panelEls.delete(id);
      else panelEls.set(id, el);
    },

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
      headerEls().get(order[target].id)?.focus();
    },

    reorderItemProps: (id) =>
      reorderable() ? (reorder.itemProps(id) as Record<string, unknown>) : {},
    reorderColumnProps: (id) =>
      reorderable() && orientation() === 'horizontal'
        ? (columnReorder.itemProps(id) as Record<string, unknown>)
        : {},
    reorderActiveId: reorder.activeId,
  };

  const [railEl, setRailEl] = createSignal<HTMLElement | undefined>();
  const overflowStrategy = (): 'menu' | 'pan' => props.railOverflow ?? 'menu';

  const railOverflow = createRailOverflow({
    railEl,
    ids: () => panels().map((m) => m.id),
    enabled: () => orientation() === 'horizontal' && overflowStrategy() === 'menu',
  });

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
            role="tablist"
            aria-orientation="vertical"
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
  const onKeyDown = createActivatorKeyDown(props.group, () => props.meta.id);
  const dragProps = (): Record<string, unknown> => props.group.reorderItemProps(props.meta.id);
  // The id is passed as an accessor: this button is rendered from a <For> over
  // reactive metadata, so a snapshot would bind the menu to whichever panel held
  // the slot at mount and act on the wrong one after a reorder.
  const menu = createPanelMenu(props.group, () => props.meta.id);

  return (
    <>
    <button
      {...dragProps()}
      {...props.autoHide.railHoverProps(props.meta.id)}
      {...menu.triggerProps}
      {...{ [RAIL_ITEM_ATTR]: props.meta.id }}
      data-flyout={flyoutDataAttr(props.autoHide.isFlyout(props.meta.id))}
      ref={(el) => {
        props.group.setHeaderEl(props.meta.id, el);
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
