import { describe, expect, it } from 'vitest';
import { renderToString } from 'solid-js/web';
import { computeTileLayout, DockZoneGuides, ResizeReadout, TabStrip, TilingWorkspace, type TileNode } from '../index.js';
import { valueAt } from '../../../_shared/testing.js';

const LAYOUT: TileNode = {
  kind: 'split', dir: 'row', sizes: [1, 1],
  children: [{ kind: 'tile', id: 'a' }, { kind: 'tabs', active: 0, children: [{ kind: 'tile', id: 'b' }, { kind: 'tile', id: 'c' }] }],
};
const BOX = { width: 400, height: 200 };
const GAP_PX = 8;

describe('server render', () => {
  it('renders a workspace with a tab strip', () => {
    const html = renderToString(() => (
      <TilingWorkspace layout={LAYOUT} onLayoutChange={() => {}}>
        {(tile) => (tile.tabs() ? <TabStrip tile={tile} label={(id) => id} /> : tile.id)}
      </TilingWorkspace>
    ));
    expect(typeof html).toBe('string');
  });

  it('renders a resize readout', () => {
    const handle = valueAt(computeTileLayout(LAYOUT, BOX, { gapPx: GAP_PX, minSizes: new Map() }).handles, 0);
    expect(typeof renderToString(() => <ResizeReadout handle={handle} shares={[1, 1]} side="b" />)).toBe('string');
  });
  it('renders shared dock guides with the caller’s center action', () => {
    const html = renderToString(() => <DockZoneGuides style={{}} active="center"
      available={new Set(['center'])} centerLabel="Add as tab" />);
    expect(html).toContain('Add as tab');
    expect(html).toContain('twm-dock-highlight');
  });
});
