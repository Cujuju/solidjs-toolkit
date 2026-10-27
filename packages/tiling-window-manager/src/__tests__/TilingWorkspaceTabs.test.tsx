import { cleanup, fireEvent, render } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { TabStrip } from '../TabStrip';
import { TilingWorkspace } from '../TilingWorkspace';
import type { TileLeaf, TileNode } from '../tileTree';

const WIDTH = 410;
const HEIGHT = 300;
const GAP = 10;
const MIN = 50;
const t = (id: string): TileLeaf => ({ kind: 'tile', id });
const pair: TileNode = { kind: 'split', dir: 'row', sizes: [1, 1], children: [t('a'), t('b')] };

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => WIDTH });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => HEIGHT });
});
afterEach(cleanup);

function setup(initial: TileNode) {
  const [layout, setLayout] = createSignal<TileNode | undefined>(initial);
  const view = render(() => (
    <TilingWorkspace layout={layout()} onLayoutChange={setLayout} gapPx={GAP} minSize={() => ({ width: MIN, height: MIN })} tabs>
      {(tile) => (
        <div data-testid={`tile-${tile.id}`}>
          <header data-testid={`grip-${tile.id}`} onPointerDown={tile.startMove}>
            <TabStrip tile={tile} label={(id) => `Tab ${id}`} />
          </header>
        </div>
      )}
    </TilingWorkspace>
  ));
  return { ...view, layout };
}

const drag = (grip: HTMLElement, to: { clientX: number; clientY: number }) => {
  fireEvent.pointerDown(grip, { button: 0, clientX: 100, clientY: 150 });
  fireEvent.pointerMove(window, to);
  fireEvent.pointerUp(window, to);
};

describe('TilingWorkspace tab groups', () => {
  it('asks Swap or Tab on a centre drop, and Tab joins the target', () => {
    const { getByTestId, getByRole, layout } = setup(pair);
    drag(getByTestId('grip-a'), { clientX: 310, clientY: 150 });
    fireEvent.click(getByRole('menuitem', { name: 'Tab' }));
    expect(layout()).toEqual({ kind: 'tabs', active: 1, children: [t('b'), t('a')] });
  });

  it('Swap exchanges the two tiles', () => {
    const { getByTestId, getByRole, layout } = setup(pair);
    drag(getByTestId('grip-a'), { clientX: 310, clientY: 150 });
    fireEvent.click(getByRole('menuitem', { name: 'Swap' }));
    expect(layout()).toEqual({ ...pair, children: [t('b'), t('a')] });
  });

  it('shows only the active tab; its strip selects another', () => {
    const { getByTestId, getAllByRole, layout } = setup({ kind: 'tabs', active: 0, children: [t('a'), t('b')] });
    expect(getByTestId('tile-b').parentElement!.hidden).toBe(true);
    const tabs = getAllByRole('tab').filter((tab) => !tab.closest('[hidden]'));
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Tab a', 'Tab b']);
    fireEvent.click(tabs[1]);
    expect(layout()).toEqual({ kind: 'tabs', active: 1, children: [t('a'), t('b')] });
    expect(getByTestId('tile-a').parentElement!.hidden).toBe(true);
  });

  it('arrow keys move between tabs', () => {
    const { getAllByRole, layout } = setup({ kind: 'tabs', active: 0, children: [t('a'), t('b')] });
    fireEvent.keyDown(getAllByRole('tab')[0], { key: 'ArrowLeft' });
    expect(layout()).toEqual({ kind: 'tabs', active: 1, children: [t('a'), t('b')] });
  });
});

describe('TilingWorkspace tab targets', () => {
  function setupTarget(tabs: true | { target: string }) {
    const [layout, setLayout] = createSignal<TileNode | undefined>(pair);
    const view = render(() => (
      <TilingWorkspace layout={layout()} onLayoutChange={setLayout} gapPx={GAP} minSize={() => ({ width: MIN, height: MIN })} tabs={tabs}>
        {(tile) => (
          <header data-testid={`grip-${tile.id}`} class="bar" data-twm-tab-target={tabs === true ? '' : undefined}
            onPointerDown={tile.startMove}>{tile.id}</header>
        )}
      </TilingWorkspace>
    ));
    return { ...view, layout };
  }
  // jsdom has no hit testing: the point resolves to tile b's header.
  const overHeader = (header: HTMLElement) => {
    document.elementsFromPoint = () => [header];
  };
  afterEach(() => { delete (document as { elementsFromPoint?: unknown }).elementsFromPoint; });

  it.each([
    ['the default attribute', true as const],
    ['a host selector', { target: '.bar' }],
  ])('joins as a tab when dropped on %s', (_name, tabs) => {
    const { getByTestId, layout } = setupTarget(tabs);
    overHeader(getByTestId('grip-b'));
    drag(getByTestId('grip-a'), { clientX: 310, clientY: 150 });
    expect(layout()).toEqual({ kind: 'tabs', active: 1, children: [t('b'), t('a')] });
  });
});
