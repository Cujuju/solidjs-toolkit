import { cleanup, fireEvent, render } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { TilingWorkspace } from '../TilingWorkspace';
import type { TileNode } from '../tileTree';

const WIDTH = 410;
const HEIGHT = 300;
const t = (id: string): TileNode => ({ kind: 'tile', id });
const pair: TileNode = { kind: 'split', dir: 'row', sizes: [1, 1], children: [t('a'), t('b')] };

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => WIDTH });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => HEIGHT });
});
afterEach(cleanup);

function setup(keyboard: boolean, tabs = false) {
  const [layout, setLayout] = createSignal<TileNode | undefined>(pair);
  const onCancel = vi.fn();
  const view = render(() => (
    <TilingWorkspace layout={layout()} onLayoutChange={setLayout} gapPx={10} minSize={() => ({ width: 50, height: 50 })}
      placing={{ id: 'c', label: 'Chart' }} onPlace={(_id, next) => setLayout(next)} onPlacingCancel={onCancel}
      keyboardPlacement={keyboard && { label: (id) => `Tile ${id}` }} tabs={tabs}>
      {(tile) => <div>{tile.id}</div>}
    </TilingWorkspace>
  ));
  return { ...view, layout, onCancel };
}

describe('keyboard placement', () => {
  it('places on the side an arrow key picks when Enter is pressed', () => {
    const { getByRole, layout } = setup(true);
    const target = getByRole('button', { name: 'Place beside Tile a' });
    target.focus();
    fireEvent.keyDown(target, { key: 'ArrowDown' });
    expect(getByRole('status').textContent).toContain('press Enter to place on the bottom');
    fireEvent.keyDown(target, { key: 'Enter' });
    expect(layout()).toEqual({ ...pair, children: [{ kind: 'split', dir: 'column', sizes: [1, 1], children: [t('a'), t('c')] }, t('b')] });
  });

  it('adds as a tab with T when tab groups are on', () => {
    const { getByRole, layout } = setup(true, true);
    const target = getByRole('button', { name: 'Place beside Tile b' });
    fireEvent.keyDown(target, { key: 't' });
    fireEvent.keyDown(target, { key: 'Enter' });
    expect(layout()).toEqual({ ...pair, children: [t('a'), { kind: 'tabs', active: 1, children: [t('b'), t('c')] }] });
  });

  it('Esc cancels from a target', () => {
    const { getByRole, onCancel } = setup(true);
    fireEvent.keyDown(getByRole('button', { name: 'Place beside Tile a' }), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
  });

  it('adds no targets unless keyboard placement is on', () => {
    const { queryByRole } = setup(false);
    expect(queryByRole('button', { name: /Place beside/ })).toBeNull();
  });
});
