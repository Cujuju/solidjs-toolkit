/**
 * The two rules deciding which panels are where, and which survive a bulk close — as PURE
 * functions. See DESIGN_NOTES.md § src/visualOrder.ts:1.
 */

/** The predicates a rule needs about one panel. Passed in rather than read off a group, so
 *  these stay callable from a test with no group at all. */
export interface PanelPredicates {
  /** A terminal detail pane: no activator, not reorderable, and the RESULT of a
   *  selection rather than a thing the user toggled. */
  isLeaf: (id: string) => boolean;
  /** Currently an auto-hide OVERLAY rather than a docked column. */
  isFlyout?: (id: string) => boolean;
}

export interface VisualOrderInput extends PanelPredicates {
  /** THE user order — every registered non-leaf panel, rail order and column
   *  order at once. */
  order: readonly string[];
  /** Open membership, in the sequence panels were opened. */
  open: readonly string[];
  /**
   * Sort the open LEAF ids into chain order. Optional and identity by default, because a dock
   * that never sets `parentId` needs no chain.
   */
  orderLeaves?: (openLeafIds: readonly string[]) => readonly string[];
}

/**
 * Open panels in PAINTED order: non-leaf panels in user order, then leaves in chain order.
 * Flying-out panels are excluded. See DESIGN_NOTES.md § src/visualOrder.ts:51.
 */
export function orderVisualOpen(input: VisualOrderInput): readonly string[] {
  const isFlyout = input.isFlyout ?? (() => false);
  const open = input.open.filter((id) => !isFlyout(id));

  const leafIds = open.filter((id) => input.isLeaf(id));
  const orderedLeaves = input.orderLeaves === undefined ? leafIds : input.orderLeaves(leafIds);

  const normal = input.order.filter((id) => open.includes(id) && !input.isLeaf(id));
  return [...normal, ...orderedLeaves];
}

/**
 * THE RAIL AS A DIVIDER. `pinned` means "opens as a docked COLUMN", not "is open". See
 * DESIGN_NOTES.md § src/visualOrder.ts:84.
 */
export interface RailPartitionInput {
  /** Open ids in painted order — `orderVisualOpen`'s output. */
  visualOpen: readonly string[];
  /** Pinned ids in PIN order (the order they were pinned in). */
  pinOrder: readonly string[];
  isLeaf: (id: string) => boolean;
  /** Off → every open panel is dynamic and the rail keeps its fixed edge. */
  enabled: boolean;
}

export interface RailPartition {
  /** Open pinned columns, in pin order — painted BEFORE the rail. */
  staticIds: readonly string[];
  /** Everything else open, in painted order — after the rail. */
  dynamicIds: readonly string[];
  /** The painted sequence — `staticIds` then `dynamicIds`, the order the flex `order` values
   *  encode. */
  sequence: readonly string[];
  /** Flex `order` for the rail itself: after the static run, before the rest. */
  railOrder: number;
  /** Flex `order` per open id. */
  orderOf: (id: string) => number;
  /**
   * Is this column hard against a boundary, so it drops its own separator? TWO qualify under
   * the divider. See DESIGN_NOTES.md § src/visualOrder.ts:139.
   */
  isEdgeColumn: (id: string) => boolean;
}

/**
 * Split the open panels either side of the rail and return every flex `order` the layout
 * needs. Orders start at 1: slot 0 is left free for arbitrary consumer children.
 */
export function partitionAtRail(input: RailPartitionInput): RailPartition {
  const open = input.visualOpen;
  const staticIds = input.enabled
    ? input.pinOrder.filter((id) => open.includes(id) && !input.isLeaf(id))
    : [];
  const staticSet = new Set(staticIds);
  const dynamicIds = open.filter((id) => !staticSet.has(id));

  // The rail sits in the slot straight after the static run — with the divider off, slot 1,
  // which is where the stylesheet's fixed `order: -1` used to put it.
  const railOrder = staticIds.length + 1;

  const orders = new Map<string, number>();
  staticIds.forEach((id, i) => orders.set(id, i + 1));
  dynamicIds.forEach((id, i) => orders.set(id, railOrder + 1 + i));

  return {
    staticIds,
    dynamicIds,
    sequence: [...staticIds, ...dynamicIds],
    railOrder,
    // Unopened panels never paint, so their slot is irrelevant; 0 keeps them out
    // of the numbered run rather than colliding with a real column.
    orderOf: (id) => orders.get(id) ?? 0,
    isEdgeColumn: (id) => {
      const o = orders.get(id);
      if (o === undefined) return false;
      return o === 1 || o === railOrder + 1;
    },
  };
}

/**
 * Rewrite the pin order to agree with a sequence the user dragged: the static region re-sorts
 * by PIN order. See DESIGN_NOTES.md § src/visualOrder.ts:196.
 */
export function repinToVisualOrder(input: {
  /** Current pin order. */
  pinOrder: readonly string[];
  /** The new painted sequence of open, non-leaf columns. */
  nextVisual: readonly string[];
}): readonly string[] {
  const pinnedSet = new Set(input.pinOrder);
  const visible = input.nextVisual.filter((id) => pinnedSet.has(id));
  const visibleSet = new Set(visible);
  const offscreen = input.pinOrder.filter((id) => !visibleSet.has(id));
  return [...visible, ...offscreen];
}

/**
 * Should this panel show a rail button? The one-line rule from the state model, as a function,
 * because three places need the answer.
 */
export function showsRailButton(
  id: string,
  p: { isOpen: (id: string) => boolean; isPinned: (id: string) => boolean; enabled: boolean },
): boolean {
  if (!p.enabled) return true;
  return !(p.isOpen(id) && p.isPinned(id));
}

/**
 * Does this panel survive a BULK close? Two exemptions: PINNED and LEAVES. Neither applies to
 * an EXPLICIT close. See DESIGN_NOTES.md § src/visualOrder.ts:250.
 */
export function survivesBulkClose(id: string, p: PanelPredicates & {
  isPinned: (id: string) => boolean;
}): boolean {
  return p.isPinned(id) || p.isLeaf(id);
}

/**
 * The complement: open panels a bulk close WILL take, derived from the same predicate rather
 * than hand-inverted.
 */
export function bulkClosableIds(
  openIds: readonly string[],
  p: PanelPredicates & { isPinned: (id: string) => boolean },
): readonly string[] {
  return openIds.filter((id) => !survivesBulkClose(id, p));
}
