/**
 * MOCK — same status as the rest of this directory.
 *
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
