import { onCleanup } from 'solid-js';
import { RESIZE_KEY_STEPS, type LayoutRect, type ResizeSnap } from './layout';
import type { SplitDir } from './tileTree';

/** Ctrl drags freely. Alt is taken by OS window-drag tools (PowerToys Grab And Move swallows it). */
const FREE_DRAG_KEY = 'Control';
const PRIMARY_BUTTON = 0;
const snapFor = (event: MouseEvent | KeyboardEvent): ResizeSnap => (event.ctrlKey ? { kind: 'free' } : { kind: 'nearest' });
/** Auto-scroll starts this close to the scroller's top or bottom edge. */
const AUTO_SCROLL_EDGE_PX = 48;
/** Fastest auto-scroll, reached at the edge and beyond it: 10px a frame at 60Hz. Time-based, so fast displays don't scroll faster. */
const AUTO_SCROLL_MAX_PX_PER_S = 600;
/** A frame gap longer than this (a stall) scrolls as if it were this long, so the page never leaps. */
const AUTO_SCROLL_MAX_FRAME_MS = 50;
const MS_PER_S = 1000;
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
 * Pixels per second for a pointer at `y` that was pressed at `origin`: negative near the top, positive near or past the bottom.
 * Each zone starts at the edge band or just past the press point, whichever is further, and speeds up across one band:
 * squared, so the first pixels into it creep and the top speed needs the pointer at the edge.
 */
export function scrollSpeed(y: number, origin: number, top: number, bottom: number): number {
  const ramp = (depth: number) => Math.min(1, depth / AUTO_SCROLL_EDGE_PX) ** 2 * AUTO_SCROLL_MAX_PX_PER_S;
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
  /** Scroll the nearest scroller while the pointer is dragged toward its edge. */
  autoScroll?: boolean;
  label?: string;
}) {
  let cancelDrag: (() => void) | undefined;
  onCleanup(() => cancelDrag?.());
  const coordinate = (event: PointerEvent) => (props.dir === 'row' ? event.clientX : event.clientY);
  /** The workspace's leading edge on screen; it moves when anything scrolls. */
  const edgeOf = (workspace: Element) => { const r = workspace.getBoundingClientRect(); return props.dir === 'row' ? r.left : r.top; };

  function start(event: PointerEvent) {
    if (event.button !== PRIMARY_BUTTON) return;
    event.preventDefault();
    event.stopPropagation();
    cancelDrag?.();
    const el = event.currentTarget as HTMLElement;
    const origin = coordinate(event);
    // The drag is measured in workspace pixels, so wheel and auto-scroll during it keep the divider under the pointer.
    const workspace = el.parentElement!;
    const originEdge = edgeOf(workspace);
    const pointerId = event.pointerId;
    props.onBegin(true);
    el.setPointerCapture?.(pointerId);
    let delta = 0;
    let pointer = origin;
    let snap = snapFor(event);
    let frame = 0;
    let lastTick = 0;
    /** Sub-pixel scroll carried between frames: a slow scroll at a high refresh rate moves under a pixel a frame. */
    let carry = 0;
    const scroller = props.autoScroll && props.dir === 'column' ? scrollerOf(el) : null;
    /** Where the press point is on screen now. */
    const pressPoint = () => origin + edgeOf(workspace) - originEdge;
    /** Drafts the drag when it moved, or always after a snap change. */
    const report = (force = false) => {
      const next = pointer - pressPoint();
      if (force || next !== delta) { delta = next; props.onDraft(delta, snap); }
    };
    const tick = (now: number) => {
      frame = 0;
      const { top, bottom } = scroller!.bounds();
      const speed = scrollSpeed(pointer, pressPoint(), top, bottom);
      if (!speed) { lastTick = 0; carry = 0; return; }
      const elapsed = lastTick ? Math.min(now - lastTick, AUTO_SCROLL_MAX_FRAME_MS) : 0;
      lastTick = now;
      // The scroll event reports the new position; a growing drag makes the room the next frame scrolls into.
      carry += speed * elapsed / MS_PER_S;
      const whole = Math.trunc(carry);
      carry -= whole;
      if (whole) scroller!.el.scrollTop += whole;
      frame = requestAnimationFrame(tick);
    };
    const scrolled = () => report();
    const move = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      pointer = coordinate(next);
      const nextSnap = snapFor(next);
      const resnap = nextSnap.kind !== snap.kind;
      snap = nextSnap;
      report(resnap);
      if (scroller && !frame) frame = requestAnimationFrame(tick);
    };
    // Pressing or releasing the free-drag key re-snaps in place, without waiting for a move.
    const toggleFree = (key: KeyboardEvent) => {
      if (key.key === FREE_DRAG_KEY && !key.repeat) { snap = snapFor(key); report(true); }
    };
    const finish = (commit: boolean) => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', scrolled, true);
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
    window.addEventListener('scroll', scrolled, true);
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
