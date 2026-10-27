import { createSignal, onCleanup } from 'solid-js';
import type { LayoutRect } from './layout';
import { tileHitAt, type TileHit } from './plan';
import type { DropZone } from './tileTree';

/** Pointer travel before a press on a tile's grip becomes a drag, so a plain click stays a click. */
export const DOCK_THRESHOLD_PX = 6;
const PRIMARY_BUTTON = 0;
/** Moving a tile: an edge docks beside the target; the centre swaps with it (or offers Swap / Tab). */
export const MOVE_ZONES: readonly DropZone[] = ['left', 'right', 'top', 'bottom', 'center'];
/** Controls inside a grip keep their own clicks and never start a drag. */
const NO_DRAG = 'button, a, input, select, textarea, [data-twm-no-drag]';
/** Marks an element (usually a tile's header) where a drop joins that tile's slot as a tab. */
export const TAB_TARGET_ATTR = 'data-twm-tab-target';
/** Finds tab targets when the host names none. */
export const DEFAULT_TAB_TARGET = `[${TAB_TARGET_ATTR}]`;

export interface DockPreview extends TileHit {
  /** Where the moved tile and the target land if released here. */
  placement: { rect: LayoutRect; targetRect?: LayoutRect };
  /** Dropping here joins the target as a tab, without asking. */
  tab?: boolean;
}

/** A centre drop waiting for Swap or Tab. */
export interface CenterDrop { movedId: string; targetId: string; x: number; y: number }

/** A drag began, left or re-entered the window, or ended (released or cancelled). */
export type DragPhase = 'start' | 'outside' | 'inside' | 'end';

/** A held-button drag keeps reporting beyond the window, with client coordinates outside the viewport. */
function insideViewport(event: MouseEvent): boolean {
  return event.clientX >= 0 && event.clientY >= 0 && event.clientX < window.innerWidth && event.clientY < window.innerHeight;
}

function tabTargetRect(container: HTMLElement, tileId: string, event: MouseEvent, selector: string): LayoutRect | null {
  if (typeof document.elementsFromPoint !== 'function') return null;
  const area = container.getBoundingClientRect();
  for (const element of document.elementsFromPoint(event.clientX, event.clientY)) {
    const target = element.closest<HTMLElement>(selector);
    const tile = target?.closest<HTMLElement>('[data-tile-id]');
    if (!target || tile?.dataset.tileId !== tileId || !container.contains(target)) continue;
    const box = target.getBoundingClientRect();
    return { x: box.left - area.left, y: box.top - area.top, width: box.width, height: box.height };
  }
  return null;
}

/** Owns one pending press or active tile drag; the workspace previews and applies the result. */
export function createDockGesture(deps: {
  container: () => HTMLElement | undefined;
  /** Drop targets: slot boxes keyed by the id that addresses each slot. */
  targets: () => ReadonlyMap<string, LayoutRect>;
  /** A target the moved tile can never drop on: its own single-tile slot. */
  exclude: (movedId: string) => string | undefined;
  /** The rendered result of a move, or null when it changes nothing. */
  plan: (movedId: string, targetId: string, zone: DropZone) => DockPreview['placement'] | null;
  onDrop: (movedId: string, targetId: string, zone: DropZone) => void;
  /** Set when tab groups are on: a tab-target drop joins the target as a tab. */
  onTab?: (movedId: string, targetId: string) => void;
  /** CSS selector for tab targets; defaults to `DEFAULT_TAB_TARGET`. */
  tabTarget?: () => string;
  /** Set when tab groups are on: a centre drop asks Swap or Tab. */
  onCenterDrop?: (drop: CenterDrop) => void;
  /** Set when tiles can leave the window: a release outside it hands the tile over instead of docking. */
  onDropOutside?: (movedId: string, event: PointerEvent) => void;
  /** Reports each drag phase; `end` comes before `onDropOutside`. */
  onDragPhase?: (phase: DragPhase) => void;
}) {
  const [preview, setPreview] = createSignal<DockPreview | null>(null);
  const [dragging, setDragging] = createSignal<string | null>(null);
  let teardown: (() => void) | undefined;
  const cancel = () => teardown?.();
  onCleanup(cancel);

  function hitTest(movedId: string, event: MouseEvent): DockPreview | null {
    const container = deps.container();
    const area = container?.getBoundingClientRect();
    if (!container || !area) return null;
    const hit = tileHitAt(deps.targets(), event.clientX - area.left, event.clientY - area.top, MOVE_ZONES, deps.exclude(movedId));
    if (!hit) return null;
    const bar = deps.onTab ? tabTargetRect(container, hit.targetId, event, deps.tabTarget?.() ?? DEFAULT_TAB_TARGET) : null;
    // No centre plan means the target is the tile's own slot, whose strip reorders it instead.
    if (bar) return deps.plan(movedId, hit.targetId, 'center') ? { ...hit, zone: 'center', tab: true, placement: { rect: bar } } : null;
    const placement = deps.plan(movedId, hit.targetId, hit.zone);
    if (!placement) return null;
    // A centre drop that asks first previews the whole target, not a guessed swap.
    return { ...hit, placement: hit.zone === 'center' && deps.onCenterDrop ? { rect: hit.rect } : placement };
  }

  function track(movedId: string, startX: number, startY: number, alreadyDragging: boolean) {
    cancel();
    let outside = false;
    const beginDrag = () => { setDragging(movedId); deps.onDragPhase?.('start'); };
    if (alreadyDragging) beginDrag();
    const move = (next: PointerEvent) => {
      if (!dragging() && Math.hypot(next.clientX - startX, next.clientY - startY) < DOCK_THRESHOLD_PX) return;
      if (!dragging()) beginDrag();
      next.preventDefault();
      if (outside === insideViewport(next)) {
        outside = !outside;
        deps.onDragPhase?.(outside ? 'outside' : 'inside');
      }
      setPreview(hitTest(movedId, next));
    };
    const release = (next: PointerEvent) => {
      const leftWindow = dragging() !== null && !insideViewport(next);
      const target = dragging() ? hitTest(movedId, next) : null;
      finish();
      if (leftWindow && deps.onDropOutside) {
        deps.onDropOutside(movedId, next);
        return;
      }
      if (!target) return;
      if (target.tab) deps.onTab?.(movedId, target.targetId);
      else if (target.zone === 'center' && deps.onCenterDrop) deps.onCenterDrop({ movedId, targetId: target.targetId, x: next.clientX, y: next.clientY });
      else deps.onDrop(movedId, target.targetId, target.zone);
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
      if (dragging()) deps.onDragPhase?.('end');
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

  /** A press on a grip (`pointerdown` or `mousedown`): it becomes a drag once the pointer travels past the threshold. */
  function start(movedId: string, event: MouseEvent) {
    if (event.button !== PRIMARY_BUTTON || (event.target as Element | null)?.closest?.(NO_DRAG)) return;
    // A lone tile has nowhere to dock here, but may still leave the window.
    if (deps.targets().size < 2 && deps.exclude(movedId) === movedId && !deps.onDropOutside) return;
    track(movedId, event.clientX, event.clientY, false);
  }

  /** Continues a drag that began elsewhere (a tab pulled off its strip) from `event`. */
  function begin(movedId: string, event: MouseEvent) {
    track(movedId, event.clientX, event.clientY, true);
    setPreview(hitTest(movedId, event));
  }

  return { preview, dragging, start, begin, cancel };
}
