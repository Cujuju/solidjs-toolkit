// Side-effect: register the `.glass-panel` / `.glass-menu` global
// classes + their token defaults. Importing anything from this package
// pulls the glass stylesheet, so a host that imports only the menu-tint
// engine still gets the surface classes available document-wide.
import './glass.css';

export { MenuTintSection, type MenuTintSectionProps } from './MenuTintSection';

// The menu palette. The ONLY supported runtime route to the six
// `.glass-menu` colours — see menuPalette.ts for why overriding them is
// deliberate rather than name-driven.
export {
  GLASS_MENU_TEXT_CSS_VAR,
  GLASS_MENU_TEXT_SECONDARY_CSS_VAR,
  GLASS_MENU_TEXT_MUTED_CSS_VAR,
  GLASS_MENU_BORDER_CSS_VAR,
  GLASS_MENU_SURFACE_RAISED_CSS_VAR,
  GLASS_MENU_INPUT_BG_CSS_VAR,
  GLASS_MENU_PALETTE_DEFAULTS,
  type GlassMenuPalette,
  applyGlassMenuPalette,
  resetGlassMenuPalette,
} from './menuPalette';

export {
  DEFAULT_MENU_TINT_STORAGE_KEY,
  MENU_TINT_DARKEN_CSS_VAR,
  MENU_TINT_ALPHA_CSS_VAR,
  MENU_TINT_SATURATE_CSS_VAR,
  MENU_TINT_BACKDROP_SATURATE_CSS_VAR,
  MENU_TINT_BLUR_CSS_VAR,
  MENU_TINT_DARKEN_MIN,
  MENU_TINT_DARKEN_MAX,
  MENU_TINT_ALPHA_MIN,
  MENU_TINT_ALPHA_MAX,
  MENU_TINT_SATURATE_MIN,
  MENU_TINT_SATURATE_MAX,
  MENU_TINT_BACKDROP_SATURATE_MIN,
  MENU_TINT_BACKDROP_SATURATE_MAX,
  MENU_TINT_BLUR_MIN,
  MENU_TINT_BLUR_MAX,
  MENU_TINT_DEFAULT_DARKEN,
  MENU_TINT_DEFAULT_ALPHA,
  MENU_TINT_DEFAULT_SATURATE,
  MENU_TINT_DEFAULT_BACKDROP_SATURATE,
  MENU_TINT_DEFAULT_BLUR,
  MENU_TINT_DEFAULTS,
  MENU_TINT_PRESETS,
  MENU_TINT_DEFAULT_PRESET_NAME,
  type MenuTintKnobs,
  normalizeMenuTintKnobs,
  knobsEqual,
  readMenuTintKnobsFromStorage,
  writeMenuTintKnobsToStorage,
  clearMenuTintKnobsFromStorage,
  applyMenuTintKnobs,
  bootstrapMenuTintFromStorage,
} from './menuTint';
