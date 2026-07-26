/**
 * The two rules that decide WHICH panels are where, and which survive a bulk
 * close. Both were previously inline expressions inside `AccordionGroup`, which
 * meant every other consumer had to re-derive them:
 *
 *   - the visual order had 2 implementations (the group, and the test stub);
 *   - the bulk-close exemption had 3 (the group's `collapseAll`, `panelMenu`'s
 *     `bulkClosableIds` holding the inverse, and the stub).
 *
 * A duplicated rule is not a tidiness problem here, it is a correctness one, and
 * `panelMenu` said so out loud before this file existed: its copy "only PREDICTS"
 * what `collapseAll` will do, and it uses that prediction to grey out a menu row.
 * A prediction that drifts is a row that disables when the action would have
 * worked, or offers an action that does nothing.
 *
 * So the rules live here, as PURE FUNCTIONS over plain data. Nothing in this file
 * reads a signal, touches the DOM, or knows what Solid is — which is what lets the
 * group, the menu and a hand-built test stub all call the same code instead of
 * agreeing to behave the same way.
 */

/** The predicates a rule needs about one panel. Passed in rather than read off a
 *  group so these functions stay callable from anywhere — including a test that
 *  has no group at all. */
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
   * Sort the open LEAF ids into chain order (`file → symbol → reference`).
   *
   * Optional, and identity by default, because a dock with no chained leaves —
   * which is every dock that never sets `parentId` — needs no chain at all. When
   * a chain IS present this is `LeafChain.orderOpen`, and passing it here is the
   * whole reason chained leaves paint in declaration order rather than in
   * whatever order the user happened to open them.
   */
  orderLeaves?: (openLeafIds: readonly string[]) => readonly string[];
}

/**
 * Open panels in the sequence they are PAINTED — the order a splitter walks to
 * find its neighbour, the breadcrumb reads, and the flex `order` follows.
 *
 * The sequence is: non-leaf panels in user order, then leaves in chain order.
 *
 * Leaves last because a terminal detail pane is terminal; a leaf that sorted into
 * the middle would put a file's detail view between two folders. Non-leaves in
 * USER order rather than open order because there is exactly one order in this
 * control and both the rail and the columns render from it — that is what makes
 * dragging either representation move the other.
 *
 * FLYING-OUT PANELS ARE EXCLUDED, and that is the definition doing its job rather
 * than a special case bolted onto it: an auto-hide flyout is an overlay the
 * columns deliberately do not reflow around, so it is not IN the painted
 * sequence. Including it was a real defect with three symptoms, all of which
 * traced back to this one rule — a splitter got handed a neighbour with no box
 * (the drag seeded a start size of 0 and jumped by the min-size clamp), a flex
 * `order` slot was spent on something that is not a flex item, and the
 * first-column marker landed on the flyout instead of the column against the
 * rail.
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
 * THE RAIL AS A DIVIDER between a static and a dynamic region.
 *
 * ── The state model this implements ─────────────────────────────────────────
 * `pinned` does NOT mean "is open". It means "opens as a docked COLUMN rather
 * than as a flyout". Open/closed is an independent axis, which gives four states
 * and a home for each:
 *
 *   open + pinned    → a docked column, sitting BEHIND the rail (static region).
 *                      No rail button: the column IS the panel's presence, and a
 *                      button that only ever re-reveals something already on
 *                      screen is a control with nothing to do.
 *   closed + pinned  → a rail button that reopens AS A COLUMN. This is the state
 *                      the column title bar's own activator produces, and the
 *                      reason `pinned` had to stop meaning "open": collapsing a
 *                      docked column must not throw away the fact that it docks.
 *   open + unpinned  → a flyout overlaying the dynamic region.
 *   closed + unpinned→ a rail button that reopens as a flyout.
 *
 * So: A RAIL BUTTON IS SHOWN WHENEVER THE PANEL IS CLOSED, and hidden only when
 * it is open AND pinned. Nothing can be stranded, in any combination.
 *
 * ── Why the static region comes first, and in PIN order ─────────────────────
 * Pinning is the user saying "this one stays put". The pinned columns therefore
 * take the group's leading edge, the rail slides to sit immediately after them,
 * and everything still dynamic — the flyouts, which overlay from the rail
 * onwards, and the leaf — lives past it. The rail stops being chrome bolted to
 * one edge and becomes the boundary between what is frozen and what moves.
 *
 * PIN order, not panel order: the sequence records the order the user froze
 * things in, so a newly pinned column appears at the end of the static run
 * instead of jumping into the middle of a layout the user just arranged. Re-
 * pinning an already-pinned panel moves it to the end for the same reason.
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
  /** Flex `order` for the rail itself: after the static run, before the rest. */
  railOrder: number;
  /** Flex `order` per open id. */
  orderOf: (id: string) => number;
  /**
   * Is this column hard against a boundary, so it must drop its own separator?
   *
   * TWO columns qualify under the divider, not one: the leading STATIC column
   * (against the group's outer edge, where the rail used to be) and the first
   * DYNAMIC column (against the rail itself). Either would otherwise draw a
   * border a pixel away from an edge that already has one.
   *
   * With the divider off there is no static run, so this reduces to "the column
   * immediately after the rail" — exactly the single case the attribute meant
   * before, which is why the group needs no branch for the two layouts.
   */
  isEdgeColumn: (id: string) => boolean;
}

/**
 * Split the open panels either side of the rail and hand back every flex
 * `order` the layout needs.
 *
 * Orders start at 1, never 0: an element with no `order` sits at 0, and the
 * group deliberately lets consumers drop arbitrary children into it (a toolbar,
 * a status strip). Leaving slot 0 free is what keeps those children where they
 * were authored instead of silently promoting them ahead of the first column.
 */
export function partitionAtRail(input: RailPartitionInput): RailPartition {
  const open = input.visualOpen;
  const staticIds = input.enabled
    ? input.pinOrder.filter((id) => open.includes(id) && !input.isLeaf(id))
    : [];
  const staticSet = new Set(staticIds);
  const dynamicIds = open.filter((id) => !staticSet.has(id));

  // The rail sits in the slot straight after the static run. With the divider
  // off, that is slot 1 — ahead of every column, which is exactly where the
  // stylesheet's fixed `order: -1` used to put it.
  const railOrder = staticIds.length + 1;

  const orders = new Map<string, number>();
  staticIds.forEach((id, i) => orders.set(id, i + 1));
  dynamicIds.forEach((id, i) => orders.set(id, railOrder + 1 + i));

  return {
    staticIds,
    dynamicIds,
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
 * Rewrite the pin order so it agrees with a sequence the user just dragged.
 *
 * ── Why this function has to exist ──────────────────────────────────────────
 * Two systems were both claiming the painted sequence and one silently won. A
 * drag commits into the panel `order`, which `orderVisualOpen` honours — but
 * `partitionAtRail` then re-sorts the static region by PIN order, so for a pinned
 * column the drag committed and changed nothing on screen. In a dock where every
 * column is pinned (which is the point of pinning) that reads as drag-to-reorder
 * being dead, with no error and no clue.
 *
 * The resolution is not to drop pin order — the static sequence genuinely IS pin
 * order, that is what makes a newly frozen column land at the end of the frozen
 * run instead of jumping into the middle. It is that pin order is STORAGE for
 * that sequence, so the drag must write to it. The reorder decides the sequence;
 * the partition only decides where the rail splits it.
 *
 * Pinned-but-CLOSED panels keep their existing relative order at the end: they
 * are not on screen, so a drag between two visible columns carries no information
 * about where they belong — the same reasoning `moveOpenTo` already applies to
 * closed panels in the panel order.
 *
 * A drag that touches no pinned column returns an equivalent order, so callers
 * can apply this unconditionally rather than testing whether it was needed.
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
 * Should this panel show a rail button?
 *
 * The one-line rule from the state model above, as a function, because three
 * different places need the answer (the rail's own id list, the overflow menu,
 * and the tests) and a rule with three implementations is a rule with three
 * chances to disagree.
 */
export function showsRailButton(
  id: string,
  p: { isOpen: (id: string) => boolean; isPinned: (id: string) => boolean; enabled: boolean },
): boolean {
  if (!p.enabled) return true;
  return !(p.isOpen(id) && p.isPinned(id));
}

/**
 * Does this panel survive a BULK close (`collapseAll`, "Close All", "Close
 * Others")?
 *
 * Two exemptions, and both are about the same distinction — a bulk close is
 * something that happens to a panel as a side effect of an action aimed
 * elsewhere, so it spares anything the user has said is not collateral:
 *
 *   - PINNED is the entire point of the pin in this control. The pin exempts a
 *     panel from AUTOMATIC collapse, which is what this is.
 *   - LEAVES are the RESULT of the selection the user just made. Sweeping them
 *     away would discard the thing their last click produced.
 *
 * Neither exemption applies to an EXPLICIT close — a panel's own ×, or a
 * breadcrumb truncation — which is why those paths call `setOpen` directly and
 * never consult this.
 */
export function survivesBulkClose(id: string, p: PanelPredicates & {
  isPinned: (id: string) => boolean;
}): boolean {
  return p.isPinned(id) || p.isLeaf(id);
}

/**
 * The complement: open panels a bulk close WILL take.
 *
 * Exists so a caller that needs the victims (to disable a menu row when there are
 * none, or to close everything except one panel) derives them from the same
 * predicate rather than hand-inverting it. Hand-inverting is exactly how the menu
 * and the group drifted apart before this file.
 */
export function bulkClosableIds(
  openIds: readonly string[],
  p: PanelPredicates & { isPinned: (id: string) => boolean },
): readonly string[] {
  return openIds.filter((id) => !survivesBulkClose(id, p));
}
