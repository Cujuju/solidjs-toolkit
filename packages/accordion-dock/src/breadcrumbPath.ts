import type { JSX } from 'solid-js';
import type { AccordionGroupApi, PanelMeta } from './context';

/**
 * The DATA half of the breadcrumb: the open sequence as a path, and its elision. No state —
 * a pure function of `visualOpenIds()` and `meta()`.
 */

/**
 * One position in the path. `label` is renderable and may be JSX; `text` is the plain-string
 * form, kept separately because attributes cannot render a node.
 */
export interface CrumbData {
  id: string;
  /** Renderable label — see `resolveCrumbLabel` for the fallback chain. */
  label: string | JSX.Element;
  /** Plain-text label, when the panel's title/tooltip is a string. Undefined when
   *  the panel labelled itself with JSX, which no attribute can carry. */
  text: string | undefined;
  meta: PanelMeta;
  /** Position in the FULL path — NOT the index a `renderCrumb` callback sees once the middle
   *  is elided. */
  index: number;
  /** The last crumb: where the user is. Its `select()` is a no-op and the default renderer
   *  draws it as text, not a button. */
  isCurrent: boolean;
  isLeaf: boolean;
  isPinned: boolean;
  /**
   * Truncate the path to end at this crumb — closes every open panel AFTER it.
   * No-op on the current crumb.
   */
  select: () => void;
}

/**
 * A rendered position in the bar. The elision is not a crumb with a funny label: it stands
 * for N crumbs, and a renderer needs to know which.
 */
export type BreadcrumbEntry =
  | { kind: 'crumb'; crumb: CrumbData }
  | { kind: 'ellipsis'; hidden: readonly CrumbData[] };

/**
 * How many leading crumbs survive elision. One: the root is the only crumb whose identity is
 * absolute, and a second buys context the tail already provides.
 */
export const CRUMB_HEAD_COUNT = 1;

/**
 * How many trailing crumbs survive. Two: where you are, and what you came from. One strands
 * the current column with no context.
 */
export const CRUMB_TAIL_COUNT = 2;

/**
 * The fewest crumbs worth replacing with an ellipsis. Two, because the ellipsis takes a slot
 * of its own — collapsing one saves no space and destroys a label.
 */
export const MIN_ELIDED_CRUMBS = 2;

/**
 * Path length at which the middle collapses. Derived, never hand-tuned — it is
 * exactly the shortest path where head + tail + a worthwhile elision all fit.
 */
export const CRUMB_ELISION_THRESHOLD =
  CRUMB_HEAD_COUNT + CRUMB_TAIL_COUNT + MIN_ELIDED_CRUMBS;

export interface CrumbPathOptions {
  /**
   * Fired BEFORE the truncation, with every id about to close. REQUIRED wiring: a controlled
   * leaf's `open` is the consumer's. See DESIGN_NOTES.md § src/breadcrumbPath.ts:94.
   */
  onTruncate?: (closedIds: readonly string[], crumb: CrumbData) => void;
}

/**
 * Renderable label, most specific first. `title` over `railLabel`, which exists only for the
 * rotated rail. The id is the last resort: a blank crumb reads as a bug.
 */
function resolveCrumbLabel(meta: PanelMeta): string | JSX.Element {
  const title = meta.title();
  // A JSX title is used verbatim — the panel author chose a node, and there is no
  // "empty" to test for.
  if (typeof title !== 'string') return title;
  if (title !== '') return title;

  const rail = meta.railLabel();
  if (rail !== undefined && (typeof rail !== 'string' || rail !== '')) return rail;

  return meta.id;
}

/** Plain-text form of the label, for attributes. Falls back to the panel's tooltip, which is
 *  a string by contract. */
function resolveCrumbText(meta: PanelMeta): string | undefined {
  const title = meta.title();
  if (typeof title === 'string' && title !== '') return title;
  const rail = meta.railLabel();
  if (typeof rail === 'string' && rail !== '') return rail;
  return meta.tooltip();
}

/**
 * Close everything after `index`, PINNED PANELS INCLUDED. The pin exempts a panel from
 * AUTOMATIC collapse, not an EXPLICIT close. See DESIGN_NOTES.md § src/breadcrumbPath.ts:143.
 */
function applyTruncation(
  group: AccordionGroupApi,
  path: readonly CrumbData[],
  index: number,
  options: CrumbPathOptions | undefined,
): void {
  const after = path.slice(index + 1);
  if (after.length === 0) return;

  const crumb = path[index];
  // Consumer first: a controlled leaf's `open` flips before the group's own edits, so both
  // land in one synchronous pass rather than two paints.
  options?.onTruncate?.(
    after.map((c) => c.id),
    crumb,
  );

  for (const c of after) {
    // No leaf special case: `setOpen` on a leaf is a REQUEST routing to `requestClose`, so the
    // consumer flips the prop and the group follows.
    group.setOpen(c.id, false);
  }
}

/**
 * The path, derived from the group's painted sequence. `visualOpenIds()` rather than
 * `openOrder()`, so the bar reads in the direction the columns do — leaf last.
 */
export function buildCrumbPath(
  group: AccordionGroupApi,
  options?: CrumbPathOptions,
): CrumbData[] {
  const ids = group.visualOpenIds();
  const path: CrumbData[] = [];

  ids.forEach((id) => {
    const meta = group.meta(id);
    // A panel can unregister while its id stays in the open list, so until it remounts it
    // contributes no crumb rather than a blank one.
    if (meta === undefined) return;
    path.push({
      id,
      label: resolveCrumbLabel(meta),
      text: resolveCrumbText(meta),
      meta,
      index: path.length,
      // Filled in below: "last" is only knowable once the skips are known.
      isCurrent: false,
      isLeaf: meta.isLeaf,
      isPinned: group.isPinned(id),
      select: () => {
        // Resolved against `path` at CLICK time, not build time, so a crumb whose position
        // shifted still truncates from where it now sits.
        const at = path.findIndex((c) => c.id === id);
        if (at >= 0) applyTruncation(group, path, at, options);
      },
    });
  });

  const last = path.length - 1;
  if (last >= 0) path[last].isCurrent = true;
  return path;
}

/**
 * Collapse the middle of a long path. Middle-out rather than wrapping, which changes the
 * chrome's height, or scrolling, which hides the current location behind a gesture.
 */
export function elideCrumbs(path: readonly CrumbData[]): BreadcrumbEntry[] {
  if (path.length < CRUMB_ELISION_THRESHOLD) {
    return path.map((crumb) => ({ kind: 'crumb', crumb }));
  }
  const head = path.slice(0, CRUMB_HEAD_COUNT);
  const tail = path.slice(path.length - CRUMB_TAIL_COUNT);
  const hidden = path.slice(CRUMB_HEAD_COUNT, path.length - CRUMB_TAIL_COUNT);
  return [
    ...head.map((crumb): BreadcrumbEntry => ({ kind: 'crumb', crumb })),
    { kind: 'ellipsis', hidden },
    ...tail.map((crumb): BreadcrumbEntry => ({ kind: 'crumb', crumb })),
  ];
}
