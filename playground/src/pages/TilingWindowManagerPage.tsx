import { createSignal, Show, type JSX } from 'solid-js';
import { TabStrip, TilingWorkspace, type Placing, type TileContext, type TileNode } from '@cujuju/solidjs-tiling-window-manager';
import { Card, Code } from '../ui';

/** Tall enough to split twice in each direction at the default 120px tile minimum. */
const WORKSPACE_PX = 520;
/** A collapsed tile shows its header only; this matches the header's height. */
const STRIP_PX = 30;
const COLORS = ['#8b5cf6', '#22c55e', '#f59e0b', '#3b82f6', '#ef4444', '#14b8a6'];

const INITIAL: TileNode = {
  kind: 'split', dir: 'column', sizes: [1, 1],
  children: [
    { kind: 'tile', id: 'tile-1' },
    {
      kind: 'split', dir: 'row', sizes: [2, 1],
      children: [{ kind: 'tabs', active: 0, children: [{ kind: 'tile', id: 'tile-2' }, { kind: 'tile', id: 'tile-4' }] }, { kind: 'tile', id: 'tile-3' }],
    },
  ],
};

/** A second layout whose dividers the first one's snap to. */
const SIBLING: TileNode = { kind: 'split', dir: 'row', sizes: [1, 1], children: [{ kind: 'tile', id: 'x' }, { kind: 'tile', id: 'y' }] };

const USAGE = `<TilingWorkspace layout={layout()} onLayoutChange={setLayout}
  tabs collapse={{ barPx: 30, stripPx: 30 }} readout keyboardPlacement
  alignWith={[{ name: 'Sibling', layout: sibling }]}
  placing={placing()} onPlace={(id, next) => { setLayout(next); setPlacing(null); }}
  onPlacingCancel={() => setPlacing(null)}>
  {(tile) => (
    <header onPointerDown={tile.startMove} data-twm-tab-target>
      {tile.tabs() ? <TabStrip tile={tile} label={(id) => id} /> : tile.id}
      <button onClick={() => tile.collapse.set(tile.collapse.edge() ? null : 'left')}>Fold</button>
    </header>
  )}
</TilingWorkspace>`;

const color = (id: string) => COLORS[(Number(id.split('-')[1]) || 0) % COLORS.length];

/** Folds toward whichever side the tile's split allows, or reopens it. */
function toggleFold(tile: TileContext) {
  if (tile.collapse.edge()) return tile.collapse.set(null);
  const edge = (['left', 'right', 'top', 'bottom'] as const).find((side) => tile.collapse.can(side).allowed);
  if (edge) tile.collapse.set(edge);
}

export function TilingWindowManagerPage(): JSX.Element {
  const [layout, setLayout] = createSignal<TileNode | undefined>(INITIAL);
  const [placing, setPlacing] = createSignal<Placing | null>(null);
  let next = 5;

  return (
    <>
      <Card cap="Drag a header to dock a tile on another's edge; drop on its centre to swap or tab, or on its header to tab. Drag a gap to resize (readout, Shift flips it); arrows step it, double-click equalises. Fold collapses a tile. Add tile, then Tab and arrow keys place it without a mouse." wide>
        <div style={{ display: 'flex', gap: '8px', 'margin-bottom': '8px' }}>
          <button class="demo-btn" onClick={() => setPlacing({ id: `tile-${next++}`, label: 'a new tile' })}>Add tile</button>
          <button class="demo-btn" onClick={() => setLayout(INITIAL)}>Reset</button>
        </div>
        <TilingWorkspace
          layout={layout()}
          onLayoutChange={setLayout}
          placing={placing()}
          onPlace={(_id, tree) => { setLayout(tree); setPlacing(null); }}
          onPlacingCancel={() => setPlacing(null)}
          tabs
          collapse={{ barPx: STRIP_PX, stripPx: STRIP_PX }}
          readout={{ color }}
          alignWith={[{ name: 'Sibling', layout: SIBLING }]}
          keyboardPlacement
          empty={<p style={{ padding: '16px' }}>No tiles. Use “Add tile”.</p>}
          style={{ height: `${WORKSPACE_PX}px`, border: '1px dashed var(--line, #444)' }}
        >
          {(tile) => (
            <div style={{ display: 'flex', 'flex-direction': 'column', border: `1px solid ${color(tile.id)}`, 'border-radius': '8px', overflow: 'hidden' }}>
              <header onPointerDown={tile.startMove} data-twm-tab-target
                style={{ display: 'flex', 'align-items': 'center', gap: '4px', height: `${STRIP_PX}px`, padding: '0 8px', cursor: 'grab', background: color(tile.id), color: '#fff', 'flex-shrink': 0 }}>
                <Show when={tile.tabs()} fallback={<span style={{ flex: 1, overflow: 'hidden' }}>{tile.id}</span>}>
                  <TabStrip tile={tile} label={(id) => id} />
                </Show>
                <button type="button" onClick={() => toggleFold(tile)} aria-label={`Fold ${tile.id}`}>{tile.collapse.edge() ? '▸' : '▾'}</button>
                <button type="button" onClick={tile.remove} aria-label={`Remove ${tile.id}`}>×</button>
              </header>
              <Show when={!tile.collapse.edge()}>
                <div style={{ padding: '8px', 'font-size': '12px' }}>
                  {Math.round(tile.rect().width)} × {Math.round(tile.rect().height)} px
                </div>
              </Show>
            </div>
          )}
        </TilingWorkspace>
      </Card>
      <Code cap="usage">{USAGE}</Code>
    </>
  );
}
