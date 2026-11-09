import { cleanup, fireEvent, render } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { TilingWorkspace } from '../TilingWorkspace';
import type { TileNode } from '../tileTree';

const WIDTH = 410;
const HEIGHT = 300;
const GAP = 10;
const t = (id: string): TileNode => ({ kind: 'tile', id });
const pair: TileNode = { kind: 'split', dir: 'row', sizes: [1, 1], children: [t('a'), t('b')] };

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => WIDTH });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => HEIGHT });
});
afterEach(cleanup);

function setup(opts: { tabs?: boolean; placing?: { id: string; label: string } } = {}) {
  const [layout, setLayout] = createSignal<TileNode | undefined>(pair);
  const onOverlayChange = vi.fn();
  const view = render(() => (
    <TilingWorkspace layout={layout()} onLayoutChange={setLayout} gapPx={GAP} tabs={opts.tabs} placing={opts.placing}
      onOverlayChange={onOverlayChange}>
      {(tile) => <header data-testid={`grip-${tile.id}`} onPointerDown={tile.startMove}>{tile.id}</header>}
    </TilingWorkspace>
  ));
  return { ...view, onOverlayChange };
}

describe('onOverlayChange', () => {
  it('reports a tile drag from its start to its release', () => {
    const { getByTestId, onOverlayChange } = setup();
    fireEvent.pointerDown(getByTestId('grip-a'), { button: 0, clientX: 100, clientY: 150 });
    expect(onOverlayChange).not.toHaveBeenCalled();
    fireEvent.pointerMove(window, { clientX: 300, clientY: 290 });
    expect(onOverlayChange.mock.calls).toEqual([[true]]);
    fireEvent.pointerUp(window, { clientX: 300, clientY: 290 });
    expect(onOverlayChange.mock.calls).toEqual([[true], [false]]);
  });

  it('reports a divider dragged with the pointer, but not a keyboard step', () => {
    const { container, onOverlayChange } = setup();
    const divider = container.querySelector<HTMLElement>('[role="separator"]')!;
    fireEvent.keyDown(divider, { key: 'ArrowRight' });
    expect(onOverlayChange).not.toHaveBeenCalled();
    fireEvent.pointerDown(divider, { button: 0, clientX: 205 });
    expect(onOverlayChange.mock.calls).toEqual([[true]]);
    fireEvent.pointerUp(divider, { clientX: 240 });
    expect(onOverlayChange.mock.calls).toEqual([[true], [false]]);
  });

  it('stays open while the Swap/Tab menu asks, until a choice closes it', () => {
    const { getByTestId, getByRole, onOverlayChange } = setup({ tabs: true });
    fireEvent.pointerDown(getByTestId('grip-a'), { button: 0, clientX: 100, clientY: 150 });
    fireEvent.pointerMove(window, { clientX: 310, clientY: 150 });
    fireEvent.pointerUp(window, { clientX: 310, clientY: 150 });
    expect(onOverlayChange.mock.calls).toEqual([[true]]);
    fireEvent.click(getByRole('menuitem', { name: 'Swap' }));
    expect(onOverlayChange.mock.calls).toEqual([[true], [false]]);
  });

  it('reports a placement layer open at mount, and closed when the workspace unmounts', () => {
    const { unmount, onOverlayChange } = setup({ placing: { id: 'c', label: 'C' } });
    expect(onOverlayChange.mock.calls).toEqual([[true]]);
    unmount();
    expect(onOverlayChange.mock.calls).toEqual([[true], [false]]);
  });
});
