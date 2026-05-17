// Side-effect: register the `.glass-panel` / `.glass-menu` global
// classes + their token defaults. Importing anything from this package
// pulls the glass stylesheet, so a host that imports only the menu-tint
// engine still gets the surface classes available document-wide.
import './glass.css';

export { MenuTintSection, type MenuTintSectionProps } from './MenuTintSection';

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
