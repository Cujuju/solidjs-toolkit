import { type JSX, Show } from 'solid-js';
import { centerOffset, DOT_INSET_PX, dotTranslate } from './_internal/dotPosition';

export interface PillToggleProps {
  enabled: boolean;
  onToggle: () => void;

  /**
   * Renders an indeterminate ("mixed") visual state — center-positioned dot
   * with dimmed fill — and emits `aria-checked="mixed"` (per W3C ARIA spec
   * for partially-selected role="switch").
   *
   * Use for bulk toggles representing a heterogeneous group (some-on /
   * some-off). `enabled` is still the "what would the next commit set"
   * prediction; consumer decides the target state in `onToggle`.
   *
   * Default false. Loading state takes precedence over indeterminate
   * (matches the precedence of `loading` over enabled visuals).
   */
  indeterminate?: boolean;

  // Sizing preset + raw overrides:
  size?: 'xs' | 'sm' | 'md' | 'lg';
  width?: number | string;
  height?: number | string;
  dotSize?: number | string;

  // Colors (inline overrides of CSS vars):
  onColor?: string;
  offColor?: string;
  dotColor?: string;

  // State:
  disabled?: boolean;
  readOnly?: boolean;
  loading?: boolean;

  // Icons (rendered inside the dot):
  onIcon?: JSX.Element;
  offIcon?: JSX.Element;

  // Animation (preset + raw overrides):
  animation?: 'linear' | 'ease' | 'bounce' | 'none';
  transitionMs?: number;
  easing?: string;
  pressEffect?: 'none' | 'scale' | 'ripple';

  // A11y:
  ariaLabel?: string;
  ariaLabelledBy?: string;
  title?: string;

  // Passthrough:
  class?: string;
  style?: JSX.CSSProperties;
  dataAttr?: Record<string, string>;
}

// Size presets: [width, height]. Dot defaults to height - 4.
const SIZE_PRESETS: Record<'xs' | 'sm' | 'md' | 'lg', { w: number; h: number }> = {
  xs: { w: 24, h: 12 },
  sm: { w: 28, h: 14 },
  md: { w: 32, h: 18 },
  lg: { w: 40, h: 22 },
};

// Animation preset defaults: [transitionMs, easing]
const ANIMATION_PRESETS: Record<'linear' | 'ease' | 'bounce' | 'none', { ms: number; easing: string }> = {
  linear: { ms: 150, easing: 'linear' },
  ease:   { ms: 150, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
  bounce: { ms: 300, easing: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)' },
  none:   { ms: 0,   easing: 'linear' },
};

function toCssSize(v: number | string | undefined): string | undefined {
  if (v === undefined) return undefined;
  return typeof v === 'number' ? `${v}px` : v;
}

export function PillToggle(props: PillToggleProps): JSX.Element {
  const preset = (): { w: number; h: number } => SIZE_PRESETS[props.size ?? 'md'];

  const width = (): string => toCssSize(props.width) ?? `${preset().w}px`;
  const height = (): string => toCssSize(props.height) ?? `${preset().h}px`;

  // Default dot size lives in the stylesheet (height minus twice the inset, aspect-ratio 1)
  // so a percentage `height` resolves against the pill. Only an explicit dotSize is inline.
  const dotSizeValue = (): number | string | undefined => props.dotSize;
  const dotSize = (): string | undefined => toCssSize(dotSizeValue());

  const anim = (): { ms: number; easing: string } => {
    const base = ANIMATION_PRESETS[props.animation ?? 'linear'];
    return {
      ms: props.transitionMs ?? base.ms,
      easing: props.easing ?? base.easing,
    };
  };

  const inactive = (): boolean => (props.disabled ?? false) || (props.readOnly ?? false) || (props.loading ?? false);

  const handleClick = (e: MouseEvent): void => {
    e.stopPropagation();
    if (inactive()) return;
    props.onToggle();
  };

  const handleKey = (e: KeyboardEvent): void => {
    // Space toggles; Enter is deliberately inert (APG lists Enter as optional
    // for role="switch").
    // A native <button> clicks on Enter, so cancel it to keep Enter inert.
    if (e.key === 'Enter') {
      e.preventDefault();
      return;
    }
    if (e.key === ' ') {
      e.preventDefault();
      if (inactive()) return;
      props.onToggle();
    }
  };

  // Inputs for the pure position helpers. Percentage bases differ per axis:
  // `top` against the pill, `translateX()` against the dot's own width.

  // Dot size as `translateX()` reads it: '100%' is the dot's own width, which is
  // exactly the stylesheet-sized default dot whatever unit sized the pill.
  const dotTrackSize = (): number | string => {
    if (props.dotSize !== undefined) return props.dotSize;
    if (typeof props.height === 'string') return '100%';
    return (props.height ?? preset().h) - DOT_INSET_PX * 2;
  };

  // Tangent inset on the stadium track — identical on both axes. The
  // stylesheet-sized default dot is inset by DOT_INSET_PX by construction.
  const dotInset = (): number | string =>
    props.dotSize === undefined ? DOT_INSET_PX : centerOffset(props.height ?? preset().h, props.dotSize);

  const dotTranslateValue = (): string => dotTranslate(
    props.enabled,
    props.indeterminate ?? false,
    props.width ?? preset().w,
    dotTrackSize(),
    dotInset(),
  );

  // `top` percentages refer to the pill's rendered box, so a CSS-string height
  // (e.g. '40%', '2rem') resolves as '100%' there.
  const dotTopValue = (): string => {
    if (props.dotSize === undefined) return `${DOT_INSET_PX}px`;
    const h = typeof props.height === 'string' ? '100%' : (props.height ?? preset().h);
    return centerOffset(h, props.dotSize);
  };

  const rootStyle = (): JSX.CSSProperties => {
    const s: JSX.CSSProperties = {
      width: width(),
      height: height(),
      'border-radius': `calc(${height()} / 2)`,
      '--tp-transition': `${anim().ms}ms ${anim().easing}`,
      ...(props.onColor ? { '--tp-on-bg': props.onColor } : {}),
      ...(props.offColor ? { '--tp-off-bg': props.offColor } : {}),
      ...(props.dotColor ? { '--tp-dot': props.dotColor } : {}),
      ...(props.style ?? {}),
    };
    return s;
  };

  const dotStyle = (): JSX.CSSProperties => {
    const explicit = dotSize();
    return {
      ...(explicit !== undefined ? { width: explicit, height: explicit } : {}),
      // Slide via a custom property so the stylesheet owns `transform` and can
      // compose the press effect onto it — `transform` stays compositor-only,
      // where animating `left` would force layout every frame.
      top: dotTopValue(),
      '--tp-dot-x': dotTranslateValue(),
    };
  };

  return (
    <button
      type="button"
      role="switch"
      class={`ctp-root ${props.class ?? ''}`.trim()}
      style={rootStyle()}
      aria-checked={props.indeterminate ? 'mixed' : props.enabled}
      aria-disabled={props.disabled ? true : undefined}
      aria-readonly={props.readOnly ? true : undefined}
      aria-busy={props.loading ? true : undefined}
      aria-label={props.ariaLabel}
      aria-labelledby={props.ariaLabelledBy}
      title={props.title}
      disabled={props.disabled}
      data-press-effect={props.pressEffect ?? 'none'}
      onClick={handleClick}
      onKeyDown={handleKey}
      {...(props.dataAttr ?? {})}
    >
      <span class="ctp-dot" style={dotStyle()}>
        <Show when={props.loading}>
          <span class="ctp-spinner" aria-hidden="true" />
        </Show>
        <Show when={!props.loading && props.enabled && props.onIcon}>
          {props.onIcon}
        </Show>
        <Show when={!props.loading && !props.enabled && props.offIcon}>
          {props.offIcon}
        </Show>
      </span>
    </button>
  );
}
