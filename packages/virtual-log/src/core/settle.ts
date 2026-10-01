/**
 * Whether a scroller is still moving under the user's hand or a scroll animation, and when it comes to rest. Pure:
 * the clock, frame scheduler and scroll reads are injected. Busy while a touch or mouse button is down, the offset is
 * out of bounds (rubber band), or until both `quietFrames` frames and `quietMs` pass with no activity and no offset change.
 */

export interface SettleOptions {
  now: () => number;
  /** Schedules `fn` for the next frame. */
  frame: (fn: () => void) => void;
  /** The scroller's current offset; polled each frame, since momentum may report scroll events sparsely. */
  offset: () => number;
  /** False during an overscroll bounce. */
  inBounds: () => boolean;
  onSettle: () => void;
  quietMs?: number;
  quietFrames?: number;
  /** A touch with no move or scroll for this long is treated as lost (its end went to a removed node). */
  touchWatchdogMs?: number;
}

export interface Settle {
  /** Scroll, wheel, navigation key or touch move. */
  activity(): void;
  /** Touch points now down (from touchstart / touchend / touchcancel). */
  touches(count: number): void;
  /** A mouse or pen button down on the scroller (scrollbar drag), or released anywhere. */
  pointer(down: boolean): void;
  busy(): boolean;
  dispose(): void;
}

export const QUIET_MS = 150;
export const QUIET_FRAMES = 3;
export const TOUCH_WATCHDOG_MS = 1000;

export function createSettle(o: SettleOptions): Settle {
  const quietMs = o.quietMs ?? QUIET_MS;
  const quietFrames = o.quietFrames ?? QUIET_FRAMES;
  const watchdogMs = o.touchWatchdogMs ?? TOUCH_WATCHDOG_MS;
  let touchCount = 0;
  let pointerDown = false;
  let lastActivity = -Infinity;
  let lastOffset = NaN;
  let quiet = 0;
  let looping = false;
  let busy = false;
  let disposed = false;

  const tick = (): void => {
    if (disposed) return;
    const t = o.now();
    const off = o.offset();
    if (off !== lastOffset) {
      lastOffset = off;
      lastActivity = t;
      quiet = 0;
    }
    if (touchCount > 0 && t - lastActivity >= watchdogMs) touchCount = 0;
    const held = touchCount > 0 || pointerDown || !o.inBounds();
    if (held || t - lastActivity < quietMs) quiet = 0;
    else quiet++;
    if (!held && quiet >= quietFrames) {
      looping = false;
      busy = false;
      o.onSettle();
      return;
    }
    o.frame(tick);
  };

  const wake = (): void => {
    busy = true;
    quiet = 0;
    lastOffset = o.offset();
    if (looping) return;
    looping = true;
    o.frame(tick);
  };

  return {
    activity() {
      lastActivity = o.now();
      wake();
    },
    touches(count) {
      touchCount = Math.max(0, count);
      lastActivity = o.now();
      wake();
    },
    pointer(down) {
      if (!down && !pointerDown) return;
      pointerDown = down;
      lastActivity = o.now();
      wake();
    },
    busy: () => busy,
    dispose() {
      disposed = true;
    },
  };
}
