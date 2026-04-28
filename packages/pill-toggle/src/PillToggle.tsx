import { type JSX, Show } from 'solid-js';
import { dotTranslate } from './_internal/dotPosition';

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

  // Default dot size = height - 4 (2px padding on each side).
  const dotSize = (): string => {
    if (props.dotSize !== undefined) return toCssSize(props.dotSize)!;
    const h = typeof props.height === 'number' ? props.height : preset().h;
    return `${h - 4}px`;
  };

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
    // Space toggles; Enter does NOT (matches role="switch" spec)
    if (e.key === ' ') {
      e.preventDefault();
      if (inactive()) return;
      props.onToggle();
    }
  };

  // Resolve the numeric width and dot-size used by the pure dotTranslate helper.
  // The CSS-string variants (when consumers pass strings like '40%') fall back
  // to preset numbers — matching the existing behavior; non-numeric inputs are
  // not directly supported by the math.
  const dotTranslateValue = (): string => {
    const w = typeof props.width === 'number' ? props.width : preset().w;
    const d = typeof props.dotSize === 'number'
      ? props.dotSize
      : (typeof props.height === 'number' ? props.height : preset().h) - 4;
    return dotTranslate(props.enabled, props.indeterminate ?? false, w, d);
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

  const dotStyle = (): JSX.CSSProperties => ({
    width: dotSize(),
    height: dotSize(),
    top: '2px',
    transform: `translateX(${dotTranslateValue()})`,
  });

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
