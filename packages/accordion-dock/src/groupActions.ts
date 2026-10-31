import type { AccordionGroupProps } from './AccordionGroup.types';
import { type AccordionOpenPlacement, type AccordionPolicy } from './context';
import { createGroupOrder } from './groupOrder';
import { createGroupState } from './groupState';

export function createGroupActions(deps: {
  openList: ReturnType<typeof createGroupState>['openList'];
  setOpenList: ReturnType<typeof createGroupState>['setOpenList'];
  persist: ReturnType<typeof createGroupState>['persist'];
  props: AccordionGroupProps;
  pinned: ReturnType<typeof createGroupState>['pinned'];
  setPinnedSet: ReturnType<typeof createGroupState>['setPinnedSet'];
  isLeaf: ReturnType<typeof createGroupState>['isLeaf'];
  metaOf: ReturnType<typeof createGroupState>['metaOf'];
  openPlacement: () => AccordionOpenPlacement;
  orderIds: ReturnType<typeof createGroupState>['orderIds'];
  policy: () => AccordionPolicy;
  setSizesRaw: ReturnType<typeof createGroupState>['setSizesRaw'];
  setOrderIds: ReturnType<typeof createGroupState>['setOrderIds'];
  railDivider: ReturnType<typeof createGroupOrder>['railDivider'];
}) {
  const {
    openList,
    setOpenList,
    persist,
    props,
    pinned,
    setPinnedSet,
    isLeaf,
    metaOf,
    openPlacement,
    orderIds,
    policy,
    setSizesRaw,
    setOrderIds,
    railDivider,
  } = deps;
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

  /** THE writer for the pinned set. See DESIGN_NOTES.md § src/AccordionGroup.tsx:497. */
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
  const evictForCap = (
    next: readonly string[],
    justOpened?: string,
  ): readonly string[] => {
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
      /* A LEAF is controlled — see `PanelMeta.requestClose`. See DESIGN_NOTES.md § src/AccordionGroup.tsx:553. */
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
    // Under the divider pinned columns paint in PIN order, so the move must reach it too:
    // the moved pin goes before the first pin that now follows it.
    if (railDivider() && pinned().has(id)) {
      const pins = [...pinned()].filter((p) => p !== id);
      const nextPin = cur.slice(clamped + 1).find((p) => pins.includes(p));
      pins.splice(nextPin === undefined ? pins.length : pins.indexOf(nextPin), 0, id);
      commitPinned(new Set(pins));
    }
  };

  return {
    commitOpen,
    commitPinned,
    evictForCap,
    setOpen,
    commitSizes,
    commitOrder,
    moveTo,
  };
}
