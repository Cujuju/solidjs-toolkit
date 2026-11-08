import { onCleanup } from 'solid-js';
import { RESIZE_KEY_STEPS, type LayoutRect, type ResizeSnap } from './layout';
import type { SplitDir } from './tileTree';

/** Ctrl drags freely. Alt is taken by OS window-drag tools (PowerToys Grab And Move swallows it). */
const FREE_DRAG_KEY = 'Control';
const PRIMARY_BUTTON = 0;
const snapFor = (event: MouseEvent | KeyboardEvent): ResizeSnap => (event.ctrlKey ? { kind: 'free' } : { kind: 'nearest' });
/** Auto-scroll starts this close to the scroller's top or bottom edge. */
const AUTO_SCROLL_EDGE_PX = 48;
/** Fastest auto-scroll, per animation frame, reached at the edge and beyond it. */
const AUTO_SCROLL_MAX_PX = 20;
/** A press already near the edge scrolls only once the pointer moves this much further toward it, so a click never scrolls. */
const AUTO_SCROLL_DEAD_PX = 8;
const SCROLLING = new Set(['auto', 'scroll']);

/** The nearest ancestor that scrolls vertically, and its visible top and bottom. */
function scrollerOf(el: HTMLElement): { el: Element; bounds: () => { top: number; bottom: number } } {
  for (let node = el.parentElement; node; node = node.parentElement) {
    if (SCROLLING.has(getComputedStyle(node).overflowY)) {
      const found = node;
      return { el: found, bounds: () => found.getBoundingClientRect() };
    }
  }
  return { el: document.scrollingElement ?? document.documentElement, bounds: () => ({ top: 0, bottom: window.innerHeight }) };
}

/**
 * Pixels per frame for a pointer at `y` that was pressed at `origin`: negative near the top, positive near or past the bottom.
 * Each zone starts at the edge band or just past the press point, whichever is further, and speeds up across one band.
 */
export function scrollSpeed(y: number, origin: number, top: number, bottom: number): number {
  const ramp = (depth: number) => Math.min(1, depth / AUTO_SCROLL_EDGE_PX) * AUTO_SCROLL_MAX_PX;
  const down = Math.max(bottom - AUTO_SCROLL_EDGE_PX, origin + AUTO_SCROLL_DEAD_PX);
  const up = Math.min(top + AUTO_SCROLL_EDGE_PX, origin - AUTO_SCROLL_DEAD_PX);
  if (y > down) return ramp(y - down);
  if (y < up) return -ramp(up - y);
  return 0;
}

/** A divider between two tiles: drag, arrow keys (1% steps) or double-click to equalise. */
export function ResizeHandle(props: {
  dir: SplitDir;
  rect: LayoutRect;
  onDraft: (deltaPx: number, snap: ResizeSnap) => void;
  onCommit: () => void;
  onCancel: () => void;
  /** `pointer` is false for a keyboard step, which commits at once. */
  onBegin: (pointer: boolean) => void;
  onEqualise: () => void;
  /** Scroll the nearest scroller while the pointer is dragged toward its edge; the scrolled pixels add to the drag. */
  autoScroll?: boolean;
  label?: string;
}) {
  let cancelDrag: (() => void) | undefined;
  onCleanup(() => cancelDrag?.());
  const coordinate = (event: PointerEvent) => (props.dir === 'row' ? event.clientX : event.clientY);

  function start(event: PointerEvent) {
    if (event.button !== PRIMARY_BUTTON) return;
    event.preventDefault();
    event.stopPropagation();
    cancelDrag?.();
    const el = event.currentTarget as HTMLElement;
    const origin = coordinate(event);
    const pointerId = event.pointerId;
    props.onBegin(true);
    el.setPointerCapture?.(pointerId);
    let delta = 0;
    let pointer = origin;
    let snap = snapFor(event);
    let scrolled = 0;
    let frame = 0;
    const scroller = props.autoScroll && props.dir === 'column' ? scrollerOf(el) : null;
    const report = () => { delta = pointer - origin + scrolled; props.onDraft(delta, snap); };
    const tick = () => {
      frame = 0;
      const { top, bottom } = scroller!.bounds();
      const speed = scrollSpeed(pointer, origin, top, bottom);
      if (!speed) return;
      const before = scroller!.el.scrollTop;
      scroller!.el.scrollTop += speed;
      // Only real scrolling moves the drag; a growing drag makes the room the next frame scrolls into.
      const moved = scroller!.el.scrollTop - before;
      if (moved) { scrolled += moved; report(); }
      frame = requestAnimationFrame(tick);
    };
    const move = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      pointer = coordinate(next);
      snap = snapFor(next);
      report();
      if (scroller && !frame) frame = requestAnimationFrame(tick);
    };
    // Pressing or releasing the free-drag key re-snaps in place, without waiting for a move.
    const toggleFree = (key: KeyboardEvent) => {
      if (key.key === FREE_DRAG_KEY && !key.repeat) { snap = snapFor(key); props.onDraft(delta, snap); }
    };
    const finish = (commit: boolean) => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', toggleFree);
      window.removeEventListener('keyup', toggleFree);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', cancel);
      el.removeEventListener('lostpointercapture', cancel);
      cancelDrag = undefined;
      if (el.hasPointerCapture?.(pointerId)) el.releasePointerCapture(pointerId);
      if (commit) props.onCommit();
      else props.onCancel();
    };
    const up = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      move(next);
      finish(true);
    };
    const cancel = () => finish(false);
    cancelDrag = cancel;
    window.addEventListener('keydown', toggleFree);
    window.addEventListener('keyup', toggleFree);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', cancel);
    el.addEventListener('lostpointercapture', cancel);
  }

  return (
    <div
      role="separator"
      tabIndex={0}
      class="twm-handle"
      data-dir={props.dir}
      aria-orientation={props.dir === 'row' ? 'vertical' : 'horizontal'}
      aria-label={props.label ?? 'Resize tiles (double-click to equalise)'}
      style={{ left: `${props.rect.x}px`, top: `${props.rect.y}px`, width: `${props.rect.width}px`, height: `${props.rect.height}px` }}
      onPointerDown={start}
      onKeyDown={(event) => {
        const [back, forward] = props.dir === 'row' ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown'];
        if (event.key !== back && event.key !== forward) return;
        event.preventDefault();
        props.onBegin(false);
        props.onDraft(0, { kind: 'by', steps: event.key === forward ? RESIZE_KEY_STEPS : -RESIZE_KEY_STEPS });
        props.onCommit();
      }}
      onDblClick={(event) => {
        event.stopPropagation();
        props.onEqualise();
      }}
    />
  );
}
