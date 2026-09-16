import { createSignal, type Accessor } from 'solid-js';
import type { AccordionGroupApi } from './context';

/**
 * Leaf chains: a leaf can be a WAYPOINT, opening another leaf beside it. Order comes from a
 * declared parent, never the open list. See DESIGN_NOTES.md § src/leafChain.ts:4.
 */

/**
 * One group's chain links, child id → parent id. Reactive, so a chain that changes shape
 * re-sorts the columns without explicit invalidation.
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
 * Walk `id`'s ancestors, nearest first, stopping at the first repeat. Termination comes from
 * the visited set alone, so a cyclic `parentId` is bounded structurally, not by a depth cap.
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
   * Depth-first preorder over the open leaves, roots first. Preorder keeps every chain
   * CONTIGUOUS. See DESIGN_NOTES.md § src/leafChain.ts:118.
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

    // Anything left is part of a cycle. Appended in open order rather than dropped: a
        // malformed chain degrades to the old behaviour, not a missing column.
    for (const id of openLeafIds) if (!emitted.has(id)) out.push(id);

    return out;
  };

  return { links, link, unlink, parentOf, depthOf, orderOpen };
}

/**
 * Keyed on the group's API object — stable for the group's lifetime — so the chain attaches
 * without widening `AccordionGroupApi` and is released when the group is collected.
 */
const chains = new WeakMap<AccordionGroupApi, LeafChain>();
/** Groups already warned about, so an unwired group complains once, not per leaf. */
const warned = new WeakSet<AccordionGroupApi>();

/** Called by `AccordionGroup` immediately after its `api` object is built. */
export function bindLeafChain(group: AccordionGroupApi, chain: LeafChain): void {
  chains.set(group, chain);
}

/**
 * The group's chain, for a leaf to write its link into. Falls back to a private chain rather
 * than throwing. See DESIGN_NOTES.md § src/leafChain.ts:190.
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
