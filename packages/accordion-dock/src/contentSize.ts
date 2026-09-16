/**
 * `defaultSize="content"` — measure a column at first open, commit the size, and get out of
 * the way. See DESIGN_NOTES.md § src/contentSize.ts:1.
 */

import { createEffect } from 'solid-js';

/** A panel's opening size: an explicit px number, or a measurement of its own content taken
 *  once (see this file's header). */
export type AccordionDefaultSize = number | 'content';

/**
 * How many extra digit-widths a frozen column carries. ONE — it covers the single rollover a
 * session is exposed to, and the column is draggable if that is wrong.
 */
export const CONTENT_SLACK_DIGITS = 1;

/**
 * Ceiling on a measured column, as a fraction of the group's extent. Content can be
 * pathological — one unbreakable string would otherwise freeze a 600px column.
 */
export const CONTENT_MAX_GROUP_FRACTION = 0.4;

/**
 * Digit advance as a fraction of font-size, used ONLY where no canvas exists to measure with
 * (jsdom, or a host that blocked canvas). Digits are near-universally tabular.
 */
const DIGIT_ADVANCE_FALLBACK_RATIO = 0.6;

/** The group root — the clamp ceiling's source, reached from the panel. */
const GROUP_SELECTOR = '.acc-group';

/** Reused across measurements — creating a canvas per measure is pure garbage. */
let measureCanvas: HTMLCanvasElement | undefined;

/**
 * The advance width of `'0'` in the element's own font. Built from the LONGHANDS: the
 * shorthand serializes empty, which silently measures the canvas default face.
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
 * The element's natural extent along one axis. `scrollWidth` is NOT this — it reports
 * scrollable overflow. See DESIGN_NOTES.md § src/contentSize.ts:91.
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
 * The size to freeze a content-sized panel at, or `undefined` when layout cannot answer —
 * treating that as zero would freeze every column at the minimum.
 */
export function measureContentSize(input: ContentSizeInput): number | undefined {
  const { host, panel, group, axis } = input;
  if (typeof getComputedStyle !== 'function') return undefined;

  // Chrome first, while the boxes are untouched: whatever the column spends on borders and
  // padding around the host must be added back, or the frozen width clips.
  const hostBefore = host.getBoundingClientRect()[axis];
  const panelBefore = panel.getBoundingClientRect()[axis];
  const chrome = Math.max(0, panelBefore - hostBefore);

  const natural = naturalExtentPx(host, axis);
  if (natural <= 0) return undefined;

  /* Slack is an INLINE-axis affordance: a number gains a DIGIT, which makes text wider,
       never taller. A vertical group gets the honest measurement with no slack. */
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
 * Seed a panel's opening size — ONE implementation for panels and leaves. The two branches
 * differ in TIMING. See DESIGN_NOTES.md § src/contentSize.ts:180.
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
  /** Runs its callback after the next paint — the group's own scheduler, passed in so this file
   *  needs no scheduling opinion. */
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
