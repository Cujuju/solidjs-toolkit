import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show, type JSX } from 'solid-js';
import { createDockGesture } from './createDockGesture';
import { computeTileLayout, equalisedShares, minimumSize, resizedShares, type LayoutHandle, type LayoutRect, type TileLayoutOptions, type TileSize } from './layout';
import { PlacementLayer, type Placing } from './PlacementLayer';
import { planMove, type PlacementMode } from './plan';
import { ResizeHandle } from './ResizeHandle';
import { insertTile, nodeAt, removeTile, resizeSplit, tileIds, type TileNode, type TileSplit } from './tileTree';

/** Gap between tiles; it is also the divider's hit area. */
export const DEFAULT_GAP_PX = 8;
/** A header plus one readable line of content. */
export const DEFAULT_MIN_TILE_PX = 120;
const DEFAULT_MIN: TileSize = { width: DEFAULT_MIN_TILE_PX, height: DEFAULT_MIN_TILE_PX };

export interface TileContext {
  id: string;
  /** The tile's box in workspace pixels. */
  rect: () => LayoutRect;
  /** Bind to the tile's grip (`onPointerDown`): dragging docks it beside another tile or swaps with it. */
  startMove: (event: PointerEvent) => void;
  remove: () => void;
  /** True while this tile is being dragged. */
  dragging: () => boolean;
}

export interface TilingWorkspaceProps {
  layout: TileNode | undefined;
  onLayoutChange: (next: TileNode | undefined) => void;
  /** Renders one tile's content; called once per tile id. */
  children: (tile: TileContext) => JSX.Element;
  minSize?: (id: string) => TileSize;
  gapPx?: number;
  /** A tile waiting for a spot: the workspace shows the placement layer until it is placed or cancelled. */
  placing?: Placing | null;
  /** `preserve` (default): a new tile only splits its target. `reflow`: it halves the target and others may move. */
  placement?: PlacementMode;
  /** Grow taller than the given height when the tiles' minimums need it (set `min-height`); the owner scrolls. */
  growHeight?: boolean;
  /** The layout with the placed tile added. Without it, `onLayoutChange` receives the new layout. */
  onPlace?: (id: string, next: TileNode) => void;
  onPlacingCancel?: () => void;
  /** Shown while the layout has no tiles. */
  empty?: JSX.Element;
  class?: string;
  style?: JSX.CSSProperties;
}

const box = (rect: LayoutRect) => ({ left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px` });
const ZERO_RECT: LayoutRect = { x: 0, y: 0, width: 0, height: 0 };

/** Split-pane tiles that the user resizes, drags to re-dock and adds by pointing at a spot. Controlled by `layout`. */
export function TilingWorkspace(props: TilingWorkspaceProps) {
  let container: HTMLDivElement | undefined;
  const [size, setSize] = createSignal<TileSize>({ width: 0, height: 0 });
  const [draft, setDraft] = createSignal<{ split: TileSplit; sizes: number[] } | null>(null);
  let start: LayoutHandle | undefined;

  onMount(() => {
    const measure = () => container && setSize({ width: container.clientWidth, height: container.clientHeight });
    const observer = new ResizeObserver(measure);
    observer.observe(container!);
    measure();
    onCleanup(() => observer.disconnect());
  });

  const ids = createMemo(() => tileIds(props.layout));
  /** Tiles keep their DOM order across moves, so moving one never remounts or reorders the others. */
  const identities = createMemo<string[]>((previous) => {
    const present = new Set(ids());
    const known = new Set(previous);
    return [...previous.filter((id) => present.has(id)), ...ids().filter((id) => !known.has(id))];
  }, []);
  const minFor = (id: string) => props.minSize?.(id) ?? DEFAULT_MIN;
  const baseOptions = createMemo<TileLayoutOptions>(() => {
    const minSizes = new Map(ids().map((id) => [id, minFor(id)]));
    if (props.placing) minSizes.set(props.placing.id, minFor(props.placing.id));
    return { gapPx: props.gapPx ?? DEFAULT_GAP_PX, minSizes };
  });
  const layout = createMemo(() => computeTileLayout(props.layout, size(), { ...baseOptions(), draft: draft() }));
  const minHeight = () => (props.growHeight && props.layout ? minimumSize(props.layout, baseOptions()).height : 0);

  const cancelResize = () => { start = undefined; setDraft(null); };
  const startValid = () => !!start && !!props.layout && nodeAt(props.layout, start.path) === start.split;
  const commitResize = () => {
    const pending = draft();
    if (startValid() && pending) props.onLayoutChange(resizeSplit(props.layout!, start!.path, pending.sizes));
    cancelResize();
  };

  const dock = createDockGesture({
    container: () => container,
    tiles: () => layout().tiles,
    plan: (movedId, targetId, zone) => (props.layout ? planMove(props.layout, movedId, targetId, zone, size(), baseOptions(), !!props.growHeight) : null),
    onDrop: (movedId, targetId, zone) => {
      const plan = props.layout && planMove(props.layout, movedId, targetId, zone, size(), baseOptions(), !!props.growHeight);
      if (plan) props.onLayoutChange(plan.next);
    },
  });

  const place = (id: string, next: TileNode) => (props.onPlace ? props.onPlace(id, next) : props.onLayoutChange(next));
  // An empty workspace has one place for the tile, so it skips the placement layer.
  createEffect(() => {
    const pending = props.placing;
    if (pending && !props.layout) place(pending.id, { kind: 'tile', id: pending.id });
  });

  return (
    <div
      ref={container}
      class={`twm${props.class ? ` ${props.class}` : ''}`}
      style={{ ...props.style, ...(minHeight() ? { 'min-height': `${minHeight()}px` } : {}) }}
      data-grow={props.growHeight || undefined}
      data-dragging={dock.dragging() !== null || undefined}
    >
      <For each={identities()}>
        {(id) => {
          // Keeps the last rect while a removed tile unmounts.
          const rect = createMemo<LayoutRect>((previous) => layout().tiles.get(id) ?? previous, ZERO_RECT);
          const context: TileContext = {
            id,
            rect,
            startMove: (event) => dock.start(id, event),
            remove: () => props.onLayoutChange(removeTile(props.layout, id)),
            dragging: () => dock.dragging() === id,
          };
          return (
            <div class="twm-tile" data-tile-id={id} data-dragging={context.dragging() || undefined} style={box(rect())}>
              {props.children(context)}
            </div>
          );
        }}
      </For>
      <For each={layout().handles.map((handle) => handle.key)}>
        {(key) => {
          const handle = () => layout().handles.find((entry) => entry.key === key);
          return (
            <Show when={handle()}>
              {(current) => (
                <ResizeHandle
                  dir={current().split.dir}
                  rect={current().rect}
                  onBegin={() => { cancelResize(); start = current(); }}
                  onDraft={(delta, snap) => {
                    if (!startValid()) return cancelResize();
                    if (snap.kind !== 'by' && delta === 0) return setDraft(null);
                    setDraft({ split: start!.split, sizes: resizedShares(start!, delta, snap) });
                  }}
                  onCommit={commitResize}
                  onCancel={cancelResize}
                  onEqualise={() => props.layout && props.onLayoutChange(resizeSplit(props.layout, current().path, equalisedShares(current())))}
                />
              )}
            </Show>
          );
        }}
      </For>
      <Show when={dock.preview()}>
        {(preview) => (
          <>
            <div class="twm-preview-target" style={box(preview().placement.targetRect)} />
            <div class="twm-preview" data-zone={preview().zone} style={box(preview().placement.rect)} />
          </>
        )}
      </Show>
      <Show when={!props.layout && !props.placing}>{props.empty}</Show>
      <Show when={props.layout && props.placing}>
        {(placing) => (
          <PlacementLayer
            root={props.layout!}
            size={size()}
            options={baseOptions()}
            placing={placing()}
            mode={props.placement ?? 'preserve'}
            growHeight={!!props.growHeight}
            onPlace={(targetId, side, shares) => place(placing().id, insertTile(props.layout!, placing().id, targetId, side, shares))}
            onCancel={() => props.onPlacingCancel?.()}
          />
        )}
      </Show>
    </div>
  );
}
