import { createMemo, createSignal } from 'solid-js';
import type { AccordionGroupProps } from './AccordionGroup.types';
import {
  ACCORDION_LAYOUT_VERSION,
  createMapSlot,
  type ElementSlot,
  type PanelMeta,
} from './context';
import { readPersisted, writePersisted, type PersistedState } from './persistence';

export function createGroupState(deps: { props: AccordionGroupProps }) {
  const { props } = deps;
  const persisted = readPersisted(props.storageKey);
  /** True once a layout was restored (localStorage or `setLayout`): later `defaultOpen`
   *  registrations are IGNORED, because a remembered state outranks an author default. */
  const hydration = { value: persisted !== null };

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

  /** Store activator elements reactively so flyouts update when rail button refs arrive. See DESIGN_NOTES.md § src/AccordionGroup.tsx:281. */
  const [headerEls, setHeaderEls] = createSignal<ReadonlyMap<string, HTMLElement>>(
    new Map(),
  );
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
    const state: PersistedState = {
      // Stamped, so `readPersisted` has something to gate on. Same constant the
      // explicit `getLayout`/`setLayout` pair uses — one version for one shape.
      version: ACCORDION_LAYOUT_VERSION,
      open: [...openList()],
      pinned: [...pinned()],
      order: [...orderIds()],
      sizes: { ...sizes() },
    };
    writePersisted(props.storageKey, state);
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

  return {
    persisted,
    hydration,
    openList,
    setOpenList,
    pinned,
    setPinnedSet,
    orderIds,
    setOrderIds,
    sizes,
    setSizesRaw,
    metaMap,
    setMetaMap,
    headerEls,
    setHeaderEls,
    railOverflowEl,
    setRailOverflowEl,
    refocusPending,
    setRefocusPending,
    activators,
    railOverflowSlot,
    panelEls,
    panelElements,
    persist,
    metaOf,
    isLeaf,
    panels,
    leaves,
  };
}
