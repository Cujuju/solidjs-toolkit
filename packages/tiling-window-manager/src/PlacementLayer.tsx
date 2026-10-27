import { createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import { computeTileLayout, slotRects, type LayoutRect, type TileLayoutOptions, type TileSize } from './layout';
import { planInsertion, planReflow, planTab, tileHitAt, type InsertionPlan, type PlacementMode } from './plan';
import type { DockSide, DropZone, InsertionShares, TileNode } from './tileTree';

/** A new tile splits a tile; with tab groups on, the centre adds it as a tab. */
const SPLIT_ZONES: readonly DropZone[] = ['left', 'right', 'top', 'bottom'];
const TAB_ZONES: readonly DropZone[] = [...SPLIT_ZONES, 'center'];
/** Keyboard placement: arrow keys pick the side of the focused tile. */
const ARROW_SIDES: Record<string, DockSide> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'top', ArrowDown: 'bottom' };
/** With tab groups on, this key picks the centre: add as a tab. */
const TAB_KEY = 't';
/** The side a focused tile starts on before an arrow key picks one. */
const DEFAULT_SIDE: DockSide = 'right';

export interface Placing {
  id: string;
  /** Shown in the caption: "Place <label>". */
  label: string;
}

interface Target { targetId: string; side: DropZone; plan: InsertionPlan }

/** Covers the workspace while a new tile waits for a spot: hover previews the split, click places, Esc cancels. */
export function PlacementLayer(props: {
  root: TileNode;
  size: TileSize;
  options: TileLayoutOptions;
  placing: Placing;
  mode: PlacementMode;
  growHeight: boolean;
  tabs: boolean;
  /** Focusable tile targets: Tab moves between tiles, arrow keys pick a side, Enter places. */
  keyboard: boolean;
  /** Names a tile for its keyboard target. */
  tileLabel: (id: string) => string;
  onPlace: (targetId: string, zone: DropZone, shares?: InsertionShares) => void;
  onCancel: () => void;
}) {
  let layer!: HTMLDivElement;
  let cancelButton!: HTMLButtonElement;
  const [target, setTarget] = createSignal<Target | null>(null);

  const targetAt = (event: MouseEvent): Target | null => {
    const area = layer.getBoundingClientRect();
    const before = computeTileLayout(props.root, props.size, props.options);
    const hit = tileHitAt(slotRects(before), event.clientX - area.left, event.clientY - area.top, props.tabs ? TAB_ZONES : SPLIT_ZONES);
    if (!hit) return null;
    return { targetId: hit.targetId, side: hit.zone, plan: planFor(hit.targetId, hit.zone, before) };
  };
  const planFor = (targetId: string, zone: DropZone, before = computeTileLayout(props.root, props.size, props.options)): InsertionPlan => {
    if (zone === 'center') return planTab(props.root, props.placing.id, targetId, props.size, props.options);
    return props.mode === 'reflow'
      ? planReflow(props.root, props.placing.id, targetId, zone, props.size, props.options, props.growHeight)
      : planInsertion(props.root, props.placing.id, targetId, zone, props.size, props.options, before);
  };

  const commit = (chosen: Target | null) => {
    setTarget(chosen);
    if (chosen?.plan.valid) props.onPlace(chosen.targetId, chosen.side, chosen.plan.shares);
  };
  const place = (event: MouseEvent) => commit(targetAt(event));
  const choose = (targetId: string, side: DropZone) => setTarget({ targetId, side, plan: planFor(targetId, side) });
  const slots = createMemo(() => [...slotRects(computeTileLayout(props.root, props.size, props.options))]);
  const onTargetKey = (event: KeyboardEvent, targetId: string) => {
    const current = target()?.targetId === targetId ? target() : null;
    const side = ARROW_SIDES[event.key] ?? (props.tabs && event.key.toLowerCase() === TAB_KEY ? 'center' : undefined);
    if (side) choose(targetId, side);
    else if (event.key === 'Enter' || event.key === ' ') commit(current ?? { targetId, side: DEFAULT_SIDE, plan: planFor(targetId, DEFAULT_SIDE) });
    else return;
    event.preventDefault();
    event.stopPropagation();
  };

  onMount(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelButton.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      props.onCancel();
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('blur', props.onCancel);
    onCleanup(() => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('blur', props.onCancel);
      if (opener?.isConnected) opener.focus();
    });
  });

  const caption = () => {
    const chosen = target();
    if (!chosen) return props.keyboard ? 'Point at a tile and click a side, or Tab to a tile and press an arrow key' : 'Point at a tile, then click the side to place it on';
    const verb = props.keyboard ? 'Click or press Enter' : 'Click';
    return !chosen.plan.valid ? chosen.plan.reason : chosen.side === 'center' ? `${verb} to add as a tab` : `${verb} to place on the ${chosen.side}`;
  };
  const box = (rect: LayoutRect) => ({ left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px` });

  return (
    <div
      ref={layer}
      class="twm-placement"
      role="dialog"
      aria-label={`Place ${props.placing.label}`}
      onPointerMove={(event) => setTarget(targetAt(event))}
      onPointerLeave={() => setTarget(null)}
      onClick={place}
      onContextMenu={(event) => {
        event.preventDefault();
        props.onCancel();
      }}
    >
      <Show when={target()}>
        {(chosen) => (
          <>
            <Show when={chosen().plan.valid ? chosen().plan : null}>
              {(plan) => <div class="twm-preview-target" style={box((plan() as Extract<InsertionPlan, { valid: true }>).targetRect)} />}
            </Show>
            <div class="twm-preview" data-blocked={!chosen().plan.valid} style={box(chosen().plan.rect)} />
          </>
        )}
      </Show>
      <div class="twm-caption" role="status" onClick={(event) => event.stopPropagation()}>
        <span>
          <strong>Place {props.placing.label}</strong>
          <span class="twm-caption-sub">{caption()}</span>
        </span>
        <button ref={cancelButton} type="button" class="twm-caption-cancel" onClick={() => props.onCancel()}>
          Cancel <kbd>Esc</kbd>
        </button>
      </div>
      <Show when={props.keyboard}>
        <For each={slots()}>
          {([id, rect]) => (
            <button type="button" class="twm-place-target" style={box(rect)} aria-label={`Place beside ${props.tileLabel(id)}`}
              aria-keyshortcuts={props.tabs ? 'ArrowLeft ArrowRight ArrowUp ArrowDown T Enter' : 'ArrowLeft ArrowRight ArrowUp ArrowDown Enter'}
              onFocus={() => choose(id, target()?.side ?? DEFAULT_SIDE)}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => onTargetKey(event, id)} />
          )}
        </For>
      </Show>
    </div>
  );
}
