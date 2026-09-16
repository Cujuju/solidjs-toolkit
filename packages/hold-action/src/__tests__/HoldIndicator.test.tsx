import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createSignal } from 'solid-js';
import { render } from 'solid-js/web';
import { HoldIndicator } from '../HoldIndicator';

/**
 * jsdom has no layout: offsetWidth/offsetHeight are stubbed from the inline
 * style size, else from `data-w` / `data-h`.
 */
const offsetWidthDesc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
const offsetHeightDesc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');

function stubLayout(): void {
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get(this: HTMLElement) { return parseFloat(this.style.width) || Number(this.dataset.w ?? 0); },
  });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get(this: HTMLElement) { return parseFloat(this.style.height) || Number(this.dataset.h ?? 0); },
  });
}

function restoreLayout(): void {
  if (offsetWidthDesc) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', offsetWidthDesc);
  if (offsetHeightDesc) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', offsetHeightDesc);
}

type Point = { x: number; y: number };

/** Applies an SVG transform list (rotate/scale/translate) to a point, right-to-left. */
function applyTransform(transform: string, p: Point): Point {
  const ops = [...transform.matchAll(/(\w+)\(([^)]*)\)/g)].map((m) => ({
    name: m[1],
    args: m[2].trim().split(/[\s,]+/).map(Number),
  }));
  let { x, y } = p;
  for (const op of ops.reverse()) {
    if (op.name === 'translate') {
      x += op.args[0];
      y += op.args[1] ?? 0;
    } else if (op.name === 'scale') {
      x *= op.args[0];
      y *= op.args[1] ?? op.args[0];
    } else if (op.name === 'rotate') {
      const [deg, cx = 0, cy = 0] = op.args;
      const a = (deg * Math.PI) / 180;
      const dx = x - cx;
      const dy = y - cy;
      x = cx + dx * Math.cos(a) - dy * Math.sin(a);
      y = cy + dx * Math.sin(a) + dy * Math.cos(a);
    }
  }
  return { x, y };
}

const PRECISION = 6;
const PARENT_W = 100;
const PARENT_H = 100;

describe('HoldIndicator', () => {
  let container: HTMLDivElement;
  let dispose: (() => void) | undefined;

  beforeEach(() => {
    stubLayout();
    container = document.createElement('div');
    document.body.appendChild(container);
  });
  afterEach(() => {
    dispose?.();
    dispose = undefined;
    container.remove();
    restoreLayout();
  });

  const indicatorRoot = (): HTMLDivElement =>
    container.querySelector('[aria-hidden="true"]') as HTMLDivElement;

  describe('circle start point', () => {
    const cases: Array<{ direction: 'clockwise' | 'counterclockwise'; startAngle: number }> = [
      { direction: 'clockwise', startAngle: 0 },
      { direction: 'counterclockwise', startAngle: 0 },
      { direction: 'clockwise', startAngle: 45 },
      { direction: 'counterclockwise', startAngle: 45 },
    ];

    for (const { direction, startAngle } of cases) {
      it(`${direction} startAngle=${startAngle} starts at the same point and sweeps ${direction}`, () => {
        dispose = render(
          () => (
            <div data-w={PARENT_W} data-h={PARENT_H} style={{ position: 'relative' }}>
              <HoldIndicator progress={0.25} direction={direction} startAngle={startAngle} />
            </div>
          ),
          container,
        );
        const circle = container.querySelector('circle')!;
        const cx = Number(circle.getAttribute('cx'));
        const cy = Number(circle.getAttribute('cy'));
        const r = Number(circle.getAttribute('r'));
        const transform = circle.getAttribute('transform')!;

        // Screen angle (y-down): 0deg = top, clockwise positive.
        const a = (startAngle * Math.PI) / 180;
        const start = applyTransform(transform, { x: cx + r, y: cy });
        expect(start.x).toBeCloseTo(cx + r * Math.sin(a), PRECISION);
        expect(start.y).toBeCloseTo(cy - r * Math.cos(a), PRECISION);

        // A point just past the native start shows the sweep direction.
        const eps = 0.01;
        const next = applyTransform(transform, { x: cx + r * Math.cos(eps), y: cy + r * Math.sin(eps) });
        const cross = (start.x - cx) * (next.y - cy) - (start.y - cy) * (next.x - cx);
        expect(Math.sign(cross)).toBe(direction === 'clockwise' ? 1 : -1);
      });
    }
  });

  it('switches between fill-parent and explicit-size layout when size props change', () => {
    const [size, setSize] = createSignal<number | undefined>(undefined);
    dispose = render(
      () => (
        <div data-w={PARENT_W} data-h={PARENT_H} style={{ position: 'relative' }}>
          <HoldIndicator progress={0.5} size={size()} strokePlacement="on-border" />
        </div>
      ),
      container,
    );
    expect(indicatorRoot().style.position).toBe('absolute');
    expect(container.querySelector('svg')!.getAttribute('width')).toBe(String(PARENT_W));

    const EXPLICIT = 16;
    setSize(EXPLICIT);
    expect(indicatorRoot().style.position).toBe('relative');
    expect(indicatorRoot().style.width).toBe(`${EXPLICIT}px`);
    // Geometry must follow the new measurement target (self, not parent).
    expect(container.querySelector('svg')!.getAttribute('width')).toBe(String(EXPLICIT));

    setSize(undefined);
    expect(indicatorRoot().style.position).toBe('absolute');
    expect(container.querySelector('svg')!.getAttribute('width')).toBe(String(PARENT_W));
  });

  describe('explicit size', () => {
    const SIZE = 40;

    it('circle ring is centered on the explicit box', () => {
      dispose = render(() => <HoldIndicator progress={0.5} size={SIZE} />, container);
      const svg = container.querySelector('svg')!;
      const circle = container.querySelector('circle')!;
      const center = {
        x: parseFloat(svg.style.left) + Number(circle.getAttribute('cx')),
        y: parseFloat(svg.style.top) + Number(circle.getAttribute('cy')),
      };
      expect(center).toEqual({ x: SIZE / 2, y: SIZE / 2 });
    });

    it('rect path is centered on the explicit box', () => {
      dispose = render(() => <HoldIndicator progress={0.5} size={SIZE} shape="rect" />, container);
      const svg = container.querySelector('svg')!;
      const svgW = Number(svg.getAttribute('width'));
      const svgH = Number(svg.getAttribute('height'));
      const left = parseFloat(svg.style.left);
      const top = parseFloat(svg.style.top);
      expect(left + svgW / 2).toBe(SIZE / 2);
      expect(top + svgH / 2).toBe(SIZE / 2);
    });
  });

  it('bar fills the parent (inset 0) regardless of stroke placement offsets', () => {
    dispose = render(
      () => (
        <div data-w={PARENT_W} data-h={PARENT_H} style={{ position: 'relative' }}>
          <HoldIndicator progress={1} shape="bar" />
        </div>
      ),
      container,
    );
    const s = indicatorRoot().style;
    expect([s.top, s.right, s.bottom, s.left]).toEqual(['0px', '0px', '0px', '0px']);
  });
});
