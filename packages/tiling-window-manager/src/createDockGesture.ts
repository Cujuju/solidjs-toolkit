import { batch, createEffect, createMemo, createSignal, onCleanup } from 'solid-js';
import type { LayoutRect } from './layout.js';
import { tileHitAt, type TileHit } from './plan.js';
import type { DropZone } from './tileTree.js';

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
  /** The direct tab target under the pointer, when present. */
  tabRect?: LayoutRect;
}

/** A centre drop waiting for Swap or Tab. */
export interface CenterDrop { movedId: string; targetId: string; x: number; y: number }

/** A drag began, left or re-entered the window, or ended (released or cancelled). */
export type DragPhase = 'start' | 'outside' | 'inside' | 'end';

type PointerPosition = Pick<MouseEvent, 'clientX' | 'clientY'>;

/** A held-button drag keeps reporting beyond the window, with client coordinates outside the viewport. */
function insideViewport(event: PointerPosition): boolean {
  return event.clientX >= 0 && event.clientY >= 0 && event.clientX < window.innerWidth && event.clientY < window.innerHeight;
}

function tabTargetRect(container: HTMLElement, tileId: string, event: PointerPosition, selector: string): LayoutRect | null {
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
  canDrop: (movedId: string, targetId: string, zone: DropZone) => boolean;
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
  const [pointer, setPointer] = createSignal<PointerPosition | null>(null);
  createEffect(() => {
    const source = dragging();
    const point = pointer();
    setPreview(source && point ? hitTest(source, point) : null);
  });
  const targetId = createMemo(() => preview()?.targetId);
  const available = createMemo<ReadonlySet<DropZone>>(() => {
    const source = dragging();
    const target = targetId();
    return new Set(source && target ? MOVE_ZONES.filter((zone) => deps.canDrop(source, target, zone)) : []);
  });
  let teardown: (() => void) | undefined;
  const cancel = () => teardown?.();
  onCleanup(cancel);

  function hitTest(movedId: string, event: PointerPosition): DockPreview | null {
    const container = deps.container();
    const area = container?.getBoundingClientRect();
    if (!container || !area) return null;
    const hit = tileHitAt(deps.targets(), event.clientX - area.left, event.clientY - area.top, MOVE_ZONES, deps.exclude(movedId));
    if (!hit) return null;
    const bar = deps.onTab ? tabTargetRect(container, hit.targetId, event, deps.tabTarget?.() ?? DEFAULT_TAB_TARGET) : null;
    return bar ? { ...hit, zone: 'center', tabRect: bar } : hit;
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
      setPointer({ clientX: next.clientX, clientY: next.clientY });
    };
    // One batch: a centre drop's menu opens in the same update that ends the drag, so no state in between shows.
    const release = (next: PointerEvent) => batch(() => {
      const leftWindow = dragging() !== null && !insideViewport(next);
      const hit = dragging() ? hitTest(movedId, next) : null;
      const target = hit && deps.canDrop(movedId, hit.targetId, hit.zone) ? hit : null;
      finish();
      if (leftWindow && deps.onDropOutside) {
        deps.onDropOutside(movedId, next);
        return;
      }
      if (!target) return;
      if (target.tabRect) deps.onTab?.(movedId, target.targetId);
      else if (target.zone === 'center' && deps.onCenterDrop) deps.onCenterDrop({ movedId, targetId: target.targetId, x: next.clientX, y: next.clientY });
      else deps.onDrop(movedId, target.targetId, target.zone);
    });
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
      setPointer(null);
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
    setPointer({ clientX: event.clientX, clientY: event.clientY });
  }

  return { preview, available, dragging, start, begin, cancel };
}
