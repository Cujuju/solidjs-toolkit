import { cleanup, fireEvent, render } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { TilingWorkspace } from '../TilingWorkspace';
import { tileIds, type TileNode } from '../tileTree';

const WIDTH = 410;
const HEIGHT = 300;
const GAP = 10;
const MIN = 50;
const t = (id: string): TileNode => ({ kind: 'tile', id });
const pair: TileNode = { kind: 'split', dir: 'row', sizes: [1, 1], children: [t('a'), t('b')] };

beforeAll(() => {
  // jsdom has no layout; the workspace measures its own client size.
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => WIDTH });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => HEIGHT });
});
afterEach(cleanup);

function setup(initial: TileNode | undefined, placing?: { id: string; label: string }) {
  const [layout, setLayout] = createSignal<TileNode | undefined>(initial);
  const onLayoutChange = vi.fn((next: TileNode | undefined) => setLayout(next));
  const onPlace = vi.fn((_id: string, next: TileNode) => setLayout(next));
  const view = render(() => (
    <TilingWorkspace layout={layout()} onLayoutChange={onLayoutChange} gapPx={GAP} minSize={() => ({ width: MIN, height: MIN })}
      placing={placing} onPlace={onPlace}>
      {(tile) => (
        <div data-testid={`tile-${tile.id}`}>
          <header data-testid={`grip-${tile.id}`} onPointerDown={tile.startMove}>{tile.id}</header>
          <button type="button" onClick={tile.remove}>Remove {tile.id}</button>
        </div>
      )}
    </TilingWorkspace>
  ));
  return { ...view, layout, onLayoutChange, onPlace };
}

const tileBox = (container: HTMLElement, id: string) => (container.querySelector(`[data-tile-id="${id}"]`) as HTMLElement).style;

describe('TilingWorkspace', () => {
  it('positions tiles by share and renders one divider per gap', () => {
    const { container } = setup(pair);
    expect(tileBox(container, 'a').width).toBe('200px');
    expect(tileBox(container, 'b').left).toBe('210px');
    expect(container.querySelectorAll('[role="separator"]')).toHaveLength(1);
  });

  it('steps a divider with the arrow keys', () => {
    const { container, onLayoutChange } = setup(pair);
    fireEvent.keyDown(container.querySelector('[role="separator"]')!, { key: 'ArrowRight' });
    const next = onLayoutChange.mock.calls[0][0] as Extract<TileNode, { kind: 'split' }>;
    expect(next.sizes[0]).toBeGreaterThan(next.sizes[1]);
  });

  it('removes a tile', () => {
    const { getByText, layout } = setup(pair);
    fireEvent.click(getByText('Remove a'));
    expect(layout()).toEqual(t('b'));
  });

  it('places into an empty workspace without asking where', () => {
    const { onPlace } = setup(undefined, { id: 'c', label: 'Chart' });
    expect(onPlace).toHaveBeenCalledWith('c', t('c'));
  });

  it('places a new tile on the side that was clicked', () => {
    const { getByRole, onPlace, layout } = setup(pair, { id: 'c', label: 'Chart' });
    const layer = getByRole('dialog', { name: 'Place Chart' });
    fireEvent.click(layer, { clientX: 400, clientY: 150 });
    expect(onPlace).toHaveBeenCalledTimes(1);
    expect(tileIds(layout())).toEqual(['a', 'b', 'c']);
  });

  it('docks a dragged tile where it is released', () => {
    const { getByTestId, layout } = setup(pair);
    fireEvent.pointerDown(getByTestId('grip-a'), { button: 0, clientX: 100, clientY: 150 });
    fireEvent.pointerMove(window, { clientX: 300, clientY: 290 });
    fireEvent.pointerUp(window, { clientX: 300, clientY: 290 });
    const next = layout() as Extract<TileNode, { kind: 'split' }>;
    expect(next).toEqual({ kind: 'split', dir: 'column', sizes: [1, 1], children: [t('b'), t('a')] });
  });

  it('grows to the minimum height of its tiles when allowed', () => {
    const tall = { kind: 'split', dir: 'column', sizes: [1, 1, 1, 1], children: ['a', 'b', 'c', 'd'].map(t) } as TileNode;
    const { container } = render(() => (
      <TilingWorkspace layout={tall} onLayoutChange={() => {}} gapPx={GAP} minSize={() => ({ width: MIN, height: 100 })} growHeight>
        {(tile) => <div>{tile.id}</div>}
      </TilingWorkspace>
    ));
    expect((container.firstElementChild as HTMLElement).style.minHeight).toBe('430px');
  });

  it('collapses a tile to a strip only when collapse is on', () => {
    const STRIP = 30;
    const run = (collapse: boolean) => {
      const [layout, setLayout] = createSignal<TileNode | undefined>(pair);
      const view = render(() => (
        <TilingWorkspace layout={layout()} onLayoutChange={setLayout} gapPx={GAP} minSize={() => ({ width: MIN, height: MIN })}
          collapse={collapse && { stripPx: STRIP }}>
          {(tile) => <button type="button" onClick={() => tile.collapse.set('left')}>Fold {tile.id}</button>}
        </TilingWorkspace>
      ));
      fireEvent.click(view.getByText('Fold a'));
      const box = view.container.querySelector('[data-tile-id="a"]') as HTMLElement;
      const result = { edge: box.dataset.collapsed, width: box.style.width };
      cleanup();
      return result;
    };
    expect(run(true)).toEqual({ edge: 'left', width: `${STRIP}px` });
    expect(run(false)).toEqual({ edge: undefined, width: '200px' });
  });

  it('ignores a press on a control inside the grip', () => {
    const { getByText, onLayoutChange } = setup(pair);
    fireEvent.pointerDown(getByText('Remove a'), { button: 0, clientX: 100, clientY: 150 });
    fireEvent.pointerMove(window, { clientX: 300, clientY: 290 });
    fireEvent.pointerUp(window, { clientX: 300, clientY: 290 });
    expect(onLayoutChange).not.toHaveBeenCalled();
  });
});
