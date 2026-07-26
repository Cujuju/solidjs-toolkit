import { createSignal, type Accessor } from 'solid-js';
import type { AccordionGroupApi } from './context';

/**
 * The parent→child structure of a LEAF CHAIN: file → symbol → reference.
 *
 * A leaf is still terminal in every way that matters to the rail (no button, not
 * reorderable, exempt from auto-collapse). What it gains here is the ability to be
 * a WAYPOINT: selecting something inside leaf A opens leaf B to its side, and both
 * stay leaves. That needs exactly one fact the group does not already hold —
 * "whose child is this?" — and this file is where that fact lives.
 *
 * WHY A SEPARATE REGISTRY RATHER THAN A `PanelMeta.parentId` FIELD
 *
 * `PanelMeta` is the honest long-term home: `parentId` is registration metadata,
 * exactly like `isLeaf`. It is not here because of a design argument, it is here
 * because `context.ts` and `AccordionGroup.tsx` are being edited concurrently by
 * another author, and widening a shared interface across that boundary is how two
 * correct changes produce one broken merge. The migration is mechanical and is
 * written up in this phase's handoff — nothing below depends on the registry
 * being a WeakMap rather than a field.
 *
 * WHY THE ORDER CANNOT COME FROM THE OPEN LIST
 *
 * Today `visualOpenIds` appends leaves in open-list order, which happens to be
 * chain order in the common case — a child can only be opened by a selection made
 * in its parent, so the parent got there first. "Happens to be" is the problem.
 * That coincidence holds only while a set of invariants nobody enforces all hold
 * at once: every close cascades, JSX declaration order matches chain order, and a
 * persisted open list round-trips unmodified. Break any one — reopen a parent
 * while a child is still open and the list reads `[child, parent]` — and the
 * columns silently paint backwards. Worse, `visualOpenIds` also feeds
 * `neighborOpenId` (which column a splitter resizes against) and the breadcrumb
 * path, so a wrong order is not merely cosmetic.
 *
 * A declared parent cannot drift. It is derived from a prop the author wrote, so
 * the order is a fact rather than a consequence.
 */

/**
 * One group's chain links, child id → parent id.
 *
 * Reactive: a leaf declares its link in an effect, and `visualOpenIds` is a memo
 * that reads it, so a chain that changes shape re-sorts the columns without any
 * explicit invalidation.
 */
export interface LeafChain {
  /** The raw map. Exposed for tests and for a consumer inspecting the structure. */
  links: Accessor<ReadonlyMap<string, string>>;
  /** Declare `childId`'s parent. Re-linking to a different parent is allowed —
   *  the structure follows the props, and props change. */
  link: (childId: string, parentId: string) => void;
  unlink: (childId: string) => void;
  parentOf: (childId: string) => string | undefined;
  /**
   * Ancestor count: 0 for a leaf with no declared parent, +1 per hop.
   *
   * Returns the hops walked so far if a cycle is hit, rather than looping — see
   * `walkAncestors`.
   */
  depthOf: (id: string) => number;
  /**
   * Sort the OPEN leaf ids into chain order. This is the whole reason the
   * registry exists; see the module comment.
   */
  orderOpen: (openLeafIds: readonly string[]) => string[];
}

/**
 * Walk `id`'s ancestors, nearest first, stopping at the first repeat.
 *
 * The visited set is the ONLY termination guarantee this file needs, and it is
 * why there is no depth cap anywhere in the chain implementation: a malformed
 * `parentId` (a typo producing A→B→A) is bounded structurally rather than by a
 * number someone picked. See the handoff note on depth for why a numeric cap
 * would be strictly worse than none.
 */
function walkAncestors(
  links: ReadonlyMap<string, string>,
  id: string,
): string[] {
  const seen = new Set<string>([id]);
  const out: string[] = [];
  let cursor = links.get(id);
  while (cursor !== undefined && !seen.has(cursor)) {
    seen.add(cursor);
    out.push(cursor);
    cursor = links.get(cursor);
  }
  return out;
}

export function createLeafChain(): LeafChain {
  const [links, setLinks] = createSignal<ReadonlyMap<string, string>>(new Map());

  const link = (childId: string, parentId: string): void => {
    setLinks((prev) => {
      if (prev.get(childId) === parentId) return prev;
      const next = new Map(prev);
      next.set(childId, parentId);
      return next;
    });
  };

  const unlink = (childId: string): void => {
    setLinks((prev) => {
      if (!prev.has(childId)) return prev;
      const next = new Map(prev);
      next.delete(childId);
      return next;
    });
  };

  const parentOf = (childId: string): string | undefined => links().get(childId);

  const depthOf = (id: string): number => walkAncestors(links(), id).length;

  /**
   * Depth-first preorder over the open leaves, roots first.
   *
   * Preorder rather than a depth sort, because a depth sort interleaves
   * independent chains: two chains X0→X1 and Y0 would paint X0, Y0, X1, splitting
   * X's columns around Y's. Preorder keeps every chain CONTIGUOUS, which is what
   * "paints in chain order" has to mean once more than one chain can be open.
   *
   * A leaf is a ROOT here when its declared parent is not itself an open leaf.
   * That deliberately covers three cases with one test: no parent declared, a
   * parent that is a PANEL rather than a leaf (a legitimate and useful link — see
   * `AccordionLeafProps.parentId`), and a parent that is closed or unregistered.
   * All three mean the same thing for layout: nothing open precedes this leaf.
   */
  const orderOpen = (openLeafIds: readonly string[]): string[] => {
    const map = links();
    const openSet = new Set(openLeafIds);

    // Children by parent, in open-list order — so a leaf with two open children
    // (a fork in the chain) emits them in the order they were opened.
    const childrenOf = new Map<string, string[]>();
    for (const id of openLeafIds) {
      const parent = map.get(id);
      if (parent === undefined || !openSet.has(parent)) continue;
      const bucket = childrenOf.get(parent);
      if (bucket === undefined) childrenOf.set(parent, [id]);
      else bucket.push(id);
    }

    const emitted = new Set<string>();
    const out: string[] = [];
    const emit = (id: string): void => {
      // Doubles as the cycle guard: a link loop can never re-enter a node that
      // has already been placed, so the walk terminates on any input.
      if (emitted.has(id)) return;
      emitted.add(id);
      out.push(id);
      for (const child of childrenOf.get(id) ?? []) emit(child);
    };

    for (const id of openLeafIds) {
      const parent = map.get(id);
      if (parent !== undefined && openSet.has(parent)) continue;
      emit(id);
    }

    // Anything left is part of a cycle with no root to enter from. It is appended
    // in open order rather than dropped: a malformed chain should degrade to the
    // OLD behaviour, never to a missing column.
    for (const id of openLeafIds) if (!emitted.has(id)) out.push(id);

    return out;
  };

  return { links, link, unlink, parentOf, depthOf, orderOpen };
}

/**
 * The chain belongs to a GROUP, and the only handle both the group and its leaves
 * share is the group's own API object — which is stable for the group's lifetime.
 * A WeakMap keyed on it attaches the chain without widening `AccordionGroupApi`,
 * and releases it when the group is collected.
 */
const chains = new WeakMap<AccordionGroupApi, LeafChain>();
/** Groups already warned about, so an unwired group complains once, not per leaf. */
const warned = new WeakSet<AccordionGroupApi>();

/** Called by `AccordionGroup` immediately after its `api` object is built. */
export function bindLeafChain(group: AccordionGroupApi, chain: LeafChain): void {
  chains.set(group, chain);
}

/**
 * The group's chain, for a leaf to write its link into.
 *
 * Falls back to a private, unshared chain when the group has not been wired yet,
 * rather than throwing. The reasoning is about failure SHAPE: cascade-close and
 * the render gate are computed from props and `isOpen`, so they are correct with
 * or without the registry. Only the leaf ORDER degrades — back to exactly the
 * open-list order the control shipped with. Throwing would take a working
 * single-leaf dock down over a feature it does not use; the old behaviour plus a
 * warning is the proportionate failure.
 *
 * The warning is deferred to the first actual `link()` rather than raised here,
 * because "unwired" only MATTERS once something is chained. Every existing dock
 * calls this function for leaves that declare no parent, and warning those would
 * train the reader to ignore the message that does mean something.
 */
export function leafChainFor(group: AccordionGroupApi): LeafChain {
  const existing = chains.get(group);
  if (existing !== undefined) return existing;

  const fallback = createLeafChain();
  const unbound: LeafChain = {
    ...fallback,
    link: (childId, parentId) => {
      if (!warned.has(group)) {
        warned.add(group);
        // eslint-disable-next-line no-console -- a silent misconfiguration here
        // shows up as columns in the wrong order, which is near-impossible to
        // trace back to a missing wiring step.
        console.warn(
          '[accordion-dock] a chained <AccordionLeaf> declared parentId, but its ' +
            '<AccordionGroup> has no leaf chain bound — chained leaves will paint in open ' +
            'order rather than chain order. Wire bindLeafChain(api, chain) in AccordionGroup ' +
            'and sort leaves through chain.orderOpen() in visualOpenIds.',
        );
      }
      fallback.link(childId, parentId);
    },
  };
  chains.set(group, unbound);
  return unbound;
}
