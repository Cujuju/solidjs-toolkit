/**
 * Menu palette — the six colours `.glass-menu` rebinds the page-level
 * text/border/surface aliases to, and the ONLY supported way to change
 * them at runtime.
 *
 * WHY THIS EXISTS AS AN EXPLICIT CALL
 * ───────────────────────────────────
 * These six once lived in the host's own `--color-` namespace, as
 * `--color-menu-text`, `--color-menu-border` and so on. Nothing read a
 * host token by that name, but the names themselves were the hazard: a
 * host that happened to define `--color-menu-border` would silently
 * override a library internal, or be overridden by one, decided by
 * nothing more than CSS cascade-layer order. That is precisely the trap
 * that repainted every divider in a consuming app when this package
 * DECLARED `--color-border` in a layer that outranked the host's theme
 * (see the header of `glass.css`).
 *
 * The lesson generalises: a library's tokens are not private because
 * its author thinks of them as internal. They are private when their
 * NAMES cannot collide. So the six moved to `--cujuju-glass-menu-*`,
 * and they deliberately carry NO host fallback — there is no
 * `var(--color-menu-text, …)` anywhere in `glass.css`. Reading a host
 * token by name is the implicit coupling being removed; a host must not
 * be able to restyle menus by accidentally owning a name.
 *
 * Overriding is therefore always deliberate, by one of exactly two
 * routes:
 *   1. Set the `--cujuju-glass-menu-*` variables in your own CSS, at
 *      whatever scope you want them to apply to. Fully static, no JS.
 *   2. Call `applyGlassMenuPalette()` — this module — which writes them
 *      as inline properties on `document.documentElement`. Inline
 *      properties beat any stylesheet rule regardless of layer, which
 *      is what makes a runtime theme switch reliable.
 *
 * There is no third route, and in particular no name a host can define
 * and have picked up by accident. That is the point.
 *
 * SCOPE: this is a whole-document override. `.glass-menu` reads these
 * at whatever element it renders under, so setting them on the root
 * changes every glass menu at once. For a single menu, set the
 * variables on that menu's own container instead (route 1) — this
 * module deliberately does not offer a per-element setter, because a
 * per-element override is a plain CSS concern and does not need an API.
 */

/** CSS custom property names driven by this module. Exported so a host
 *  can reference them in its own CSS (route 1) without restating the
 *  literal strings and drifting from the package. */
export const GLASS_MENU_TEXT_CSS_VAR = '--cujuju-glass-menu-text';
export const GLASS_MENU_TEXT_SECONDARY_CSS_VAR =
  '--cujuju-glass-menu-text-secondary';
export const GLASS_MENU_TEXT_MUTED_CSS_VAR = '--cujuju-glass-menu-text-muted';
export const GLASS_MENU_BORDER_CSS_VAR = '--cujuju-glass-menu-border';
export const GLASS_MENU_SURFACE_RAISED_CSS_VAR =
  '--cujuju-glass-menu-surface-raised';
export const GLASS_MENU_INPUT_BG_CSS_VAR = '--cujuju-glass-menu-input-bg';

/**
 * The six menu colours, as CSS colour strings.
 *
 * Every field is a raw CSS colour value (`rgba(...)`, `#rrggbb`,
 * `color-mix(...)`, anything a custom property may hold) — this module
 * never parses or validates them, it only writes them through. A bad
 * value fails the way any bad CSS value does: the declaration is
 * dropped and the previous one stands.
 */
export interface GlassMenuPalette {
  /** Primary menu text. */
  text: string;
  /** Secondary menu text — labels, metadata. */
  textSecondary: string;
  /** Muted menu text — hints, disabled. */
  textMuted: string;
  /** Menu dividers and control outlines. */
  border: string;
  /** Raised surfaces INSIDE a menu — hover rows, chips. */
  surfaceRaised: string;
  /** Input fills inside a menu. */
  inputBg: string;
}

/**
 * The shipped palette — white-alpha over a smoked-dark backdrop.
 *
 * MUST stay in step with the `:root` block in `glass.css`. They are two
 * statements of one fact, and the reason for the duplication is that
 * the CSS has to stand alone with no JS on the page at all. The test
 * suite pins them against each other so they cannot drift silently.
 */
export const GLASS_MENU_PALETTE_DEFAULTS: GlassMenuPalette = {
  text: 'rgba(255, 255, 255, 0.95)',
  textSecondary: 'rgba(255, 255, 255, 0.78)',
  textMuted: 'rgba(255, 255, 255, 0.65)',
  border: 'rgba(255, 255, 255, 0.18)',
  surfaceRaised: 'rgba(255, 255, 255, 0.1)',
  inputBg: 'rgba(255, 255, 255, 0.08)',
};

/** Field → CSS variable. One table, so a new colour is one row here and
 *  one line in `glass.css` rather than an edit in three places. */
const CSS_VAR_BY_FIELD: Record<keyof GlassMenuPalette, string> = {
  text: GLASS_MENU_TEXT_CSS_VAR,
  textSecondary: GLASS_MENU_TEXT_SECONDARY_CSS_VAR,
  textMuted: GLASS_MENU_TEXT_MUTED_CSS_VAR,
  border: GLASS_MENU_BORDER_CSS_VAR,
  surfaceRaised: GLASS_MENU_SURFACE_RAISED_CSS_VAR,
  inputBg: GLASS_MENU_INPUT_BG_CSS_VAR,
};

/**
 * Write a menu palette onto `document.documentElement`, or clear it.
 *
 * PARTIAL BY DESIGN: pass only the fields you want to change and the
 * rest keep whatever they currently resolve to. Passing a field you do
 * not care about would force you to restate the shipped value, and a
 * restated constant is a constant that drifts.
 *
 * Pass `null` to remove every property this module has set, returning
 * the menu to the stylesheet's own defaults. Clearing removes the
 * inline property rather than writing the default back — writing the
 * default back would pin the value and defeat any CSS-level override
 * the host had set up through route 1.
 *
 * No-ops when there is no DOM (SSR / test environments without a
 * document), so a host may call it unconditionally during bootstrap.
 */
export function applyGlassMenuPalette(
  palette: Partial<GlassMenuPalette> | null,
): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;

  if (palette === null) {
    for (const cssVar of Object.values(CSS_VAR_BY_FIELD)) {
      root.style.removeProperty(cssVar);
    }
    return;
  }

  for (const [field, cssVar] of Object.entries(CSS_VAR_BY_FIELD)) {
    const value = palette[field as keyof GlassMenuPalette];
    // `undefined` means "leave this one alone" — the partial contract.
    // An empty string is treated the same way rather than written,
    // because setProperty('') silently does nothing and would read as a
    // clear that never happened.
    if (value === undefined || value === '') continue;
    root.style.setProperty(cssVar, value);
  }
}

/**
 * Remove every palette property this module has set.
 *
 * Exactly `applyGlassMenuPalette(null)`, named for the callsite that
 * only wants to undo — a reset spelled as a call with a null argument
 * reads like a mistake at the point of use.
 */
export function resetGlassMenuPalette(): void {
  applyGlassMenuPalette(null);
}
