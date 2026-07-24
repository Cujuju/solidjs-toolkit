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
import { createResize, DEFAULT_MIN_SIZE_PX } from './resize';
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

  const headerEls = new Map<string, HTMLElement>();
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
   * Open panels in the sequence they are painted — the order a splitter walks to
   * find its neighbour.
   *
   * horizontal: open order, because that is literally the column order.
   * vertical:   user order filtered to open, because vertical panels keep their
   *             declared/dragged positions and only their height changes.
   * Leaves are appended last in both cases; a terminal detail pane is terminal.
   */
  const visualOpenIds = createMemo<readonly string[]>(() => {
    const open = openList();
    const leafIds = open.filter((id) => isLeaf(id));
    const normal = orderIds().filter((id) => open.includes(id) && !isLeaf(id));
    return [...normal, ...leafIds];
  });

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
      commitOpen(openList().filter((id) => pinned().has(id) || isLeaf(id)));
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
      headerEls.delete(id);
      panelEls.delete(id);
      // The ORDER entry deliberately survives: a panel that unmounts and remounts
      // (a route change, a `<Show>`) must come back where the user put it, not at
      // the end of the rail.
    },

    setHeaderEl: (id, el) => {
      if (el === null) headerEls.delete(id);
      else headerEls.set(id, el);
    },

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
      headerEls.get(order[target].id)?.focus();
    },

    reorderItemProps: (id) =>
      reorderable() ? (reorder.itemProps(id) as Record<string, unknown>) : {},
    reorderActiveId: reorder.activeId,
  };

  props.apiRef?.(api);

  return (
    <AccordionGroupContext.Provider value={api}>
      <div
        class={`vsa-group ${props.class ?? ''}`.trim()}
        data-orientation={orientation()}
        data-rail-side={railSide()}
        data-mode={mode()}
        data-policy={policy()}
        data-density={props.density ?? 'comfortable'}
        data-animated={props.animated ? 'true' : 'false'}
        data-depth={depth}
        data-resizing={resize.resizing() ? 'true' : 'false'}
        role="region"
        aria-label={props.ariaLabel}
        style={props.height !== undefined ? { height: props.height } : undefined}
      >
        {/* The rail exists only in `horizontal`, and it is the GROUP that owns it —
            not the panels. The whole point of this orientation is that every panel's
            activator lives in ONE stacked strip regardless of where (or whether) its
            column is rendered, which a per-panel header physically cannot do. */}
        <Show when={orientation() === 'horizontal'}>
          <div class="vsa-rail" role="tablist" aria-orientation="vertical">
            <For each={api.panels()}>{(meta) => <RailButton group={api} meta={meta} />}</For>
          </div>
        </Show>

        {props.children}

        {/* Soaks up the leftover space when nothing is open, so the header stack (or
            the rail) sits flush at the start of the group instead of being stretched
            apart by the flex container. */}
        <div class="vsa-filler" aria-hidden="true" />
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
function RailButton(props: { group: AccordionGroupApi; meta: PanelMeta }): JSX.Element {
  const open = (): boolean => props.group.isOpen(props.meta.id);
  const pinned = (): boolean => props.group.isPinned(props.meta.id);
  const onKeyDown = createActivatorKeyDown(props.group, () => props.meta.id);
  const dragProps = (): Record<string, unknown> => props.group.reorderItemProps(props.meta.id);

  return (
    <button
      {...dragProps()}
      ref={(el) => {
        props.group.setHeaderEl(props.meta.id, el);
        // The reorder primitive registers its own node via `itemProps.ref`; Solid
        // lets the later `ref` win, so it is called through explicitly rather than
        // silently dropped.
        const viaDrag = dragProps().ref as ((e: HTMLElement) => void) | undefined;
        viaDrag?.(el);
      }}
      type="button"
      class={`vsa-rail-btn ${props.meta.railClass() ?? ''}`.trim()}
      role="tab"
      title={props.meta.tooltip()}
      aria-selected={open()}
      data-open={open() ? 'true' : 'false'}
      data-pinned={pinned() ? 'true' : 'false'}
      style={props.meta.accent() !== undefined ? { '--vsa-accent': props.meta.accent() } : undefined}
      onClick={() => props.group.toggle(props.meta.id)}
      onKeyDown={onKeyDown}
    >
      <Show when={pinned()}>
        <span class="vsa-rail-pin" aria-hidden="true">
          <Pin />
        </span>
      </Show>
      <Show when={props.meta.icon()}>
        <span class="vsa-rail-icon">{props.meta.icon()}</span>
      </Show>
      <span class="vsa-rail-label">{props.meta.railLabel() ?? props.meta.title()}</span>
      <Show when={props.meta.count() !== undefined}>
        <span class="vsa-rail-count">{props.meta.count()}</span>
      </Show>
    </button>
  );
}
