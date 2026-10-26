import { createSignal, type JSX } from 'solid-js';
import { TilingWorkspace, type Placing, type TileNode } from '@cujuju/solidjs-tiling-window-manager';
import { Card, Code } from '../ui';

/** Tall enough to split twice in each direction at the default 120px tile minimum. */
const WORKSPACE_PX = 520;
const COLORS = ['#8b5cf6', '#22c55e', '#f59e0b', '#3b82f6', '#ef4444', '#14b8a6'];

const INITIAL: TileNode = {
  kind: 'split', dir: 'column', sizes: [1, 1],
  children: [
    { kind: 'tile', id: 'tile-1' },
    { kind: 'split', dir: 'row', sizes: [2, 1], children: [{ kind: 'tile', id: 'tile-2' }, { kind: 'tile', id: 'tile-3' }] },
  ],
};

const USAGE = `<TilingWorkspace layout={layout()} onLayoutChange={setLayout}
  placing={placing()} onPlace={(id, next) => { setLayout(next); setPlacing(null); }}
  onPlacingCancel={() => setPlacing(null)}>
  {(tile) => <Card onGripDown={tile.startMove} onClose={tile.remove} />}
</TilingWorkspace>`;

export function TilingWindowManagerPage(): JSX.Element {
  const [layout, setLayout] = createSignal<TileNode | undefined>(INITIAL);
  const [placing, setPlacing] = createSignal<Placing | null>(null);
  let next = 4;
  const color = (id: string) => COLORS[Number(id.split('-')[1]) % COLORS.length];

  return (
    <>
      <Card cap="Drag a tile's header to dock it on another tile's edge (or its centre to swap). Drag a gap to resize; arrows step it, double-click equalises." wide>
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
          empty={<p style={{ padding: '16px' }}>No tiles. Use “Add tile”.</p>}
          style={{ height: `${WORKSPACE_PX}px`, border: '1px dashed var(--line, #444)' }}
        >
          {(tile) => (
            <div style={{ display: 'flex', 'flex-direction': 'column', border: `1px solid ${color(tile.id)}`, 'border-radius': '8px', overflow: 'hidden' }}>
              <header onPointerDown={tile.startMove}
                style={{ display: 'flex', 'align-items': 'center', padding: '4px 8px', cursor: 'grab', background: color(tile.id), color: '#fff' }}>
                <span style={{ flex: 1 }}>{tile.id}</span>
                <button type="button" onClick={tile.remove} aria-label={`Remove ${tile.id}`}>×</button>
              </header>
              <div style={{ padding: '8px', 'font-size': '12px' }}>
                {Math.round(tile.rect().width)} × {Math.round(tile.rect().height)} px
              </div>
            </div>
          )}
        </TilingWorkspace>
      </Card>
      <Code cap="usage">{USAGE}</Code>
    </>
  );
}
