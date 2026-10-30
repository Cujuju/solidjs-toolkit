import { createMemo, createSignal, Show, type JSX } from 'solid-js';
import {
  computeTileLayout, removeTile, ResizeReadout, TabStrip, TilingWorkspace,
  type PlacementMode, type Placing, type TileContext, type TileNode,
} from '@cujuju/solidjs-tiling-window-manager';
import { Card, Code, createEventLog, EventLog } from '../ui';

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

/** Range of the demo's tile-minimum slider; the package default is 120px. */
const MIN_TILE_RANGE_PX = { min: 60, max: 240, initial: 120 };
/** Range of the demo's gap slider. */
const GAP_RANGE_PX = { min: 0, max: 24, initial: 8 };
/** Standalone readout demo: a 3-way row split this size, its first divider shown. */
const READOUT_BOX = { width: 520, height: 120 };
const READOUT_SPLIT: TileNode = {
  kind: 'split', dir: 'row', sizes: [1, 1, 1],
  children: [{ kind: 'tile', id: 'tile-1' }, { kind: 'tile', id: 'tile-2' }, { kind: 'tile', id: 'tile-3' }],
};

/** A second layout whose dividers the first one's snap to. */
const SIBLING: TileNode = { kind: 'split', dir: 'row', sizes: [1, 1], children: [{ kind: 'tile', id: 'x' }, { kind: 'tile', id: 'y' }] };

const USAGE = `<TilingWorkspace layout={layout()} onLayoutChange={setLayout}
  tabs collapse={{ barPx: 30, stripPx: 30 }} readout keyboardPlacement
  minSize={() => ({ width: 120, height: 120 })} gapPx={8} placement="reflow" growHeight
  onDropOutside={(id, event) => setLayout(removeTile(layout(), id))}
  onDragPhase={(phase) => console.log(phase)}  // 'start' | 'outside' | 'inside' | 'end'
  alignWith={[{ name: 'Sibling', layout: sibling }]}
  placing={placing()} onPlace={(id, next) => { setLayout(next); setPlacing(null); }}
  onPlacingCancel={() => setPlacing(null)}>
  {(tile) => (
    <header onPointerDown={tile.startMove} data-twm-tab-target>
      {tile.tabs() ? <TabStrip tile={tile} label={(id) => id} icon={(id) => <Icon id={id} />} /> : tile.id}
      <button onClick={() => tile.collapse.set(tile.collapse.edge() ? null : 'left')}>Fold</button>
    </header>
  )}
</TilingWorkspace>`;

const READOUT_USAGE = `// \`readout\` renders this during a divider drag; it is exported for custom chrome.
// Positioned absolutely in the workspace's coordinates.
const { handles } = computeTileLayout(tree, { width, height }, { gapPx: 8, minSizes: new Map() });
<ResizeReadout handle={handles[0]} shares={handles[0].sizes} side="a"
  alignedWith="Sibling" color={(id) => colorOf(id)} />`;

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
  const [placement, setPlacement] = createSignal<PlacementMode>('preserve');
  const [gap, setGap] = createSignal(GAP_RANGE_PX.initial);
  const [minTile, setMinTile] = createSignal(MIN_TILE_RANGE_PX.initial);
  const [grow, setGrow] = createSignal(false);
  const [icons, setIcons] = createSignal(false);
  const [share, setShare] = createSignal(1);
  const events = createEventLog();
  let next = 5;
  const readoutHandle = createMemo(() => {
    const split = { ...READOUT_SPLIT, sizes: [share(), 1, 1] } as TileNode;
    return computeTileLayout(split, READOUT_BOX, { gapPx: GAP_RANGE_PX.initial, minSizes: new Map() }).handles[0];
  });

  return (
    <>
      <Card cap="Drag a header to dock a tile on another's edge; drop on its centre to swap or tab, or on its header to tab. Drag a gap to resize (readout, Shift flips it); arrows step it, double-click equalises. Fold collapses a tile. Add tile, then Tab and arrow keys place it without a mouse." wide>
        {/* Card body is a flex row; the workspace has no content width (tiles are absolute), so it needs the full row. */}
        <div style={{ width: '100%' }}>
        <div style={{ display: 'flex', gap: '8px', 'margin-bottom': '8px' }}>
          <button class="demo-btn" onClick={() => setPlacing({ id: `tile-${next++}`, label: 'a new tile' })}>Add tile</button>
          <button class="demo-btn" onClick={() => setLayout(INITIAL)}>Reset</button>
          <label>placement <select value={placement()} onChange={(e) => setPlacement(e.currentTarget.value as PlacementMode)}>
            <option value="preserve">preserve</option><option value="reflow">reflow</option>
          </select></label>
          <label>gapPx <input type="range" min={GAP_RANGE_PX.min} max={GAP_RANGE_PX.max} value={gap()} onInput={(e) => setGap(e.currentTarget.valueAsNumber)} /> {gap()}</label>
          <label>minSize <input type="range" min={MIN_TILE_RANGE_PX.min} max={MIN_TILE_RANGE_PX.max} value={minTile()} onInput={(e) => setMinTile(e.currentTarget.valueAsNumber)} /> {minTile()}</label>
          <label><input type="checkbox" checked={grow()} onChange={(e) => setGrow(e.currentTarget.checked)} /> growHeight</label>
          <label><input type="checkbox" checked={icons()} onChange={(e) => setIcons(e.currentTarget.checked)} /> tab icons</label>
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
          placement={placement()}
          gapPx={gap()}
          minSize={() => ({ width: minTile(), height: minTile() })}
          growHeight={grow()}
          onDropOutside={(id) => { events.log('onDropOutside', id); setLayout((tree) => removeTile(tree, id)); }}
          onDragPhase={(phase) => events.log('onDragPhase', phase)}
          empty={<p style={{ padding: '16px' }}>No tiles. Use “Add tile”.</p>}
          style={{ height: `${WORKSPACE_PX}px`, border: '1px dashed var(--line, #444)' }}
        >
          {(tile) => (
            <div style={{ display: 'flex', 'flex-direction': 'column', border: `1px solid ${color(tile.id)}`, 'border-radius': '8px', overflow: 'hidden' }}>
              <header onPointerDown={tile.startMove} data-twm-tab-target
                style={{ display: 'flex', 'align-items': 'center', gap: '4px', height: `${STRIP_PX}px`, padding: '0 8px', cursor: 'grab', background: color(tile.id), color: '#fff', 'flex-shrink': 0 }}>
                <Show when={tile.tabs()} fallback={<span style={{ flex: 1, overflow: 'hidden' }}>{tile.id}</span>}>
                  <TabStrip tile={tile} label={(id) => id} icon={icons() ? (id) => <span style={{ color: '#fff' }}>●{id.split('-')[1]}</span> : undefined} />
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
        </div>
      </Card>
      <EventLog log={events} hint="Drag a tile out of the window to fire onDropOutside; it is removed." />
      <Code cap="usage">{USAGE}</Code>

      <h2>ResizeReadout</h2>
      <Card cap="The divider readout on its own: share first, pixels second, the traded pair lit. Drag the slider to change the first tile's share." wide>
        <div style={{ width: '100%' }}>
          <label>tile-1 share <input type="range" min={0.2} max={4} step={0.1} value={share()} onInput={(e) => setShare(e.currentTarget.valueAsNumber)} /></label>
          <div style={{ position: 'relative', width: `${READOUT_BOX.width}px`, height: `${READOUT_BOX.height * 2}px` }}>
            <ResizeReadout handle={readoutHandle()} shares={readoutHandle().sizes} side="b" alignedWith="Sibling" color={color} />
          </div>
        </div>
      </Card>
      <Code cap="ResizeReadout">{READOUT_USAGE}</Code>
    </>
  );
}
