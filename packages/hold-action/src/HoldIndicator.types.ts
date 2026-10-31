import type { Accessor, JSX } from 'solid-js';

export interface HoldIndicatorProps {
  /** Progress 0→1. Accepts plain number or reactive accessor. */
  progress: Accessor<number> | number;

  shape?: 'circle' | 'rect' | 'bar';

  // Sizing — by default fills parent via position: absolute; inset: 0.
  width?: number | string;
  height?: number | string;
  /** Shorthand for square: width = height. */
  size?: number | string;
  /** Default true when no explicit w/h/size provided. */
  fillParent?: boolean;

  stroke?: string;
  strokeWidth?: number;
  strokeLinecap?: 'butt' | 'round' | 'square';

  // Rect-specific: matches the parent button's border-radius.
  radius?: number;

  startAngle?: number;
  direction?: 'clockwise' | 'counterclockwise';

  /**
   * Where the stroke sits relative to the parent's border: `outside` (default) beyond it,
   * `center` straddling its outer edge, `on-border` inward from it, `inside` at the padding edge.
   */
  strokePlacement?: 'outside' | 'center' | 'on-border' | 'inside';

  /**
   * Additional inward offset in px, applied on top of `strokePlacement`.
   * Positive values push the stroke further into the button's interior.
   * Negative values push it further outward.
   * Default 0.
   */
  strokeInset?: number;

  /**
   * Easing applied to progress before geometry, `t => t'` in `[0, 1]`; output is clamped, so
   * overshoot is safe. Default linear.
   */
  easing?: (t: number) => number;

  class?: string;
  style?: JSX.CSSProperties;
}

