import { createSignal, createMemo, onMount, onCleanup, Show, type Accessor, type JSX } from 'solid-js';
import { measureLayoutBox } from './_internal/measure';
import { strokeOuterOffset as computeStrokeOuterOffset, type StrokePlacement } from './_internal/placement';
import { applyEasing } from './_internal/easing';

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

  // Stroke:
  stroke?: string;
  strokeWidth?: number;
  strokeLinecap?: 'butt' | 'round' | 'square';

  // Rect-specific: matches the parent button's border-radius.
  radius?: number;

  // Path origin:
  startAngle?: number;
  direction?: 'clockwise' | 'counterclockwise';

  /**
   * Where the stroke sits relative to the parent's border.
   *
   *   'outside'   — stroke entirely outside the parent's border.
   *                 Stroke INNER edge at border OUTER edge. (Default.)
   *   'center'    — stroke centered on the border's outer edge
   *                 (half outside border, half inside padding).
   *   'on-border' — stroke OUTER edge at border OUTER edge;
   *                 extends inward over the border and into padding.
   *   'inside'    — stroke OUTER edge at border INNER edge (padding-edge);
   *                 stroke contained entirely within the padding area.
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
   * Optional easing curve applied to progress before the indicator's geometry
   * is computed. Pure function `t => t'`, both in `[0, 1]`. Output is clamped,
   * so an overshoot/undershoot easing won't break geometry.
   *
   * Default: undefined (linear progress, identical to pre-easing behavior).
   *
   *   easing={(t) => t * t}                                       // ease-in
   *   easing={(t) => 1 - Math.pow(1 - t, 3)}                      // ease-out
   *   easing={(t) => t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2)/2} // ease-in-out
   */
  easing?: (t: number) => number;

  class?: string;
  style?: JSX.CSSProperties;
}

function toCssSize(v: number | string | undefined): string | undefined {
  if (v === undefined) return undefined;
  return typeof v === 'number' ? `${v}px` : v;
}

function readProgress(p: HoldIndicatorProps['progress']): number {
  return typeof p === 'function' ? Math.max(0, Math.min(1, p())) : Math.max(0, Math.min(1, p));
}

function easedProgress(p: HoldIndicatorProps['progress'], easing?: (t: number) => number): number {
  return applyEasing(readProgress(p), easing);
}

/**
 * Visual progress indicator. SVG + circle/path are created once; only the
 * animated `stroke-dashoffset` (or bar width) updates per frame.
 */
export function HoldIndicator(props: HoldIndicatorProps): JSX.Element {
  const shape = (): 'circle' | 'rect' | 'bar' => props.shape ?? 'circle';
  const strokeWidth = (): number => props.strokeWidth ?? 2;
  const stroke = (): string => props.stroke ?? 'currentColor';
  const radius = (): number => props.radius ?? 6;
  const direction = (): 'clockwise' | 'counterclockwise' =>
    props.direction ?? 'clockwise';
  const placement = (): 'outside' | 'center' | 'on-border' | 'inside' =>
    props.strokePlacement ?? 'outside';
  const strokeInset = (): number => props.strokeInset ?? 0;

  const explicitSize =
    props.width !== undefined || props.height !== undefined || props.size !== undefined;
  const fillParent = (): boolean => props.fillParent ?? !explicitSize;

  const width = (): string | undefined =>
    toCssSize(props.size ?? props.width);
  const height = (): string | undefined =>
    toCssSize(props.size ?? props.height);

  let rootEl: HTMLDivElement | undefined;
  const [measuredSize, setMeasuredSize] = createSignal({ w: 0, h: 0 });
  const [borderOffsets, setBorderOffsets] = createSignal({ t: 0, r: 0, b: 0, l: 0 });

  onMount(() => {
    if (!rootEl) return;
    const target = fillParent() ? rootEl.parentElement : rootEl;
    if (!target) return;

    const measure = (): void => {
      // Layout box (unscaled by transforms). See measureLayoutBox for rationale.
      setMeasuredSize(measureLayoutBox(target));
      if (fillParent()) {
        const cs = getComputedStyle(target);
        setBorderOffsets({
          t: parseFloat(cs.borderTopWidth) || 0,
          r: parseFloat(cs.borderRightWidth) || 0,
          b: parseFloat(cs.borderBottomWidth) || 0,
          l: parseFloat(cs.borderLeftWidth) || 0,
        });
      }
    };
    measure();

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(measure);
      ro.observe(target);
      onCleanup(() => ro.disconnect());
    }
  });

  /**
   * Signed distance from parent's border-OUTER edge to the stroke's OUTER edge.
   * Positive = stroke outer extends past border-outer (outward).
   * Negative = stroke outer is inside border-outer (toward button center).
   *
   * Measured per side using the parent's border widths (may be asymmetric).
   */
  const strokeOuterOffset = (): { t: number; r: number; b: number; l: number } =>
    computeStrokeOuterOffset(placement(), strokeWidth(), borderOffsets(), strokeInset());

  // Wrapper occupies exactly the rect that the SVG needs to draw the full
  // stroke. Left/top offsets are negative from the parent's padding-edge
  // (where inset:0 sits). Size = border-box + sum of outer offsets on each side.
  const rootStyle = (): JSX.CSSProperties => {
    if (fillParent()) {
      const o = borderOffsets();
      const out = strokeOuterOffset();
      return {
        position: 'absolute',
        // Each inset = -(borderOffset + outerOffset). When outerOffset is
        // negative (inside mode), the wrapper sits INSIDE the padding-edge
        // on that side.
        top: `${-(o.t + out.t)}px`,
        right: `${-(o.r + out.r)}px`,
        bottom: `${-(o.b + out.b)}px`,
        left: `${-(o.l + out.l)}px`,
        'pointer-events': 'none',
        ...(props.style ?? {}),
      };
    }
    return {
      position: 'relative',
      width: width(),
      height: height(),
      'pointer-events': 'none',
      ...(props.style ?? {}),
    };
  };

  // Wrapper dimensions in px (for SVG sizing). Derived from measured border-
  // box + outer offsets on each side.
  const wrapperDims = createMemo(() => {
    const s = measuredSize();
    const out = strokeOuterOffset();
    return {
      w: s.w + out.l + out.r,
      h: s.h + out.t + out.b,
    };
  });

  // ── Circle geometry ────────────────────────────────────────────────────
  // Stroke OUTER edge should touch the circle inscribed in the (parent's
  // border-box expanded by outer offset). For symmetric offsets this is a
  // square; use the min side for the inscribed circle.
  const circleGeom = createMemo(() => {
    const w = wrapperDims();
    const side = Math.min(w.w, w.h);
    if (side <= 0) return null;
    const sw = strokeWidth();
    // Stroke outer radius in wrapper coords = half of min dimension
    const strokeOuterR = side / 2;
    // Path radius (center of stroke) = outer - sw/2
    const r = Math.max(0, strokeOuterR - sw / 2);
    const cx = w.w / 2;
    const cy = w.h / 2;
    const circumference = 2 * Math.PI * r;
    const rotate = (direction() === 'counterclockwise' ? -1 : 1) * (props.startAngle ?? 0) - 90;
    return { w: w.w, h: w.h, cx, cy, r, sw, circumference, rotate };
  });

  const circleDashOffset = (): number => {
    const g = circleGeom();
    if (!g) return 0;
    return g.circumference * (1 - easedProgress(props.progress, props.easing));
  };

  // ── Rect geometry ──────────────────────────────────────────────────────
  // Path traces a rounded rectangle whose STROKE OUTER edge has corner
  // radius = parent's radius + (avg outer offset). The outer offset adjusts
  // the effective corner curve as the stroke moves outward/inward.
  const rectGeom = createMemo(() => {
    const w = wrapperDims();
    if (w.w <= 0 || w.h <= 0) return null;
    const sw = strokeWidth();
    const out = strokeOuterOffset();
    const avgOut = (out.t + out.r + out.b + out.l) / 4;
    // Path inset from wrapper edges so stroke outer touches wrapper edges.
    const inset = sw / 2;
    const pathW = w.w - sw;
    const pathH = w.h - sw;
    // Desired stroke OUTER radius = parent's border-radius + avgOut.
    // Path radius (stroke center) = stroke-outer - sw/2.
    const strokeOuterR = Math.max(0, radius() + avgOut);
    const r = Math.max(0, Math.min(strokeOuterR - sw / 2, Math.min(pathW, pathH) / 2));
    const d = [
      `M ${w.w / 2} ${inset}`,
      `H ${inset + pathW - r}`,
      `A ${r} ${r} 0 0 1 ${inset + pathW} ${inset + r}`,
      `V ${inset + pathH - r}`,
      `A ${r} ${r} 0 0 1 ${inset + pathW - r} ${inset + pathH}`,
      `H ${inset + r}`,
      `A ${r} ${r} 0 0 1 ${inset} ${inset + pathH - r}`,
      `V ${inset + r}`,
      `A ${r} ${r} 0 0 1 ${inset + r} ${inset}`,
      `H ${w.w / 2}`,
    ].join(' ');
    const perimeter = 2 * (pathW + pathH - 4 * r) + 2 * Math.PI * r;
    return { w: w.w, h: w.h, d, perimeter, sw };
  });

  const rectDashOffset = (): number => {
    const g = rectGeom();
    if (!g) return 0;
    return g.perimeter * (1 - easedProgress(props.progress, props.easing));
  };

  const barWidthPct = (): string => `${easedProgress(props.progress, props.easing) * 100}%`;

  return (
    <div
      ref={rootEl}
      class={props.class}
      style={rootStyle()}
      aria-hidden="true"
    >
      <Show when={shape() === 'circle' && circleGeom()}>
        {(g) => (
          <svg
            width={g().w}
            height={g().h}
            style={{ position: 'absolute', top: '0', left: '0', overflow: 'visible' }}
          >
            <circle
              cx={g().cx}
              cy={g().cy}
              r={g().r}
              fill="none"
              stroke={stroke()}
              stroke-width={g().sw}
              stroke-linecap={props.strokeLinecap ?? 'round'}
              stroke-dasharray={`${g().circumference}`}
              stroke-dashoffset={circleDashOffset()}
              transform={
                `rotate(${g().rotate} ${g().cx} ${g().cy})` +
                (direction() === 'counterclockwise'
                  ? ` scale(-1 1) translate(${-2 * g().cx} 0)`
                  : '')
              }
            />
          </svg>
        )}
      </Show>

      <Show when={shape() === 'rect' && rectGeom()}>
        {(g) => (
          <svg
            width={g().w}
            height={g().h}
            style={{ position: 'absolute', top: '0', left: '0', overflow: 'visible' }}
          >
            <path
              d={g().d}
              fill="none"
              stroke={stroke()}
              stroke-width={g().sw}
              stroke-linecap={props.strokeLinecap ?? 'square'}
              stroke-dasharray={`${g().perimeter}`}
              stroke-dashoffset={rectDashOffset()}
            />
          </svg>
        )}
      </Show>

      <Show when={shape() === 'bar' && measuredSize().w > 0}>
        <div
          style={{
            position: 'absolute',
            inset: '0',
            overflow: 'hidden',
            'pointer-events': 'none',
          }}
        >
          <div
            style={{
              position: 'absolute',
              'inset-inline-start': '0',
              top: '0',
              bottom: '0',
              width: barWidthPct(),
              background: stroke(),
            }}
          />
        </div>
      </Show>
    </div>
  );
}
