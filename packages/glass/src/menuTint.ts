/**
 * Five user knobs driving `.glass-menu` tint and backdrop filter, composed in CSS from
 * `--color-surface`. Stored unitless; call `bootstrapMenuTintFromStorage()` before the first render.
 */

/** Default localStorage key. Namespaced so it will not collide with an
 *  unrelated host-app preference. Hosts with an existing key should pass
 *  their own string to every storage function instead. */
export const DEFAULT_MENU_TINT_STORAGE_KEY = 'solidjs-glass:menuTintKnobs';

/** CSS custom property names driven by the five knobs. */
export const MENU_TINT_DARKEN_CSS_VAR = '--user-menu-tint-darken';
export const MENU_TINT_ALPHA_CSS_VAR = '--user-menu-tint-alpha';
export const MENU_TINT_SATURATE_CSS_VAR = '--user-menu-tint-saturate';
export const MENU_TINT_BACKDROP_SATURATE_CSS_VAR =
  '--user-menu-tint-backdrop-saturate';
export const MENU_TINT_BLUR_CSS_VAR = '--user-menu-tint-blur';

/** Knob value ranges. Must stay in sync with the slider min/max in
 *  `MenuTintSection` and the comment block in `glass.css`. */
export const MENU_TINT_DARKEN_MIN = 0;
export const MENU_TINT_DARKEN_MAX = 60;
export const MENU_TINT_ALPHA_MIN = 5;
export const MENU_TINT_ALPHA_MAX = 50;
export const MENU_TINT_SATURATE_MIN = 0;
export const MENU_TINT_SATURATE_MAX = 2;
export const MENU_TINT_BACKDROP_SATURATE_MIN = 0;
export const MENU_TINT_BACKDROP_SATURATE_MAX = 2;
export const MENU_TINT_BLUR_MIN = 0;
export const MENU_TINT_BLUR_MAX = 30;

/** Knob defaults. Reproduce the canonical shipped look (see file doc). */
export const MENU_TINT_DEFAULT_DARKEN = 35;
export const MENU_TINT_DEFAULT_ALPHA = 35;
export const MENU_TINT_DEFAULT_SATURATE = 1;
export const MENU_TINT_DEFAULT_BACKDROP_SATURATE = 0.8;
export const MENU_TINT_DEFAULT_BLUR = 10;

/** Persisted shape: numeric knobs only. */
export interface MenuTintKnobs {
  darken: number;
  alpha: number;
  saturate: number;
  backdropSaturate: number;
  blur: number;
}

/** Default knobs — match the `:root` defaults in `glass.css`. */
export const MENU_TINT_DEFAULTS: MenuTintKnobs = {
  darken: MENU_TINT_DEFAULT_DARKEN,
  alpha: MENU_TINT_DEFAULT_ALPHA,
  saturate: MENU_TINT_DEFAULT_SATURATE,
  backdropSaturate: MENU_TINT_DEFAULT_BACKDROP_SATURATE,
  blur: MENU_TINT_DEFAULT_BLUR,
};

/** One-click presets. Each `color` (host theme tokens) paints the chip dot and matching slider ticks. */
export const MENU_TINT_PRESETS: ReadonlyArray<{
  name: string;
  color: string;
  knobs: MenuTintKnobs;
}> = [
  { name: 'Smoked Navy', color: 'var(--color-primary)',        knobs: { darken: 35, alpha: 35, saturate: 1.0, backdropSaturate: 0.8, blur: 10 } },
  { name: 'Frost',       color: 'var(--color-success)',        knobs: { darken: 15, alpha: 50, saturate: 0.4, backdropSaturate: 0.5, blur: 14 } },
  { name: 'Vapor',       color: 'var(--color-warning)',        knobs: { darken: 25, alpha: 22, saturate: 0.8, backdropSaturate: 1.0, blur: 18 } },
  { name: 'Ink',         color: 'var(--color-danger)',         knobs: { darken: 55, alpha: 45, saturate: 1.4, backdropSaturate: 1.4, blur: 8 } },
  { name: 'Stone',       color: 'var(--color-text-secondary)', knobs: { darken: 40, alpha: 40, saturate: 0.0, backdropSaturate: 0.0, blur: 4 } },
];

/** Name of the canonical "default" preset. A reset action writes this
 *  preset's knobs (NOT a separate hardcoded constant) so default +
 *  reset stay coupled. */
export const MENU_TINT_DEFAULT_PRESET_NAME = 'Smoked Navy';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Validate-and-clamp a single knob value. NaN / Infinity / non-finite
 *  collapse to the default for that knob. */
function normalizeKnob(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return clamp(value, min, max);
}

/** Validate a partial/unknown object into a fully-populated, in-range
 *  `MenuTintKnobs`. Out-of-range fields clamp to range; missing/invalid
 *  fields fall back to defaults. */
export function normalizeMenuTintKnobs(value: unknown): MenuTintKnobs {
  const source = (value && typeof value === 'object' ? value : {}) as Record<
    string,
    unknown
  >;
  return {
    darken: normalizeKnob(
      source.darken,
      MENU_TINT_DARKEN_MIN,
      MENU_TINT_DARKEN_MAX,
      MENU_TINT_DEFAULT_DARKEN,
    ),
    alpha: normalizeKnob(
      source.alpha,
      MENU_TINT_ALPHA_MIN,
      MENU_TINT_ALPHA_MAX,
      MENU_TINT_DEFAULT_ALPHA,
    ),
    saturate: normalizeKnob(
      source.saturate,
      MENU_TINT_SATURATE_MIN,
      MENU_TINT_SATURATE_MAX,
      MENU_TINT_DEFAULT_SATURATE,
    ),
    backdropSaturate: normalizeKnob(
      source.backdropSaturate,
      MENU_TINT_BACKDROP_SATURATE_MIN,
      MENU_TINT_BACKDROP_SATURATE_MAX,
      MENU_TINT_DEFAULT_BACKDROP_SATURATE,
    ),
    blur: normalizeKnob(
      source.blur,
      MENU_TINT_BLUR_MIN,
      MENU_TINT_BLUR_MAX,
      MENU_TINT_DEFAULT_BLUR,
    ),
  };
}

/** True iff two knob sets compare exactly (used to highlight an active
 *  preset in the UI). */
export function knobsEqual(a: MenuTintKnobs, b: MenuTintKnobs): boolean {
  return (
    a.darken === b.darken &&
    a.alpha === b.alpha &&
    a.saturate === b.saturate &&
    a.backdropSaturate === b.backdropSaturate &&
    a.blur === b.blur
  );
}

/**
 * Persisted knobs, or `null` (missing, unavailable, bad JSON), meaning use CSS defaults and write
 * no overrides.
 */
export function readMenuTintKnobsFromStorage(
  storageKey: string = DEFAULT_MENU_TINT_STORAGE_KEY,
): MenuTintKnobs | null {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(storageKey);
  } catch {
    // localStorage unavailable (private mode, quota, etc.) — fall back
    // to the CSS default by returning null.
    return null;
  }

  if (raw === null) return null;

  try {
    return normalizeMenuTintKnobs(JSON.parse(raw));
  } catch {
    // Garbage JSON — treat as missing.
    return null;
  }
}

/** Persist knobs to localStorage under `storageKey`. Values are
 *  normalized first so an out-of-range write cannot poison the stored
 *  shape. */
export function writeMenuTintKnobsToStorage(
  knobs: MenuTintKnobs,
  storageKey: string = DEFAULT_MENU_TINT_STORAGE_KEY,
): void {
  const normalized = normalizeMenuTintKnobs(knobs);
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(normalized));
  } catch {
    // Silent failure is acceptable for a per-device cosmetic preference.
  }
}

/** Clear the persisted knobs, reverting to CSS defaults on next load. */
export function clearMenuTintKnobsFromStorage(
  storageKey: string = DEFAULT_MENU_TINT_STORAGE_KEY,
): void {
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    /* no-op */
  }
}

/**
 * Set the five variables on the root (`null` clears). `darken`/`alpha` get `%`, `blur` gets
 * `px`, saturations stay bare.
 */
export function applyMenuTintKnobs(knobs: MenuTintKnobs | null): void {
  const root = document.documentElement;
  if (knobs === null) {
    root.style.removeProperty(MENU_TINT_DARKEN_CSS_VAR);
    root.style.removeProperty(MENU_TINT_ALPHA_CSS_VAR);
    root.style.removeProperty(MENU_TINT_SATURATE_CSS_VAR);
    root.style.removeProperty(MENU_TINT_BACKDROP_SATURATE_CSS_VAR);
    root.style.removeProperty(MENU_TINT_BLUR_CSS_VAR);
    return;
  }
  const normalized = normalizeMenuTintKnobs(knobs);
  root.style.setProperty(MENU_TINT_DARKEN_CSS_VAR, `${normalized.darken}%`);
  root.style.setProperty(MENU_TINT_ALPHA_CSS_VAR, `${normalized.alpha}%`);
  root.style.setProperty(MENU_TINT_SATURATE_CSS_VAR, String(normalized.saturate));
  root.style.setProperty(
    MENU_TINT_BACKDROP_SATURATE_CSS_VAR,
    String(normalized.backdropSaturate),
  );
  root.style.setProperty(MENU_TINT_BLUR_CSS_VAR, `${normalized.blur}px`);
}

/**
 * Apply persisted knobs; call BEFORE the Solid root renders so first paint has the tint. No-op
 * without storage or `window`.
 */
export function bootstrapMenuTintFromStorage(
  storageKey: string = DEFAULT_MENU_TINT_STORAGE_KEY,
): void {
  if (typeof window === 'undefined') return;
  const knobs = readMenuTintKnobsFromStorage(storageKey);
  if (knobs === null) return;
  applyMenuTintKnobs(knobs);
}
