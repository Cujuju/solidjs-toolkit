import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  useContext,
  type JSX,
} from 'solid-js';
import {
  ACCORDION_LAYOUT_VERSION,
  AccordionGroupContext,
  type AccordionGroupApi,
  type AccordionLayout,
  type AccordionAppearance,
  type AccordionMode,
  type AccordionOpenPlacement,
  type AccordionOrientation,
  type AccordionPolicy,
  type AccordionRailSide,
  type ElementSlot,
  type PanelMeta,
  createMapSlot,
  RAIL_OVERFLOW_SLOT_KEY,
} from './context';
import { bindLeafChain, createLeafChain } from './leafChain';
import {
  orderVisualOpen,
  partitionAtRail,
  repinToVisualOrder,
  showsRailButton,
  survivesBulkClose,
} from './visualOrder';
import { createResize, DEFAULT_MIN_SIZE_PX } from './resize';
import { createRailOverflow } from './railOverflow';
import { RailButton } from './RailButton';
import { RailOverflowMenu } from './RailOverflowMenu';
import { createRailPan } from './railPan';
import { createAutoHide, type AutoHideApi } from './autoHide';
import { createTearOff, type TearOffController } from './tearOff';
import { createReorderList } from '@cujuju/solid-reorder-list';

export interface AccordionGroupProps {
  children: JSX.Element;

  /** See `AccordionOrientation`. Default `vertical`. */
  orientation?: AccordionOrientation;
  /** See `AccordionRailSide`. `horizontal` only; ignored otherwise. Default `left`. */
  railSide?: AccordionRailSide;
  /** See `AccordionMode`. Default `natural` — the non-surprising one. */
  mode?: AccordionMode;
  /** See `AccordionAppearance`. Default `flush` — the look this control has
   *  always had, so an existing consumer that says nothing renders unchanged. */
  appearance?: AccordionAppearance;
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
   * Unpinned panels open as a transient OVERLAY anchored to their rail button; pinning
   * promotes one to a real column. `horizontal` only. Default false.
   */
  autoHide?: boolean;

  /**
   * The rail is the BOUNDARY between pinned columns and everything still dynamic. Defaults to
   * `autoHide`, which already implies this layout. `horizontal` only. See DESIGN_NOTES.md
   * § src/AccordionGroup.tsx:82.
   */
  railDivider?: boolean;
  /** With `autoHide`, also open a flyout on hover. Default false — hover is
   *  unavailable to keyboard and touch, so it is an accelerator, never the only
   *  way in. */
  hoverToOpen?: boolean;
  /**
   * How long a hovered activator waits before its flyout opens, ms. Default 350, sized for the
   * horizontal RAIL. See DESIGN_NOTES.md § src/AccordionGroup.tsx:103.
   */
  hoverOpenDelayMs?: number;
  /**
   * What the rail does when its buttons do not fit: `menu` collapses the overflow into a `⋯`
   * menu, `pan` leaves them reachable by dragging.
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

  /** Explicit group extent, any CSS length. Vertical: the group's height. Horizontal: also its
   *  height — rail and columns are full-height, and `fill` divides the WIDTH. */
  height?: string;

  class?: string;
  ariaLabel?: string;

  /** Hands the group's API to the consumer, so `collapseAll()`/`expandAll()` can be driven from
   *  OUTSIDE — `useAccordionGroup()` only reaches descendants. Named `apiRef`, not `ref`. */
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
 * What goes to localStorage. `AccordionLayout` itself rather than a parallel shape: a saved
 * workspace and an auto-persisted session are the same data, so there is one migration story.
 */
type PersistedState = AccordionLayout;

/**
 * Drag activation is skipped on anything matching this. The primitive's default would disable
 * dragging entirely, because the rail ACTIVATOR IS a `<button>` — so the skip is inverted.
 */
const REORDER_SKIP_SELECTOR = '[data-no-drag]';

/** Shared empty array for the torn-off accessor before the controller exists.
 *  A fresh `[]` per call would be a new identity every read and defeat memo
 *  equality downstream. */
const EMPTY_IDS: readonly string[] = [];

/**
 * Read a persisted layout, or null. VERSION-GATED like `setLayout`, because this runs on every
 * page load. See DESIGN_NOTES.md § src/AccordionGroup.tsx:191.
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
  const appearance = (): AccordionAppearance => props.appearance ?? 'flush';
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
   * Open MEMBERSHIP, an array only so persistence has a stable serialisation. The on-screen
   * sequence is `orderIds`. See DESIGN_NOTES.md § src/AccordionGroup.tsx:259.
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
   * Activator elements, REACTIVELY. A flyout reads one during render, before the rail
   * button's ref has fired, so a plain Map answers undefined once and never corrects itself.
   */
  const [headerEls, setHeaderEls] = createSignal<ReadonlyMap<string, HTMLElement>>(new Map());
  /**
   * The `⋯` trigger while the rail overflows. Signal-backed like `headerEls`: read during
   * render as a popover anchor, and it appears and disappears as the dock is resized.
   */
  const [railOverflowEl, setRailOverflowEl] = createSignal<HTMLElement | null>(null);

  /**
   * The id whose activator was holding focus when it was released, until the effect
   * below hands that focus to the panel's stand-in. Written by the slot's `clear`.
   */
  const [refocusPending, setRefocusPending] = createSignal<string | undefined>();

  /**
   * The activators, as a slot. Signal-backed because a flyout resolves its anchor during
   * render, before the ref has fired.
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
      // The LAST moment ownership is knowable: the cleanup runs while the element is
      // still focused. Detached, `document.activeElement` is `<body>` either way.
      if (document.activeElement === el) setRefocusPending(id);
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
   * Is this panel currently an auto-hide OVERLAY rather than a column? Late-bound with a
   * `false` default. See DESIGN_NOTES.md § src/AccordionGroup.tsx:378.
   */
  let isFlyoutId: (id: string) => boolean = () => false;

  /**
   * The group's leaf chain — `parentId` edges published by each `<AccordionLeaf>`. Created
   * before `visualOpenIds`, which consumes it, and bound to `api` below so leaves can find it.
   */
  const leafChain = createLeafChain();

  /** Open ids in USER order: the partition's input. The painted order differs under the divider — read `visualOpenIds` for that. */
  const userOrderOpenIds = createMemo<readonly string[]>(() =>
    orderVisualOpen({
      order: orderIds(),
      open: openList(),
      isLeaf,
      isFlyout: (id) => isFlyoutId(id),
      orderLeaves: leafChain.orderOpen,
    }),
  );

  /**
   * Does any OPEN member absorb the group's surplus? Derived over `userOrderOpenIds` so a
   * CLOSED grower cannot retire the trailing default and leave a dead strip.
   */
  /* Membership only, so the partition's input serves — the partition is not built yet. */
  const hasDeclaredGrower = createMemo<boolean>(() =>
    userOrderOpenIds().some((id) => metaOf(id)?.grow() === true),
  );

  /** Divider mode follows `autoHide` unless the consumer says otherwise — see the
   *  prop's JSDoc for why that is the default rather than a separate opt-in. */
  const railDivider = (): boolean =>
    orientation() === 'horizontal' && (props.railDivider ?? props.autoHide ?? false);

  /**
   * The static/dynamic split and every flex `order`. PIN ORDER is the pinned Set's insertion
   * order, and `togglePin` re-adds on repin, so a re-pinned panel moves to the end.
   */
  const railPartition = createMemo(() =>
    partitionAtRail({
      visualOpen: userOrderOpenIds(),
      pinOrder: [...pinned()],
      isLeaf,
      enabled: railDivider(),
    }),
  );
  const railOrder = (): number => railPartition().railOrder;

  /**
   * Open panels in the sequence they are painted — what a splitter walks, the breadcrumb
   * reads and flex `order` follows. The RULE itself lives in `visualOrder.ts`.
   */
  const visualOpenIds = createMemo<readonly string[]>(() => railPartition().sequence);

  /**
   * THE writer for open membership: `setOpen`, `expandAll`, `collapseAll` and `setLayout` all
   * go through here, which is where the cap is enforced. See DESIGN_NOTES.md
   * § src/AccordionGroup.tsx:468.
   */
  const commitOpen = (next: readonly string[], justOpened?: string): void => {
    const prev = openList();
    const capped = evictForCap(next, justOpened);
    setOpenList(capped);
    persist();
    if (props.onChange === undefined) return;
    // Diff BOTH directions: the interesting event is usually the panel that closed without being
    // clicked. Diffed against the CAPPED result, so an unasked-for eviction is reported.
    for (const id of capped) if (!prev.includes(id)) props.onChange(id, true);
    for (const id of prev) if (!capped.includes(id)) props.onChange(id, false);
  };

  /**
   * THE writer for the pinned set. `setLayout` used to call `setPinnedSet` directly and skip
   * `onPinChange`, so a consumer mirroring pin state went stale on every restore.
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
   * Enforce `maxOpen` by evicting least-recently-opened panels. Pinned panels and leaves are
   * exempt. See DESIGN_NOTES.md § src/AccordionGroup.tsx:517.
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
             * A LEAF is controlled — see `PanelMeta.requestClose`. Editing the open list here would
             * leave the leaf painting while the group believed it closed.
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
    // `append` placement moves the panel within THE order, so the rail follows the column.
    // Called directly after the open commit, so both land as one user-visible step.
    const placeLast = (): void => {
      if (openPlacement() !== 'append' || isLeaf(id)) return;
      moveTo(id, orderIds().length - 1);
    };
    if (policy() === 'multi' || isLeaf(id)) {
      commitOpen([...current, id], id);
      placeLast();
      return;
    }
    // single policy: every PINNED panel already open keeps its slot, then the new panel is
    // APPENDED. Leaves are exempt — a detail pane is the RESULT of the selection just made.
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
    // Two writers, because a drag has intermediate states and a commit does not — see PREVIEW vs
    // COMMIT in `resize.ts`. `previewSizes` moves the signal only; persisted changes go through
    // `commitSizes`.
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
   * Drag-reorder through the project's own vendored primitive, rather than a third hand-rolled
   * pointer drag. Both orientations stack activators vertically, so the axis is 'y' either way.
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
   * Dragging a COLUMN rather than a rail button. A second instance because the two disagree
   * on both inputs: every panel on Y, versus only the open ones on X.
   */
  const draggableColumnIds = (): string[] => visualOpenIds().filter((id) => !isLeaf(id));

  /**
   * Apply a move made in the OPEN subsequence back onto the full order. Closed panels keep
   * their absolute slots: a drag between columns says nothing about where one should go.
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

    /*
         * The static region is ordered by PIN order, so writing only the panel order would paint
         * nothing for a pinned column. Unconditional: among unpinned columns it is a no-op.
         */
    if (railDivider()) {
      commitPinned(
        new Set(repinToVisualOrder({ pinOrder: [...pinned()], nextVisual })),
      );
    }
  };

  const columnReorder = createReorderList({
    ids: draggableColumnIds,
    // Columns lie along the group's main axis. `row-reverse` for a right-docked rail needs no
    // special case: the primitive measures real rects, reading positions not declaration order.
    axis: 'x',
    skipSelector: REORDER_SKIP_SELECTOR,
    stopPropagation: false,
    onReorder: moveOpenTo,
  });

  const [railEl, setRailEl] = createSignal<HTMLElement | undefined>();
  const overflowStrategy = (): 'menu' | 'pan' => props.railOverflow ?? 'menu';

  /**
   * Built BEFORE `api`, which genuinely depends on it: `activatorElOf` has to know whether a
   * panel's button collapsed into the `⋯` menu. Its own inputs are all available here.
   */
  /**
   * The panels the rail is actually serving. Under the divider an OPEN PINNED panel has no
   * button, and a hidden-but-counted one would reserve rail extent it never paints.
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

  /** The rail `tablist`'s single Tab stop: the last-focused tab still on the rail, else the first open, else the first. */
  const [railFocusId, setRailFocusId] = createSignal<string | undefined>();
  const railTabStopId = createMemo<string | undefined>(() => {
    const visible = railOverflow.visibleIds();
    const focused = railFocusId();
    if (focused !== undefined && visible.includes(focused)) return focused;
    return visible.find((id) => openList().includes(id)) ?? visible[0];
  });

  /**
   * Late-bound: `createAutoHide` needs the finished `api`, and `api` needs the auto-hide
   * answers. A mutable reference read through a closure is the smaller lie than a
   * half-populated api object.
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
    hasDeclaredGrower,
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
         * Collapse a column but REMEMBER that it docks. Deliberately NOT the × beside it, which is
         * close-and-FORGET (`closeAndUnpin`); the only difference is whether `pinned` survives.
         */
    collapseKeepPin: (id) => setOpen(id, false),
    /**
         * Close a column AND drop its pin — the ×. Its rail button then reopens it as a flyout,
         * so nothing is left pinned-but-invisible.
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
      // Deliberately a no-op under `single`: "expand all" is not a thing an accordion can do, and
      // switching policy for one click would be surprising.
      if (policy() === 'single') return;
      // Through `commitOpen`, which applies `maxOpen`. This used to open every panel
      // unconditionally, so a group capped at 2 ended up with six columns.
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
      // All-or-nothing. An older shape could be missing a field the group now depends on, and a
      // half-restored dock is harder to diagnose than one that visibly fell back to defaults.
      if (layout.version !== ACCORDION_LAYOUT_VERSION) return false;
      /*
             * FOUR COMMITS, no raw setters. This used to write the signals directly and hand-fire
             * the callbacks it remembered — never `onPinChange`.
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
                         * Two panels sharing an id silently became ONE registration. Reported rather
                         * than thrown. See DESIGN_NOTES.md § src/AccordionGroup.tsx:936.
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
      // Leaves never enter the user order — they are terminal by definition, and dragging one into
      // the rail would put a button on a thing with no activator.
      if (!meta.isLeaf && !orderIds().includes(meta.id)) {
        setOrderIds((prev) => [...prev, meta.id]);
      }
      if (hydrated || !defaultOpen) return;
      // First-wins under `single`: two panels declaring defaultOpen is an author bug, and honouring
      // the LAST would make the initial view depend on child order.
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
      // No manual element purge: every reference is cleared by its slot's cleanup. The ORDER
            // entry survives a remount; a LEAF's open state does not. See DESIGN_NOTES.md
            // § src/AccordionGroup.tsx:984.
      if (wasLeaf && openList().includes(id)) {
        commitOpen(openList().filter((v) => v !== id));
      }
    },

    activators,

    railOverflowSlot,

    // The fallback is the whole point — a panel whose rail button collapsed into the `⋯` menu is
    // REPRESENTED by that trigger, so that is what a flyout anchors to.
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
    /* The VERTICAL activator is the panel's own header bar, which the panel renders, so
           the hover-intent listeners reach it through the group. Same object either way. */
    activatorHoverProps: (id) => autoHideApi?.activatorHoverProps(id) ?? {},
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
      // Through `activatorElOf`, so arrowing onto a panel whose button collapsed focuses that
      // trigger rather than focusing nothing — which is what a raw `headerEls` read did.
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

  /**
   * Hands focus dropped by a latched release to the panel's stand-in (e.g. the `⋯`
   * trigger). Never acts without the latch; drops it once no stand-in can arrive.
   */
  createEffect(() => {
    const focused = refocusPending();
    if (focused === undefined) return;
    // Someone claimed the dropped focus first; the latch is stale, not a mandate.
    if (document.activeElement !== document.body) {
      setRefocusPending(undefined);
      return;
    }
    // The stand-in resolves a cycle late: `overflowIds` and the trigger's own ref
    // settle after the button leaves the rail. Stay latched and retry on that change.
    const el = api.activatorElOf(focused);
    if (el === undefined) {
      // A removed panel never gets a stand-in; left latched, its remount would take focus.
      if (api.meta(focused) === undefined) setRefocusPending(undefined);
      return;
    }
    setRefocusPending(undefined);
    el.focus();
  });

  createRailPan({
    railEl,
    group: api,
    // Mutually exclusive by construction: under `menu` the rail never overflows, so there is
    // nothing to pan and the listeners are not attached at all.
    enabled: () => orientation() === 'horizontal' && overflowStrategy() === 'pan',
  });

  const autoHide: AutoHideApi = createAutoHide({
    group: api,
    enabled: () => props.autoHide === true,
    hoverToOpen: () => props.hoverToOpen === true,
    hoverOpenDelayMs: () => props.hoverOpenDelayMs,
  });

  autoHideApi = autoHide;
  // Closes the late-binding described at `isFlyoutId`'s declaration. From here on
  // `visualOpenIds` sees flyouts for what they are — overlays, not columns.
  isFlyoutId = (id) => autoHide.isFlyout(id);

  /**
   * Publish the chain against the finished api, the only handle a leaf and its group both
   * hold. Until this call every `<AccordionLeaf parentId>` painted in open order.
   */
  bindLeafChain(api, leafChain);

  tearOffApi = createTearOff({
    // The OS window chrome is a torn-off panel's ONLY label, so a non-string title must degrade
    // to something identifiable rather than "[object Object]". The id is the honest fallback.
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
        /* Chrome only — every rule keyed off this lives in `styles.css`, and no
           behaviour anywhere branches on it. */
        data-appearance={appearance()}
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
        {/* The rail exists only in `horizontal`, and the GROUP owns it, not the panels: every
                    activator lives in ONE stacked strip regardless of where its column is. */}
        <Show when={orientation() === 'horizontal'}>
          <div
            ref={setRailEl}
            class="acc-rail"
            /* The rail's slot is COMPUTED under the divider, sitting after the static columns.
                           Written as a style so the one number the layout turns on has a single source. */
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
            /* Under `multi` several tabs are selected at once, which a plain tablist does
                           not allow — a reader announcing two selected tabs is being told
                           something contradictory. */
            aria-multiselectable={policy() === 'multi' ? 'true' : undefined}
            /* NAME MUST MATCH `rail.css`, which selects `data-overflow-mode`. This emitted
                           `data-overflow`, so every overflow-strategy rule was inert and the rail's
                           base `overflow-y: auto` stood in both strategies. */
            data-overflow-mode={overflowStrategy()}
          >
            <For each={railOverflow.visibleIds()}>
              {(id) => {
                const meta = (): PanelMeta | undefined => api.meta(id);
                return (
                  <Show when={meta()}>
                    {(m) => (
                      <RailButton
                        group={api}
                        meta={m()}
                        autoHide={autoHide}
                        tabStop={() => railTabStopId() === id}
                        onTabFocus={() => setRailFocusId(id)}
                      />
                    )}
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

        {/* Soaks up the leftover space when nothing is open, so the header stack sits
                    flush at the start of the group instead of being stretched apart. */}
        <div class="acc-filler" aria-hidden="true" />

        {/* Every open flyout's popover lives here. Rendered once, inside the group,
            so it inherits the group's token scope for anything not portalled. */}
        {autoHide.element}
      </div>
    </AccordionGroupContext.Provider>
  );
}
