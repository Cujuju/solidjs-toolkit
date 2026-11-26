import { cleanup, fireEvent, render } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { computeTileLayout } from '../layout.js';
import { percentTenths } from '../ResizeReadout.js';
import { GUIDE_SNAP_PX, nearestGuide, resizeGuides } from '../resizeGuides.js';
import { TilingWorkspace } from '../TilingWorkspace.js';
import type { TileNode, TileSplit } from '../tileTree.js';
import { valueAt } from '../../../_shared/testing.js';

const WIDTH = 410;
const HEIGHT = 300;
const GAP = 10;
const t = (id: string): TileNode => ({ kind: 'tile', id });
const row = (sizes: number[], ...children: TileNode[]): TileSplit => ({ kind: 'split', dir: 'row', sizes, children });
const options = () => ({ gapPx: GAP, minSizes: new Map() });

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => WIDTH });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => HEIGHT });
});
afterEach(cleanup);

describe('resize readout and guides', () => {
  it('rounds shares to tenths that always total 100%', () => {
    expect(percentTenths([1, 1, 1])).toEqual([334, 333, 333]);
    expect(percentTenths([1, 3])).toEqual([250, 750]);
  });

  it('finds same-axis dividers in other layouts and snaps only within reach', () => {
    const mine = computeTileLayout(row([1, 1], t('a'), t('b')), { width: WIDTH, height: HEIGHT }, options());
    const guides = resizeGuides([{ name: 'Other', layout: row([1, 3], t('x'), t('y')) }, { name: 'Empty', layout: undefined }],
      valueAt(mine.handles, 0), { width: WIDTH, height: HEIGHT }, options);
    expect(guides).toEqual([{ positionPx: 105, name: 'Other' }]);
    expect(nearestGuide(guides, 105 + GUIDE_SNAP_PX)?.name).toBe('Other');
    expect(nearestGuide(guides, 105 + GUIDE_SNAP_PX + 1)).toBeUndefined();
  });

  it('shows the readout while a divider is dragged, and lines it up with a guide', () => {
    const [layout, setLayout] = createSignal<TileNode | undefined>(row([1, 1], t('a'), t('b')));
    const { container } = render(() => (
      <TilingWorkspace layout={layout()} onLayoutChange={setLayout} gapPx={GAP} minSize={() => ({ width: 50, height: 50 })} readout
        alignWith={[{ name: 'Other', layout: row([1, 3], t('x'), t('y')) }]}>
        {(tile) => <div>{tile.id}</div>}
      </TilingWorkspace>
    ));
    const handle = container.querySelector('[role="separator"]')!;
    const workspace = container.querySelector('.twm')!;
    expect(workspace.hasAttribute('data-readout-active')).toBe(false);
    fireEvent.pointerDown(handle, { button: 0, clientX: 205, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 108, pointerId: 1 });
    expect(workspace.hasAttribute('data-readout-active')).toBe(true);
    const readout = container.querySelector('.twm-readout')!;
    expect(readout.textContent).toContain('Aligned with Other');
    expect(readout.textContent).toContain('25.0%');
    fireEvent.pointerUp(handle, { clientX: 108, pointerId: 1 });
    expect(container.querySelector('.twm-readout')).toBeNull();
    expect(workspace.hasAttribute('data-readout-active')).toBe(false);
    expect((layout() as TileSplit).sizes).toEqual([0.5, 1.5]);
  });

  it('toggles data-raised on a tile wrapper via tile.setRaised', () => {
    const [layout, setLayout] = createSignal<TileNode | undefined>(row([1, 1], t('a'), t('b')));
    let setARaised!: (active: boolean) => void;
    const { container } = render(() => (
      <TilingWorkspace layout={layout()} onLayoutChange={setLayout} gapPx={GAP} minSize={() => ({ width: 50, height: 50 })}>
        {(tile) => {
          if (tile.id === 'a') setARaised = tile.setRaised;
          return <div>{tile.id}</div>;
        }}
      </TilingWorkspace>
    ));
    const tileA = container.querySelector('[data-tile-id="a"]')!;
    const tileB = container.querySelector('[data-tile-id="b"]')!;
    expect(tileA.hasAttribute('data-raised')).toBe(false);
    expect(tileB.hasAttribute('data-raised')).toBe(false);

    setARaised(true);
    expect(tileA.hasAttribute('data-raised')).toBe(true);
    expect(tileB.hasAttribute('data-raised')).toBe(false);

    setARaised(false);
    expect(tileA.hasAttribute('data-raised')).toBe(false);
  });

  it('clears the readout and data-readout-active when readout turns off mid-drag', () => {
    const [layout, setLayout] = createSignal<TileNode | undefined>(row([1, 1], t('a'), t('b')));
    const [readoutEnabled, setReadoutEnabled] = createSignal(true);
    const { container } = render(() => (
      <TilingWorkspace layout={layout()} onLayoutChange={setLayout} gapPx={GAP} minSize={() => ({ width: 50, height: 50 })} readout={readoutEnabled()}>
        {(tile) => <div>{tile.id}</div>}
      </TilingWorkspace>
    ));
    const handle = container.querySelector('[role="separator"]')!;
    const workspace = container.querySelector('.twm')!;
    fireEvent.pointerDown(handle, { button: 0, clientX: 205, pointerId: 1 });
    expect(container.querySelector('.twm-readout')).not.toBeNull();
    expect(workspace.hasAttribute('data-readout-active')).toBe(true);

    setReadoutEnabled(false);
    expect(container.querySelector('.twm-readout')).toBeNull();
    expect(workspace.hasAttribute('data-readout-active')).toBe(false);

    fireEvent.pointerUp(handle, { clientX: 205, pointerId: 1 });
  });
});
