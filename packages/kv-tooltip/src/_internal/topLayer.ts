/**
 * Detection for "is a browser TOP LAYER surface currently open?".
 *
 * Why this exists: the native Popover API (`popover` attribute +
 * `showPopover()`) and `<dialog>`'s `showModal()` promote their element into
 * the browser's TOP LAYER, which paints above the entire stacking-context tree
 * REGARDLESS of z-index. There is no z-index that wins.
 *
 * Through 0.5.x that made this an availability question — the panel was
 * ordinary `position: fixed` content and could only be invisible behind such a
 * surface. Since 0.6.0 the panel is promoted into the top layer itself, so the
 * question this helper answers has narrowed to two live cases, both real:
 *   - the DEGRADED path, where `showPopover` is unavailable or promotion
 *     failed and the panel genuinely is ordinary content again; and
 *   - DEFERENCE — a consumer choosing that a hover tooltip should not compete
 *     with a menu or dialog the user deliberately opened, even though it would
 *     paint fine.
 * Both are opt-in through `suppressWhileTopLayerOpen`; see that prop.
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
 * Identity marker set on every tooltip panel by `TooltipContent` (KvTooltip.tsx).
 * Private on purpose: the public `.ckv-panel` class is a styling hook a consumer
 * can apply to, or strip from, whatever they like, so it cannot carry identity.
 */
const OWN_PANEL_ATTRIBUTE = 'data-ckv-tooltip-panel';

/**
 * `:popover-open` matches only popovers currently in the top layer, so this is
 * the whole condition — no per-element `matches()` walk needed.
 *
 * The `:not([data-ckv-tooltip-panel])` half fixes a SELF-POISONING bug
 * introduced in 0.6.0. That release started promoting the tooltip panel into
 * the top layer with `showPopover()`, which made our own panel match the
 * original bare `[popover]:popover-open` selector. The result: any visible
 * KvTooltip anywhere in the document reported "a top-layer surface is open",
 * so every `suppressWhileTopLayerOpen` consumer was blocked by a tooltip
 * rather than by the menus and dialogs the prop exists to defer to — and,
 * because one tooltip suppressed the next, the prop effectively became
 * "only one tooltip on the page, ever". It was latent only because no
 * consumer had opted into `suppressWhileTopLayerOpen` yet.
 *
 * A tooltip panel is never a surface another tooltip should yield to: it is
 * transient, non-interactive by default, and owned by this same library.
 */
const TOP_LAYER_OPEN_SELECTOR = `[popover]:popover-open:not([${OWN_PANEL_ATTRIBUTE}])`;

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
