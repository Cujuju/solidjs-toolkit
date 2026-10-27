import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show, type JSX } from 'solid-js';
import { createDockGesture, type CenterDrop } from './createDockGesture';
import { DockMenu } from './DockMenu';
import { computeTileLayout, minimumSize, slotRects, type LayoutRect, type LayoutSlot, type TileLayoutOptions, type TileSize } from './layout';
import { PlacementLayer, type Placing } from './PlacementLayer';
import { planMove, type PlacementMode } from './plan';
import { ResizeLayer, type ResizeDraft } from './ResizeLayer';
import type { AlignLayout } from './resizeGuides';
import {
  canCollapse, canCollapseAlone, canExpandAlone, collapseSlotAlone, expandSlotAlone, setSlotCollapsed, type CollapsePermission,
} from './tileCollapse';
import type { CollapseControls, TabGroup, TileContext } from './tileContext';
import { addToTabs, insertTile, moveTab, removeTile, setActiveTab, swapTiles } from './tileEdits';
import { findSlot, slotIds, slotKey, tileIds, type DropZone, type TileNode } from './tileTree';

export type { CollapseControls, TabGroup, TileContext } from './tileContext';

/** Gap between tiles; it is also the divider's hit area. */
export const DEFAULT_GAP_PX = 8;
/** A header plus one readable line of content. */
export const DEFAULT_MIN_TILE_PX = 120;
const DEFAULT_MIN: TileSize = { width: DEFAULT_MIN_TILE_PX, height: DEFAULT_MIN_TILE_PX };

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
  /** Tab groups: a centre drop asks Swap or Tab, a drop on a `data-twm-tab-target` element joins as a tab. */
  tabs?: boolean;
  /** Collapsible tiles: `tile.collapse` folds a slot to a strip of `barPx` (in a column) or `stripPx` (in a row). */
  collapse?: boolean | { barPx?: number; stripPx?: number };
  /** While a divider is dragged, show every share and length in its split. `color` tints a tile's cell. */
  readout?: boolean | { color?: (id: string) => string };
  /** Other layouts (such as sibling workspaces) whose dividers a drag snaps to, laid out at this size. */
  alignWith?: readonly AlignLayout[];
  /** Placing works from the keyboard too: Tab moves between tiles, arrows pick a side, Enter places. `label` names a tile. */
  keyboardPlacement?: boolean | { label?: (id: string) => string };
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
const COLLAPSE_OFF: CollapsePermission = { allowed: false, reason: 'Collapsing is off' };

/** Split-pane tiles that the user resizes, drags to re-dock and adds by pointing at a spot. Controlled by `layout`. */
export function TilingWorkspace(props: TilingWorkspaceProps) {
  let container: HTMLDivElement | undefined;
  const [size, setSize] = createSignal<TileSize>({ width: 0, height: 0 });
  const [draft, setDraft] = createSignal<ResizeDraft>(null);
  const [centerDrop, setCenterDrop] = createSignal<CenterDrop | null>(null);

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
  const optionsFor = (tiles: readonly string[]): TileLayoutOptions => {
    const strips = typeof props.collapse === 'object' ? props.collapse : {};
    return { gapPx: props.gapPx ?? DEFAULT_GAP_PX, minSizes: new Map(tiles.map((id) => [id, minFor(id)])), barPx: strips.barPx, stripPx: strips.stripPx };
  };
  const baseOptions = createMemo(() => optionsFor(props.placing ? [...ids(), props.placing.id] : ids()));
  const layout = createMemo(() => computeTileLayout(props.layout, size(), { ...baseOptions(), draft: draft() }));
  const targets = createMemo(() => slotRects(layout()));
  const minHeight = () => (props.growHeight && props.layout ? minimumSize(props.layout, baseOptions()).height : 0);
  const change = (next: TileNode | undefined) => { if (next !== props.layout) props.onLayoutChange(next); };

  const planFor = (movedId: string, targetId: string, zone: DropZone) =>
    (props.layout ? planMove(props.layout, movedId, targetId, zone, size(), baseOptions(), !!props.growHeight) : null);
  const dockGesture = createDockGesture({
    container: () => container,
    targets,
    exclude: (movedId) => (findSlot(props.layout, movedId)?.slot.kind === 'tile' ? movedId : undefined),
    plan: planFor,
    onDrop: (movedId, targetId, zone) => { const plan = planFor(movedId, targetId, zone); if (plan) change(plan.next); },
    onTab: (movedId, targetId) => props.tabs && props.layout && change(addToTabs(props.layout, movedId, targetId)),
    onCenterDrop: (drop) => props.tabs && setCenterDrop(drop),
  });

  const place = (id: string, next: TileNode) => (props.onPlace ? props.onPlace(id, next) : change(next));
  // An empty workspace has one place for the tile, so it skips the placement layer.
  createEffect(() => {
    const pending = props.placing;
    if (pending && !props.layout) place(pending.id, { kind: 'tile', id: pending.id });
  });

  const tabGroup = (id: string): TabGroup | null => {
    const slot = layout().tiles.has(id) ? findSlot(props.layout, id)?.slot : undefined;
    if (slot?.kind !== 'tabs') return null;
    return {
      ids: slot.children.map((child) => child.id),
      active: slot.active,
      select: (index) => props.layout && change(setActiveTab(props.layout, id, index)),
      move: (tabId, toIndex) => props.layout && change(moveTab(props.layout, tabId, toIndex)),
      drag: (tabId, event) => dockGesture.begin(tabId, event),
    };
  };

  const collapseControls = (id: string, placed: () => LayoutSlot | undefined): CollapseControls => {
    const edit = (apply: (root: TileNode) => TileNode) => { if (props.collapse && props.layout) change(apply(props.layout)); };
    const ask = (check: () => CollapsePermission) => (props.collapse ? check() : COLLAPSE_OFF);
    return {
      edge: () => (placed()?.collapsed ? placed()!.slot.collapsed?.edge ?? null : null),
      peek: () => { const p = placed(); return p?.peekEdge ? { edge: p.peekEdge, extentPx: p.peekExtentPx ?? 0 } : null; },
      set: (edge) => edit((root) => setSlotCollapsed(root, id, edge)),
      can: (edge) => ask(() => canCollapse(props.layout, id, edge)),
      expandAlone: () => edit((root) => expandSlotAlone(root, id)),
      canExpandAlone: () => ask(() => canExpandAlone(props.layout, id)),
      collapseAlone: () => edit((root) => collapseSlotAlone(root, id)),
      canCollapseAlone: () => ask(() => canCollapseAlone(props.layout, id)),
    };
  };

  return (
    <div
      ref={container}
      class={`twm${props.class ? ` ${props.class}` : ''}`}
      style={{ ...props.style, ...(minHeight() ? { 'min-height': `${minHeight()}px` } : {}) }}
      data-grow={props.growHeight || undefined}
      data-dragging={dockGesture.dragging() !== null || undefined}
    >
      <For each={identities()}>
        {(id) => {
          // Keeps the last rect while a removed tile unmounts.
          const rect = createMemo<LayoutRect>((previous) => layout().tiles.get(id) ?? previous, ZERO_RECT);
          const group = createMemo(() => tabGroup(id));
          const visible = () => { const g = group(); return !g || g.ids[g.active] === id; };
          const placed = createMemo(() => layout().slots.find((entry) => slotIds(entry.slot).includes(id)));
          const context: TileContext = {
            id,
            rect,
            startMove: (event) => dockGesture.start(id, event),
            remove: () => change(removeTile(props.layout, id)),
            dragging: () => dockGesture.dragging() === id,
            visible,
            tabs: group,
            collapse: collapseControls(id, placed),
          };
          return (
            <div class="twm-tile" data-tile-id={id} data-dragging={context.dragging() || undefined} hidden={!visible()}
              role={group() ? 'tabpanel' : undefined} data-collapsed={context.collapse.edge() ?? undefined} style={{ ...box(rect()), display: visible() ? undefined : 'none' }}>
              {props.children(context)}
            </div>
          );
        }}
      </For>
      <ResizeLayer root={props.layout} layout={layout()} size={size()} draft={draft()} setDraft={setDraft} onChange={change}
        optionsFor={(root) => optionsFor(tileIds(root))} readout={!!props.readout}
        color={typeof props.readout === 'object' ? props.readout.color : undefined} alignWith={props.alignWith} />
      <Show when={dockGesture.preview()}>
        {(preview) => (
          <>
            <Show when={preview().placement.targetRect}>{(target) => <div class="twm-preview-target" style={box(target())} />}</Show>
            <div class="twm-preview" data-zone={preview().zone} style={box(preview().placement.rect)} />
          </>
        )}
      </Show>
      <Show when={centerDrop()} keyed>
        {(drop) => {
          const close = () => setCenterDrop(null);
          const apply = (edit: (root: TileNode) => TileNode) => { const root = props.layout; close(); if (root) change(edit(root)); };
          // Swap trades places with what the target slot shows: its active tab.
          const shown = (root: TileNode) => { const slot = findSlot(root, drop.targetId)?.slot; return slot ? slotKey(slot) : drop.targetId; };
          return (
            <DockMenu x={drop.x} y={drop.y} onClose={close}
              onSwap={() => apply((root) => swapTiles(root, drop.movedId, shown(root)))}
              onTab={() => apply((root) => addToTabs(root, drop.movedId, drop.targetId))} />
          );
        }}
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
            tabs={!!props.tabs}
            keyboard={!!props.keyboardPlacement}
            tileLabel={(id) => (typeof props.keyboardPlacement === 'object' ? props.keyboardPlacement.label?.(id) : undefined) ?? id}
            onPlace={(targetId, zone, shares) => place(placing().id, insertTile(props.layout!, placing().id, targetId, zone, shares))}
            onCancel={() => props.onPlacingCancel?.()}
          />
        )}
      </Show>
    </div>
  );
}

