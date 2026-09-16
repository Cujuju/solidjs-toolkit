/**
 * Is a non-tooltip top-layer popover open? Used for the degraded path and deference
 * (`suppressWhileTopLayerOpen`). `dialog[open]` is skipped: modal backdrops make the
 * trigger unhoverable anyway.
 */

/**
 * Set by `TooltipContent`. Private: the public `.ckv-panel` class is a styling hook anyone can
 * apply or strip, so it can't carry identity.
 */
const OWN_PANEL_ATTRIBUTE = 'data-ckv-tooltip-panel';

/**
 * `:popover-open` is the whole condition. The `:not(...)` fixes 0.6.0 self-poisoning: our
 * promoted panel matched, so any visible tooltip suppressed the next.
 */
const TOP_LAYER_OPEN_SELECTOR = `[popover]:popover-open:not([${OWN_PANEL_ATTRIBUTE}])`;

export function isTopLayerSurfaceOpen(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    return document.querySelector(TOP_LAYER_OPEN_SELECTOR) !== null;
  } catch {
    // No Popover API (and jsdom) → SyntaxError; such an engine has nothing in the top layer, so
    // false is correct, not a guess.
    return false;
  }
}
