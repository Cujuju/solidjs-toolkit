import type { JSX } from 'solid-js';
import type { AccordionGroupApi, PanelMeta } from './context';

/**
 * The DATA half of the breadcrumb: turning the group's open sequence into a path,
 * and eliding that path when it gets long. Split out of `Breadcrumb.tsx` on
 * purpose — everything interesting about a breadcrumb is the derivation and the
 * truncation semantics, and both are testable against a hand-built
 * `AccordionGroupApi` stub with no renderer and no DOM.
 *
 * There is no state in this file. The path is a pure function of
 * `visualOpenIds()` + `meta()`, which is the whole point: a Miller browser must
 * not be able to have a breadcrumb that disagrees with its own columns.
 */

/**
 * One position in the path.
 *
 * `label` is renderable and may be JSX; `text` is the plain-string form when one
 * exists, kept separately because `title=` attributes, `aria-label`s and the
 * elision tooltip all need a string and cannot render a node.
 */
export interface CrumbData {
  id: string;
  /** Renderable label — see `resolveCrumbLabel` for the fallback chain. */
  label: string | JSX.Element;
  /** Plain-text label, when the panel's title/tooltip is a string. Undefined when
   *  the panel labelled itself with JSX, which no attribute can carry. */
  text: string | undefined;
  meta: PanelMeta;
  /** Position in the FULL path — which is NOT the index a `renderCrumb` callback
   *  receives once the middle has been elided. Kept here so a custom renderer can
   *  still tell "third column" from "third visible crumb". */
  index: number;
  /** The last crumb: where the user currently is. Nothing follows it, so its
   *  `select()` is a no-op and the default renderer draws it as text, not a
   *  button — the standard breadcrumb treatment for the current location. */
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
 * A rendered position in the bar. The elision is not a crumb with a funny label:
 * it stands for N crumbs, and a renderer needs to know which ones (for a tooltip,
 * a menu, or to expand in place).
 */
export type BreadcrumbEntry =
  | { kind: 'crumb'; crumb: CrumbData }
  | { kind: 'ellipsis'; hidden: readonly CrumbData[] };

/**
 * How many leading crumbs survive elision.
 *
 * One. The root is the only crumb whose identity is absolute — every crumb after
 * it means something only relative to what precedes it, so `… › components ›
 * AppShell.tsx` is readable while a path with no root is not. Keeping a second
 * head crumb buys context the tail already provides.
 */
export const CRUMB_HEAD_COUNT = 1;

/**
 * How many trailing crumbs survive elision.
 *
 * Two: where you are, and what you came from. One alone strands the current
 * column with no context ("AppShell.tsx" — of what?); three starts eliding at
 * path lengths short enough that nothing needed eliding in the first place.
 */
export const CRUMB_TAIL_COUNT = 2;

/**
 * The fewest crumbs worth replacing with an ellipsis.
 *
 * Two, because the ellipsis occupies a slot of its own. Collapsing a SINGLE crumb
 * trades a real label for a placeholder of roughly the same width: no space
 * saved, one label's worth of information destroyed. Two is the first count where
 * elision actually pays for itself.
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
   * Fired BEFORE the truncation is applied, with every id that is about to be
   * closed and the crumb that was clicked.
   *
   * This is not a notification — for a Miller browser it is REQUIRED wiring. A
   * `<AccordionLeaf>` is controlled: its `open` prop is the consumer's signal,
   * mirrored into the group by an effect. So the breadcrumb cannot close a leaf
   * by calling `setOpen` (see `applyTruncation`); the consumer has to clear the
   * selection that opened it, exactly as it already does for the leaf's own ×
   * button. Panels driven by a consumer effect (`setOpen('files', folder() !==
   * null)`) want the same treatment for the same reason — the group would close
   * them, but the consumer's selection state would still claim otherwise.
   */
  onTruncate?: (closedIds: readonly string[], crumb: CrumbData) => void;
}

/**
 * Renderable label for a crumb, most specific first.
 *
 * `title` over `railLabel`: `railLabel` exists because the rail is ~40px wide and
 * the label is rotated into it, a constraint the breadcrumb does not share. It is
 * used only when a panel supplied no title at all.
 *
 * The id is the last resort. It is ugly, but a blank crumb is worse: it reads as
 * a rendering bug and gives the user nothing to aim at.
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

/** Plain-text form of the label, for attributes. Falls back to the panel's own
 *  tooltip, which is already a string by contract. */
function resolveCrumbText(meta: PanelMeta): string | undefined {
  const title = meta.title();
  if (typeof title === 'string' && title !== '') return title;
  const rail = meta.railLabel();
  if (typeof rail === 'string' && rail !== '') return rail;
  return meta.tooltip();
}

/**
 * Close everything after `index`.
 *
 * PINNED PANELS ARE CLOSED TOO. That is a deliberate choice against the other
 * plausible reading, so the rule it follows is worth stating in full:
 *
 *   The pin exempts a panel from AUTOMATIC collapse, not from an EXPLICIT close.
 *
 * `single`-policy auto-collapse and `collapseAll()` are both things that happen
 * to a panel as a side effect of an action aimed somewhere else — "I opened
 * another panel", "I pressed Collapse All". The pin is protection from collateral
 * damage, and it is why those two spare it.
 *
 * A crumb click is not collateral. The user pointed at a position in the path and
 * said "it ends here"; every column after it is precisely the subject of the
 * action, not a bystander. Sparing a pinned one would leave the bar reading `src
 * › components › Search` immediately after the user clicked `components` — a
 * breadcrumb that contradicts the click that produced it is worse than a pin that
 * did not hold.
 *
 * This also matches what the control already does: `AccordionPanel`'s own × calls
 * `setOpen(id, false)` with no pin check, so an explicit close has never
 * respected the pin. The breadcrumb is a contiguous run of exactly that close.
 *
 * The pin STATE survives — `togglePin` is never called here — so reopening the
 * panel brings its pin back and it resumes surviving auto-collapse.
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
  // Consumer first: a controlled leaf's `open` (and any selection state that
  // drives a panel through an effect) flips before the group's own open-list
  // edits, so both land in one synchronous pass rather than two paints.
  options?.onTruncate?.(
    after.map((c) => c.id),
    crumb,
  );

  for (const c of after) {
    // No leaf special case any more. `setOpen` on a leaf is a REQUEST that routes
    // to the leaf's own `requestClose` (see `PanelMeta.requestClose`), so the
    // consumer flips the prop and the group's state follows — which is what this
    // loop used to have to arrange by skipping leaves and relying on `onTruncate`
    // above having done the same job. The skip was correct and load-bearing, and
    // it was also a rule that lived in a comment at one of several callsites.
    group.setOpen(c.id, false);
  }
}

/**
 * The path, derived from the group's painted sequence.
 *
 * `visualOpenIds()` is used rather than `openOrder()` because the breadcrumb must
 * read in the same direction the columns do — including the leaf being last,
 * which is what makes the path end at the file rather than at a folder.
 */
export function buildCrumbPath(
  group: AccordionGroupApi,
  options?: CrumbPathOptions,
): CrumbData[] {
  const ids = group.visualOpenIds();
  const path: CrumbData[] = [];

  ids.forEach((id) => {
    const meta = group.meta(id);
    // A panel can unregister (route change, `<Show>`) while its id stays in the
    // open list — `unregister` deliberately keeps the order entry so the panel
    // returns where the user put it. Until it remounts there is no label and no
    // meaningful click target, so it contributes no crumb rather than a blank one.
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
        // Resolved against `path` at CLICK time, not build time, so a crumb whose
        // position shifted since render still truncates from where it now sits.
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
 * Collapse the middle of a long path.
 *
 * Middle-out rather than wrapping or scrolling: a breadcrumb that wraps changes
 * the height of the chrome it sits in (and in a `fill` dock that steals space
 * from the columns), and one that scrolls hides the current location — the single
 * most important crumb — behind a gesture.
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
