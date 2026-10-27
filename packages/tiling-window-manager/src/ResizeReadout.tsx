import { createEffect, createSignal, For, Show, type JSX } from 'solid-js';
import type { LayoutHandle } from './layout';
import { collapsedIndices, viewShares } from './tileCollapse';
import { slotKey, type TileNode } from './tileTree';

/** Which side of the divider the readout sits on: before (`a`) or after (`b`). */
export type ReadoutSide = 'a' | 'b';

/** Clearance between the divider and the readout's near edge. */
const READOUT_OFFSET_PX = 10;
/** The readout shows tenths of a percent. */
const TENTHS_PER_PERCENT = 10;
const TENTHS_PER_WHOLE = 100 * TENTHS_PER_PERCENT;
/** Fill for a nested split, which has no single tile colour. */
const NESTED_COLOR = 'var(--twm-text-muted, #9ca3af)';
const DEFAULT_COLOR = 'var(--twm-accent, #8b5cf6)';
/** Shortest map along the split axis. */
const MAP_MIN_PX = { row: 150, column: 96 } as const;
/** Longest map; past it, cells too small for their numbers widen and exact proportion gives way. */
const MAP_MAX_PX = { row: 360, column: 240 } as const;

/** Largest-remainder rounding to tenths, so the shown percents always total 100.0. */
export function percentTenths(shares: readonly number[]): number[] {
  const total = shares.reduce((sum, share) => sum + share, 0);
  if (total <= 0) return shares.map(() => 0);
  const exact = shares.map((share) => share / total * TENTHS_PER_WHOLE);
  const tenths = exact.map(Math.floor);
  const order = exact.map((value, i) => ({ i, rest: value - tenths[i] })).sort((x, y) => y.rest - x.rest);
  const missing = TENTHS_PER_WHOLE - tenths.reduce((sum, value) => sum + value, 0);
  for (let k = 0; k < missing; k++) tenths[order[k].i] += 1;
  return tenths;
}

/** Whole-split readout for a divider drag: share first, on-screen pixels second; the traded pair is lit. */
export function ResizeReadout(props: {
  handle: LayoutHandle;
  shares: readonly number[];
  side: ReadoutSide;
  alignedWith?: string;
  color?: (id: string) => string;
}) {
  const dir = () => props.handle.split.dir;
  const axis = () => (dir() === 'row' ? 'width' : 'height');
  const collapsed = () => collapsedIndices(props.handle.split);
  // Shares are own shares; the readout shows what is on screen.
  const tenths = () => percentTenths(viewShares({ ...props.handle.split, sizes: [...props.shares] }).map((share, i) => (collapsed().has(i) ? 0 : share)));
  const lengths = () => props.handle.childRects.map((rect) => rect[axis()]);
  const nodeColor = (node: TileNode) => (node.kind === 'split' ? NESTED_COLOR : props.color?.(slotKey(node)) ?? DEFAULT_COLOR);
  let map!: HTMLDivElement;
  const cells: HTMLDivElement[] = [];
  const labels: HTMLDivElement[] = [];
  const [fitLength, setFitLength] = createSignal(0);
  // Shortest map at which every cell, sized in proportion, still holds its own numbers.
  createEffect(() => {
    const shown = lengths();
    tenths(); // Label text changes with the shares.
    const total = shown.reduce((sum, length) => sum + length, 0);
    const size = axis() === 'width' ? 'offsetWidth' : 'offsetHeight';
    const inner = axis() === 'width' ? 'clientWidth' : 'clientHeight';
    const style = getComputedStyle(map);
    const gap = parseFloat(axis() === 'width' ? style.columnGap : style.rowGap) || 0;
    const mark = map.querySelector<HTMLElement>('.twm-readout-gap')?.[size] ?? 0;
    const fixed = gap * (map.childElementCount - 1) + mark;
    const needed = cells.slice(0, shown.length).map((cell, i) => (shown[i] > 0 && total > 0 ? (labels[i][size] + cell[size] - cell[inner]) * total / shown[i] : 0));
    setFitLength(fixed + Math.max(0, ...needed));
  });
  const mapLength = () => Math.min(MAP_MAX_PX[dir()], Math.max(MAP_MIN_PX[dir()], fitLength()));
  const position = (): JSX.CSSProperties => {
    const { rect, childRects, a, b } = props.handle;
    const before = props.side === 'a';
    const pane = childRects[before ? a : b];
    if (dir() === 'row') {
      return {
        left: `${before ? rect.x - READOUT_OFFSET_PX : rect.x + rect.width + READOUT_OFFSET_PX}px`,
        top: `${pane.y + pane.height / 2}px`,
        transform: `translate(${before ? '-100%' : '0'}, -50%)`,
      };
    }
    return {
      left: `${pane.x + pane.width / 2}px`,
      top: `${before ? rect.y - READOUT_OFFSET_PX : rect.y + rect.height + READOUT_OFFSET_PX}px`,
      transform: `translate(-50%, ${before ? '-100%' : '0'})`,
    };
  };
  return (
    <div class="twm-readout" data-dir={dir()} data-side={props.side} aria-hidden="true" style={position()}>
      <div ref={map} class="twm-readout-map" style={{ [`min-${axis()}`]: `${mapLength()}px` }}>
        <For each={props.handle.split.children}>
          {(child, index) => (
            <>
              <div ref={(el) => { cells[index()] = el; }} class="twm-readout-cell" data-cell={index()}
                data-traded={index() === props.handle.a || index() === props.handle.b ? '' : undefined}
                style={{ flex: `${lengths()[index()]} 1 0`, '--twm-readout-color': nodeColor(child) }}>
                <div ref={(el) => { labels[index()] = el; }} class="twm-readout-label">
                  <b>{collapsed().has(index()) ? 'collapsed' : `${(tenths()[index()] / TENTHS_PER_PERCENT).toFixed(1)}%`}</b>
                  <span>{collapsed().has(index()) ? '' : `${Math.round(lengths()[index()])} px`}</span>
                </div>
              </div>
              <Show when={index() === props.handle.gap}><i class="twm-readout-gap" /></Show>
            </>
          )}
        </For>
      </div>
      <div class="twm-readout-total">{Math.round(props.handle.extentPx)} px</div>
      <Show when={props.alignedWith}><div class="twm-readout-aligned">Aligned with {props.alignedWith}</div></Show>
      <div class="twm-readout-hint"><span>Flip (Shift)</span><span>Free drag (Ctrl)</span></div>
    </div>
  );
}
