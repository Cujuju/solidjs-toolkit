import { For, createSignal, onMount } from 'solid-js';
import './glass.css';
import './menu-tint.css';
import {
  MENU_TINT_ALPHA_MAX,
  MENU_TINT_ALPHA_MIN,
  MENU_TINT_BACKDROP_SATURATE_MAX,
  MENU_TINT_BACKDROP_SATURATE_MIN,
  MENU_TINT_BLUR_MAX,
  MENU_TINT_BLUR_MIN,
  MENU_TINT_DARKEN_MAX,
  MENU_TINT_DARKEN_MIN,
  MENU_TINT_DEFAULTS,
  MENU_TINT_DEFAULT_BLUR,
  MENU_TINT_PRESETS,
  MENU_TINT_SATURATE_MAX,
  MENU_TINT_SATURATE_MIN,
  type MenuTintKnobs,
  applyMenuTintKnobs,
  knobsEqual,
  readMenuTintKnobsFromStorage,
  writeMenuTintKnobsToStorage,
} from './menuTint';

/**
 * Menu tint settings section — five knob sliders + named presets over
 * the surface-derived `--surface-glass-menu-tint` formula. The final
 * tint is composed entirely in CSS from `--color-surface` (host theme
 * value) and the knob CSS vars; this section only writes the knob
 * values to `document.documentElement` + localStorage.
 *
 * Storage shape is the knob object (NOT a final color string) so host
 * theme swaps continue to flow through to menus and the user's intent
 * is preserved across theme changes.
 *
 * `storageKey` lets a host pin the localStorage key to its own
 * namespace (and preserve already-stored values); it defaults to the
 * engine's `DEFAULT_MENU_TINT_STORAGE_KEY`.
 */
export interface MenuTintSectionProps {
  /** localStorage key for the persisted knobs. Defaults to the engine's
   *  `DEFAULT_MENU_TINT_STORAGE_KEY`. */
  storageKey?: string;
}

/** A single tick mark — value position on the axis + color of the
 *  preset that owns it. */
interface TickDescriptor {
  value: number;
  color: string;
}

/**
 * Sorted, deduped tick descriptors for one knob. Hoisted to module
 * scope (computed once at import) — the preset list is static.
 */
function buildTicks(key: keyof MenuTintKnobs): TickDescriptor[] {
  const seen = new Map<number, string>();
  for (const preset of MENU_TINT_PRESETS) {
    const v = preset.knobs[key];
    if (!seen.has(v)) seen.set(v, preset.color);
  }
  return [...seen.entries()]
    .map(([value, color]) => ({ value, color }))
    .sort((a, b) => a.value - b.value);
}

const DARKEN_TICKS = buildTicks('darken');
const ALPHA_TICKS = buildTicks('alpha');
const SATURATE_TICKS = buildTicks('saturate');
const BACKDROP_SATURATE_TICKS = buildTicks('backdropSaturate');
const BLUR_TICKS = buildTicks('blur');

export function MenuTintSection(props: MenuTintSectionProps) {
  const [knobs, setKnobsState] = createSignal<MenuTintKnobs>({
    ...MENU_TINT_DEFAULTS,
  });

  onMount(() => {
    const stored = readMenuTintKnobsFromStorage(props.storageKey);
    if (stored !== null) setKnobsState(stored);
  });

  function commit(next: MenuTintKnobs) {
    setKnobsState(next);
    applyMenuTintKnobs(next);
    writeMenuTintKnobsToStorage(next, props.storageKey);
  }

  function setKnob<K extends keyof MenuTintKnobs>(key: K, value: number) {
    commit({ ...knobs(), [key]: value });
  }

  function applyPreset(preset: MenuTintKnobs) {
    commit({ ...preset });
  }

  return (
    <div class="cujuju-mt-section">
      <div class="cujuju-mt-label">Menu Tint</div>
      <p class="cujuju-mt-description">
        Adjust the smoked-glass tint of menus and flyouts. The base color
        comes from your current theme's surface — these knobs darken,
        translucify, and saturate it.
      </p>

      <div class="cujuju-mt-knobs">
        <KnobSlider
          label="Darken"
          description="How much black mixes into the surface color before the menu paints. Higher values make the menu darker. 0% leaves the surface untouched; 60% mixes mostly black."
          variant="darken"
          min={MENU_TINT_DARKEN_MIN}
          max={MENU_TINT_DARKEN_MAX}
          step={1}
          suffix="%"
          value={knobs().darken}
          presetTicks={DARKEN_TICKS}
          onInput={(v) => setKnob('darken', v)}
        />
        <KnobSlider
          label="Alpha"
          description="Menu surface translucency. Higher values make the menu more solid (less see-through). 5% is almost transparent; 50% is nearly opaque."
          variant="alpha"
          min={MENU_TINT_ALPHA_MIN}
          max={MENU_TINT_ALPHA_MAX}
          step={1}
          suffix="%"
          value={knobs().alpha}
          presetTicks={ALPHA_TICKS}
          onInput={(v) => setKnob('alpha', v)}
        />
        <KnobSlider
          label="Saturate"
          description="Saturation multiplier on the menu's own surface color before mixing. Affects the smoked tint itself, not the backdrop. 0 is grayscale, 1 unchanged, 2 doubles it."
          variant="saturate"
          min={MENU_TINT_SATURATE_MIN}
          max={MENU_TINT_SATURATE_MAX}
          step={0.05}
          value={knobs().saturate}
          presetTicks={SATURATE_TICKS}
          onInput={(v) => setKnob('saturate', v)}
          format={(v) => v.toFixed(2)}
        />
        <KnobSlider
          label="Backdrop"
          description="Saturation multiplier on colors bleeding THROUGH the menu from page content behind it. 0 is grayscale (smoky), 1 unchanged, 2 over-saturated."
          variant="saturate"
          min={MENU_TINT_BACKDROP_SATURATE_MIN}
          max={MENU_TINT_BACKDROP_SATURATE_MAX}
          step={0.05}
          value={knobs().backdropSaturate}
          presetTicks={BACKDROP_SATURATE_TICKS}
          onInput={(v) => setKnob('backdropSaturate', v)}
          format={(v) => v.toFixed(2)}
        />
        <KnobSlider
          label="Blur"
          description={`Gaussian blur radius applied to the page content behind the menu. Higher values blur more strongly; 0 turns blur off entirely. Default: ${MENU_TINT_DEFAULT_BLUR}px.`}
          variant="saturate"
          min={MENU_TINT_BLUR_MIN}
          max={MENU_TINT_BLUR_MAX}
          step={1}
          suffix="px"
          value={knobs().blur}
          presetTicks={BLUR_TICKS}
          onInput={(v) => setKnob('blur', v)}
        />
      </div>

      <div class="cujuju-mt-presets">
        <For each={MENU_TINT_PRESETS}>
          {(preset) => {
            const active = () => knobsEqual(knobs(), preset.knobs);
            return (
              <button
                type="button"
                class={`cujuju-mt-preset-chip${
                  active() ? ' cujuju-mt-preset-chip--active' : ''
                }`}
                onClick={() => applyPreset(preset.knobs)}
                aria-pressed={active()}
                title={`Apply ${preset.name} preset`}
              >
                <span
                  class="cujuju-mt-preset-dot"
                  style={{ background: preset.color }}
                  aria-hidden="true"
                />
                {preset.name}
              </button>
            );
          }}
        </For>
      </div>

      {/* Live preview — an actual `.glass-menu` surface over a black +
          white reference backdrop so the user can see how the smoked-
          glass treatment at the chosen knobs reads against extreme
          luminances. Auto-updates because the knob CSS vars are at
          root scope. */}
      <div class="cujuju-mt-preview-stage">
        <div class="cujuju-mt-preview-backdrop" aria-hidden="true">
          <div class="cujuju-mt-preview-box-black" />
          <div class="cujuju-mt-preview-box-white" />
        </div>
        <div class="cujuju-mt-preview glass-menu" role="presentation">
          <div class="cujuju-mt-preview-row cujuju-mt-preview-row--primary">
            <span>Primary action</span>
          </div>
          <div class="cujuju-mt-preview-row cujuju-mt-preview-row--secondary">
            <span>Secondary action</span>
            <span class="cujuju-mt-preview-pill">12</span>
          </div>
          <div class="cujuju-mt-preview-divider" />
          <div class="cujuju-mt-preview-footer">Footer label</div>
        </div>
      </div>
    </div>
  );
}

interface KnobSliderProps {
  label: string;
  /** Hover tooltip describing what the knob controls. Surfaced via the
   *  native `title` attribute on the label. */
  description: string;
  /** Track variant — selects the gradient class previewing the knob's
   *  effect. */
  variant: 'darken' | 'alpha' | 'saturate';
  min: number;
  max: number;
  step: number;
  suffix?: string;
  value: number;
  /** Sorted preset tick descriptors — value + color per tick. */
  presetTicks: TickDescriptor[];
  onInput: (next: number) => void;
  format?: (value: number) => string;
}

function KnobSlider(props: KnobSliderProps) {
  const display = () => {
    const raw = props.format ? props.format(props.value) : String(props.value);
    return props.suffix ? `${raw}${props.suffix}` : raw;
  };
  const trackBgVariantClass = () => {
    switch (props.variant) {
      case 'darken':
        return 'cujuju-mt-knob-track-bg-darken';
      case 'alpha':
        return 'cujuju-mt-knob-track-bg-alpha';
      case 'saturate':
        return 'cujuju-mt-knob-track-bg-saturate';
    }
  };
  // Tick position as a 0-100 unitless number consumed by CSS via the
  // `--cujuju-mt-tick-pct` custom property. CSS anchors the tick to the
  // thumb's reachable extremes so a tick at value=min lands exactly
  // where the thumb's center sits at min.
  const tickPercent = (value: number): number => {
    const span = props.max - props.min;
    if (span === 0) return 0;
    return ((value - props.min) / span) * 100;
  };
  return (
    <div class="cujuju-mt-knob-row">
      <label class="cujuju-mt-knob-label" title={props.description}>
        {props.label}
      </label>
      <div class="cujuju-mt-knob-track-wrap">
        <div
          class={`cujuju-mt-knob-track-bg ${trackBgVariantClass()}`}
          aria-hidden="true"
        />
        <div class="cujuju-mt-knob-tick-row" aria-hidden="true">
          <For each={props.presetTicks}>
            {(tick) => (
              <span
                class="cujuju-mt-knob-tick"
                style={{
                  '--cujuju-mt-tick-pct': tickPercent(tick.value),
                  background: tick.color,
                }}
              />
            )}
          </For>
        </div>
        <input
          type="range"
          min={props.min}
          max={props.max}
          step={props.step}
          value={props.value}
          class="cujuju-mt-knob-slider"
          onInput={(e) => props.onInput(parseFloat(e.currentTarget.value))}
          aria-label={`Menu tint ${props.label.toLowerCase()}`}
        />
      </div>
      <span class="cujuju-mt-knob-value">{display()}</span>
    </div>
  );
}
