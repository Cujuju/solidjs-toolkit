import { onCleanup } from 'solid-js';
import { RESIZE_KEY_STEPS, type LayoutRect, type ResizeSnap } from './layout';
import type { SplitDir } from './tileTree';

/** Ctrl drags freely. Alt is taken by OS window-drag tools (PowerToys Grab And Move swallows it). */
const FREE_DRAG_KEY = 'Control';
const PRIMARY_BUTTON = 0;
const snapFor = (event: MouseEvent | KeyboardEvent): ResizeSnap => (event.ctrlKey ? { kind: 'free' } : { kind: 'nearest' });

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
    const move = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      delta = coordinate(next) - origin;
      props.onDraft(delta, snapFor(next));
    };
    // Pressing or releasing the free-drag key re-snaps in place, without waiting for a move.
    const toggleFree = (key: KeyboardEvent) => {
      if (key.key === FREE_DRAG_KEY && !key.repeat) props.onDraft(delta, snapFor(key));
    };
    const finish = (commit: boolean) => {
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
      aria-label="Resize tiles (double-click to equalise)"
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
