/**
 * `defaultSize="content"` — size a column to what it actually holds, ONCE.
 *
 * ── Why measure-and-freeze rather than a live `max-content` column ───────────
 * A CSS `width: max-content` column tracks its content forever, which sounds
 * like the same feature and is not: in a dock whose columns hold live numbers, a
 * P/L crossing a digit boundary (`$9.99` → `$10.01`) re-resolves the track and
 * the whole column — and every column after it — twitches sideways. The column
 * is also no longer draggable in any meaningful sense, because the next render
 * throws the user's width away.
 *
 * So this measures the natural width at the moment a panel first opens with no
 * size of its own, commits it through `setSize`, and then gets out of the way.
 * From that point the column is an ordinary explicit size: draggable, persisted,
 * and never measured again.
 *
 * ── Why the frozen width carries digit slack ────────────────────────────────
 * Freezing has one failure mode, and it is the same digit boundary: a column
 * frozen around `$9.99` compresses (or clips) the moment the number becomes
 * `$10.01`. The slack is therefore not padding-for-looks — it is the cost of
 * freezing, and it is derived from the content's OWN font so it scales with the
 * type scale instead of being a px fudge that is right at exactly one size.
 */

import { createEffect } from 'solid-js';

/** A panel's opening size: an explicit px number, or a measurement of its own
 *  content taken once (see this file's header). */
export type AccordionDefaultSize = number | 'content';

/**
 * How many extra digit-widths a frozen column carries.
 *
 * ONE. It covers the single rollover that a frozen column is actually exposed to
 * within a session (a price gaining a digit, a P/L crossing a power of ten). Two
 * would buy a second rollover that essentially never happens while making every
 * column visibly too wide — and the column is draggable, so an under-estimate
 * costs the user one drag while an over-estimate costs every user the space.
 */
export const CONTENT_SLACK_DIGITS = 1;

/**
 * Ceiling on a measured column, as a fraction of the group's own extent.
 *
 * Content-sizing trusts the content, and content can be pathological: one
 * user-renamed strategy ("Jan 2027 diagonal — roll candidate, do not close") is
 * a single unbreakable string that would otherwise freeze a 600px column and
 * leave the plot a sliver. At 40% the widest legitimate column still fits with
 * the dock's own two-columns-plus-surface layout intact, and anything past it is
 * an outlier the user can drag wider deliberately.
 */
export const CONTENT_MAX_GROUP_FRACTION = 0.4;

/**
 * Digit advance as a fraction of font-size, used ONLY where no canvas exists to
 * measure with (jsdom, and any host that has blocked canvas). 0.6 is the ratio
 * for the tabular/monospace faces this slack exists to protect; a proportional
 * face's digits sit near it too, because digits are near-universally tabular
 * even in proportional fonts.
 */
const DIGIT_ADVANCE_FALLBACK_RATIO = 0.6;

/** The group root — the clamp ceiling's source, reached from the panel. */
const GROUP_SELECTOR = '.acc-group';

/** Reused across measurements — creating a canvas per measure is pure garbage. */
let measureCanvas: HTMLCanvasElement | undefined;

/**
 * The advance width of `'0'` in an element's own resolved font.
 *
 * Built from the font LONGHANDS rather than `computed.font`: the shorthand
 * serializes to an empty string whenever the longhands cannot be losslessly
 * combined into one (which includes every element whose `line-height` came from
 * a separate declaration), and an empty font string silently measures in the
 * canvas default face instead of the content's.
 */
export function digitAdvancePx(computed: CSSStyleDeclaration): number {
  const fontSize = parseFloat(computed.fontSize) || 0;
  if (typeof document === 'undefined') return fontSize * DIGIT_ADVANCE_FALLBACK_RATIO;
  measureCanvas ??= document.createElement('canvas');
  const ctx = measureCanvas.getContext('2d');
  if (ctx === null) return fontSize * DIGIT_ADVANCE_FALLBACK_RATIO;
  ctx.font = `${computed.fontStyle} ${computed.fontWeight} ${computed.fontSize} ${computed.fontFamily}`;
  const advance = ctx.measureText('0').width;
  // jsdom's canvas stub answers 0 for every string; a zero-width digit is not a
  // measurement, it is the absence of one.
  return advance > 0 ? advance : fontSize * DIGIT_ADVANCE_FALLBACK_RATIO;
}

/**
 * The element's natural extent along one axis, in px.
 *
 * `scrollWidth` IS NOT THIS, and the difference is the whole reason this
 * function exists: `scrollWidth` reports the scrollable overflow, so it equals
 * `clientWidth` whenever the box is already at least as wide as its content —
 * i.e. it answers "how much does this overflow" when the question is "how wide
 * does this want to be". Measuring a column that is currently too WIDE with
 * `scrollWidth` returns the too-wide width and freezes the mistake.
 *
 * The element is therefore forced to its intrinsic size and read back. Both the
 * write and the restore happen inside one synchronous task, so the browser has
 * no opportunity to paint the intermediate state — the read forces a synchronous
 * reflow, not a visible frame. `flex` is neutralised alongside the size because
 * the host is a flex item, and a flex item's base size loses to the flex
 * algorithm before it ever reaches layout.
 */
function naturalExtentPx(el: HTMLElement, axis: 'width' | 'height'): number {
  const style = el.style;
  const prevSize = style.getPropertyValue(axis);
  const prevFlex = style.flex;
  style.flex = '0 0 auto';
  style.setProperty(axis, 'max-content');
  const extent = el.getBoundingClientRect()[axis];
  // Restore by the same route, so an element that had no inline value keeps
  // having none rather than acquiring an empty declaration.
  if (prevSize === '') style.removeProperty(axis);
  else style.setProperty(axis, prevSize);
  if (prevFlex === '') style.removeProperty('flex');
  else style.flex = prevFlex;
  return extent;
}

export interface ContentSizeInput {
  /** The element the panel's children currently live in (inline host, flyout
   *  host, or tear-off host — whichever owns them right now). */
  host: HTMLElement;
  /** The panel's own column element, to recover the chrome the host sits
   *  inside (the column's borders and padding). */
  panel: HTMLElement;
  /** The group element — the source of both the clamp ceiling and the
   *  `--acc-col-min-width` floor. */
  group: HTMLElement;
  /** Horizontal groups size columns by WIDTH, vertical ones by HEIGHT. */
  axis: 'width' | 'height';
}

/**
 * The size to freeze a content-sized panel at, or `undefined` when there is
 * nothing to measure.
 *
 * Returns `undefined` rather than a number whenever layout cannot answer (a
 * zero-extent host: display:none, an unattached tree, or jsdom, which has no
 * layout at all). A caller that treats "no layout" as "0px, clamped up to the
 * minimum" would freeze every column at the minimum width in exactly the
 * environments where the measurement is meaningless.
 */
export function measureContentSize(input: ContentSizeInput): number | undefined {
  const { host, panel, group, axis } = input;
  if (typeof getComputedStyle !== 'function') return undefined;

  // Chrome first, while the boxes are still untouched: whatever the column
  // spends on borders/padding around the host has to be added back, or the
  // frozen width is short by exactly that much and the content clips.
  const hostBefore = host.getBoundingClientRect()[axis];
  const panelBefore = panel.getBoundingClientRect()[axis];
  const chrome = Math.max(0, panelBefore - hostBefore);

  const natural = naturalExtentPx(host, axis);
  if (natural <= 0) return undefined;

  /* Slack is an INLINE-axis affordance: it exists because a number gains a
     DIGIT, which makes text wider, never taller. A vertical group sizing by
     height gets the honest measurement with no slack rather than a nonsensical
     one-digit-tall margin. */
  const slack =
    axis === 'width' ? digitAdvancePx(getComputedStyle(host)) * CONTENT_SLACK_DIGITS : 0;

  const groupStyle = getComputedStyle(group);
  const min = parseFloat(groupStyle.getPropertyValue('--acc-col-min-width')) || 0;
  const groupExtent = group.getBoundingClientRect()[axis];
  const max = groupExtent > 0 ? groupExtent * CONTENT_MAX_GROUP_FRACTION : Infinity;

  const wanted = natural + chrome + slack;
  // Ceiling before floor: a group too small for even its own minimum column
  // should still yield the minimum, not a clamped-to-nothing column.
  return Math.round(Math.max(min, Math.min(wanted, max)));
}

/**
 * Seed a panel's opening size — the ONE implementation of the `defaultSize`
 * rule, consumed by both `AccordionPanel` and `AccordionLeaf`.
 *
 * Shared rather than written twice on purpose: this is the second rule in this
 * package to be seeded identically by those two components (the first, the
 * plain-number branch, WAS duplicated), and a rule with two implementations is
 * one edit away from a leaf and a panel disagreeing about when a size is
 * allowed to be overwritten.
 *
 * TIMING is the substance here, and the two branches genuinely differ:
 *
 *  - A NUMBER needs no layout, so it is seeded on mount — before first paint,
 *    which is what stops a column opening at the mode's automatic width and
 *    visibly snapping to its default.
 *  - `'content'` cannot be measured until the content has a box, which means
 *    the panel must be OPEN and laid out. It therefore waits for the first open
 *    and measures after paint. A closed panel's host is `hidden`, and hidden
 *    boxes measure zero.
 *
 * Both branches are one-shot in the same sense: they only ever act while the
 * panel has no size at all, so a persisted layout, a splitter drag, or an
 * earlier measurement all pre-empt them permanently.
 */
export function seedDefaultSize(input: {
  defaultSize: () => AccordionDefaultSize | undefined;
  open: () => boolean;
  /** The element the panel's children currently live in. */
  host: () => HTMLElement | undefined;
  /** The panel's own column element. */
  panel: () => HTMLElement | undefined;
  sizeOf: () => number | undefined;
  setSize: (px: number) => void;
  orientation: () => 'horizontal' | 'vertical';
  /** Runs its callback after the next paint — the group's own scheduler, passed
   *  in so this file needs no scheduling opinion of its own. */
  afterPaint: (fn: () => void) => void;
}): void {
  const size = input.defaultSize();
  if (size === undefined) return;
  if (typeof size === 'number') {
    if (input.sizeOf() === undefined) input.setSize(size);
    return;
  }
  createEffect(() => {
    if (!input.open()) return;
    // Read before the async hop: an already-sized panel must not schedule work
    // that a concurrent drag would then race.
    if (input.sizeOf() !== undefined) return;
    const host = input.host();
    const panel = input.panel();
    if (host === undefined || panel === undefined) return;
    const group = panel.closest(GROUP_SELECTOR);
    if (!(group instanceof HTMLElement)) return;
    input.afterPaint(() => {
      // Re-checked after the paint: the user can drag a splitter, or a persisted
      // layout can land, in the frame this was waiting on.
      if (input.sizeOf() !== undefined) return;
      const measured = measureContentSize({
        host,
        panel,
        group,
        axis: input.orientation() === 'horizontal' ? 'width' : 'height',
      });
      if (measured !== undefined) input.setSize(measured);
    });
  });
}
