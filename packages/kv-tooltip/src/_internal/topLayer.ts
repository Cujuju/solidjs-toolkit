/**
 * Detection for "is a browser TOP LAYER surface currently open?".
 *
 * Why this exists: `KvTooltipPanel` is a `<Portal>`-ed div with
 * `position: fixed; z-index: 9999` — ordinary stacking-context content. The
 * native Popover API (`popover` attribute + `showPopover()`) and `<dialog>`'s
 * `showModal()` promote their element into the browser's TOP LAYER, which
 * paints above the entire stacking-context tree REGARDLESS of z-index. There
 * is no z-index that wins. So while such a surface is open, a tooltip can only
 * be invisible behind it or — worse, if it happens to be beside it — a
 * distraction competing with a surface that has the user's attention.
 *
 * `pointerdown` on the trigger catches the common case (user clicks the field
 * that opens a menu), but not keyboard activation, programmatic opens, or a
 * surface opened from somewhere else entirely. This selector catches those.
 *
 * Scope note: this deliberately checks `[popover]` only, not `dialog[open]`.
 * A modal dialog also sits in the top layer, but it takes an inert backdrop
 * with it — a tooltip on an element outside the dialog can't be hovered in the
 * first place, so there is nothing to suppress. Non-modal popovers have no
 * backdrop, which is exactly why they can be obscuring a tooltip's trigger's
 * neighbourhood while the rest of the page stays interactive.
 */

/**
 * `:popover-open` matches only popovers currently in the top layer, so this is
 * the whole condition — no per-element `matches()` walk needed.
 */
const TOP_LAYER_OPEN_SELECTOR = '[popover]:popover-open';

export function isTopLayerSurfaceOpen(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    return document.querySelector(TOP_LAYER_OPEN_SELECTOR) !== null;
  } catch {
    // Engines without the Popover API (and jsdom) throw SyntaxError on the
    // unknown `:popover-open` pseudo-class. An engine that cannot parse the
    // selector also cannot put anything in the top layer via `popover`, so
    // "nothing is open" is the correct answer, not a fallback guess.
    return false;
  }
}
