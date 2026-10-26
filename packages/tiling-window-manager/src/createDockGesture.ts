import { createSignal, onCleanup } from 'solid-js';
import type { LayoutRect } from './layout';
import { tileHitAt, type TileHit } from './plan';
import type { DropZone } from './tileTree';

/** Pointer travel before a press on a tile's grip becomes a drag, so a plain click stays a click. */
export const DOCK_THRESHOLD_PX = 6;
const PRIMARY_BUTTON = 0;
/** Moving a tile: an edge docks beside the target; the centre swaps places with it. */
export const MOVE_ZONES: readonly DropZone[] = ['left', 'right', 'top', 'bottom', 'center'];
/** Controls inside a grip keep their own clicks and never start a drag. */
const NO_DRAG = 'button, a, input, select, textarea, [data-twm-no-drag]';

export interface DockPreview extends TileHit {
  /** Where the moved tile and the target land if released here. */
  placement: { rect: LayoutRect; targetRect: LayoutRect };
}

/** Owns one pending press or active tile drag; the workspace previews and applies the result. */
export function createDockGesture(deps: {
  container: () => HTMLElement | undefined;
  tiles: () => ReadonlyMap<string, LayoutRect>;
  /** The rendered result of a move, or null when it changes nothing. */
  plan: (movedId: string, targetId: string, zone: DropZone) => DockPreview['placement'] | null;
  onDrop: (movedId: string, targetId: string, zone: DropZone) => void;
}) {
  const [preview, setPreview] = createSignal<DockPreview | null>(null);
  const [dragging, setDragging] = createSignal<string | null>(null);
  let teardown: (() => void) | undefined;
  const cancel = () => teardown?.();
  onCleanup(cancel);

  function hitTest(movedId: string, event: PointerEvent): DockPreview | null {
    const area = deps.container()?.getBoundingClientRect();
    if (!area) return null;
    const hit = tileHitAt(deps.tiles(), event.clientX - area.left, event.clientY - area.top, MOVE_ZONES, movedId);
    const placement = hit && deps.plan(movedId, hit.targetId, hit.zone);
    return hit && placement ? { ...hit, placement } : null;
  }

  function start(movedId: string, event: PointerEvent) {
    if (event.button !== PRIMARY_BUTTON || (event.target as Element | null)?.closest?.(NO_DRAG)) return;
    cancel();
    if (deps.tiles().size < 2) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const move = (next: PointerEvent) => {
      if (!dragging() && Math.hypot(next.clientX - startX, next.clientY - startY) < DOCK_THRESHOLD_PX) return;
      setDragging(movedId);
      next.preventDefault();
      setPreview(hitTest(movedId, next));
    };
    const release = (next: PointerEvent) => {
      const target = dragging() ? hitTest(movedId, next) : null;
      finish();
      if (target) deps.onDrop(movedId, target.targetId, target.zone);
    };
    const keydown = (next: KeyboardEvent) => {
      if (next.key !== 'Escape') return;
      next.preventDefault();
      next.stopImmediatePropagation();
      finish();
    };
    const finish = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', finish);
      window.removeEventListener('keydown', keydown, true);
      window.removeEventListener('blur', finish);
      setPreview(null);
      setDragging(null);
      teardown = undefined;
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', finish);
    window.addEventListener('keydown', keydown, true);
    window.addEventListener('blur', finish);
    teardown = finish;
  }

  return { preview, dragging, start, cancel };
}
