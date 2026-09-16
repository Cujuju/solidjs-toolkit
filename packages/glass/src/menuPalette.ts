/**
 * Menu palette: `.glass-menu` colours under `--cujuju-glass-menu-*`, with no host fallback so no
 * host name collides. Override via those variables in CSS or `applyGlassMenuPalette()`.
 */

/** CSS property names this module drives, exported so host CSS need not restate the literals. */
export const GLASS_MENU_TEXT_CSS_VAR = '--cujuju-glass-menu-text';
export const GLASS_MENU_TEXT_SECONDARY_CSS_VAR =
  '--cujuju-glass-menu-text-secondary';
export const GLASS_MENU_TEXT_MUTED_CSS_VAR = '--cujuju-glass-menu-text-muted';
export const GLASS_MENU_BORDER_CSS_VAR = '--cujuju-glass-menu-border';
export const GLASS_MENU_SURFACE_RAISED_CSS_VAR =
  '--cujuju-glass-menu-surface-raised';
export const GLASS_MENU_INPUT_BG_CSS_VAR = '--cujuju-glass-menu-input-bg';
export const GLASS_MENU_CHROME_BG_CSS_VAR = '--cujuju-glass-menu-chrome-bg';

/** Menu palette as CSS colour values or `var()` references, written through unvalidated. A bad
 *  value is not rejected here: it makes the declaration that reads it invalid at computed-value time. */
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
  /** Backing for sticky chrome inside a menu (e.g. a search row). Defaults to the menu tint
   *  without its alpha; not rebound by `.glass-menu`. */
  chromeBg: string;
}

/** Shipped palette. MUST match `glass.css` (CSS must work without JS); tests pin the two together. */
export const GLASS_MENU_PALETTE_DEFAULTS: GlassMenuPalette = {
  text: 'rgba(255, 255, 255, 0.95)',
  textSecondary: 'rgba(255, 255, 255, 0.78)',
  textMuted: 'rgba(255, 255, 255, 0.65)',
  border: 'rgba(255, 255, 255, 0.18)',
  surfaceRaised: 'rgba(255, 255, 255, 0.1)',
  inputBg: 'rgba(255, 255, 255, 0.08)',
  chromeBg: 'var(--surface-glass-menu-tint-opaque)',
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
  chromeBg: GLASS_MENU_CHROME_BG_CSS_VAR,
};

/**
 * Write a PARTIAL palette onto the document root; `null` removes every property (not writing
 * defaults, which would pin over CSS overrides). No-op without a DOM.
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
    // Partial contract: skip undefined, and '' too, since setProperty('') silently does nothing.
    if (value === undefined || value === '') continue;
    root.style.setProperty(cssVar, value);
  }
}

/** Same as `applyGlassMenuPalette(null)`, named so an undo doesn't read like a mistake. */
export function resetGlassMenuPalette(): void {
  applyGlassMenuPalette(null);
}
