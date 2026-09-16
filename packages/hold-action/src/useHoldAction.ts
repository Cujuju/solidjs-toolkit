import { createSignal, onCleanup, type Accessor } from 'solid-js';
import { safeAddEventListener } from './_internal/safeEvent';

export interface HoldStage {
  /** ms from hold start — when elapsed time crosses this, `onReach` fires once. */
  at: number;
  onReach: () => void;
}

export interface UseHoldActionOptions {
  /** Duration to reach completion. REQUIRED — no default; context-dependent. */
  durationMs: number;
  onComplete: () => void;
  /** Called each RAF tick with progress 0→1. */
  onProgress?: (progress: number) => void;

  /** Optional intermediate stages; each fires once when its `at` ms is crossed. */
  stages?: HoldStage[];

  /** 'press' (pointerdown/leave) or 'hover' (pointerenter/leave). Default 'press'. */
  trigger?: 'press' | 'hover';

  /** Gate the hold — when returns false, no hold is started. */
  enabled?: Accessor<boolean>;

  /**
   * Fires when an in-progress hold is cancelled: pointerup mid-hold, leave, document mouseup,
   * pointercancel, or `cancel()`. Not after completion, and not on cleanup (the tree is gone).
   */
  onCancel?: () => void;

  /**
   * Default true: `shouldSuppressClick()` reports the synthetic click after a
   * completed hold. Nothing is suppressed unless your onClick calls it.
   */
  suppressClickAfterComplete?: boolean;
  /** Default true: cancel on pointerleave from the target. */
  cancelOnLeave?: boolean;
  /** Default true: mouse-up anywhere on document cancels an in-progress hold. */
  cancelOnDocumentMouseUp?: boolean;
}

export interface UseHoldActionHandlers {
  onPointerDown: (e: PointerEvent) => void;
  onPointerUp: (e: PointerEvent) => void;
  onPointerEnter: (e: PointerEvent) => void;
  onPointerLeave: (e: PointerEvent) => void;
  onPointerCancel: (e: PointerEvent) => void;
}

export interface UseHoldActionReturn {
  handlers: UseHoldActionHandlers;
  progress: Accessor<number>;
  holding: Accessor<boolean>;
  /**
   * True once if the last hold just completed, so an onClick can suppress the synthetic click
   * after pointerup. Auto-clears on read.
   */
  shouldSuppressClick: () => boolean;
  /** Imperatively cancel an in-progress hold. */
  cancel: () => void;
}

export function useHoldAction(options: UseHoldActionOptions): UseHoldActionReturn {
  const trigger = options.trigger ?? 'press';
  const enabled = options.enabled ?? (() => true);
  const suppressClick = options.suppressClickAfterComplete ?? true;
  const cancelOnLeave = options.cancelOnLeave ?? true;
  const cancelOnDocUp = options.cancelOnDocumentMouseUp ?? true;

  const [progress, setProgress] = createSignal(0);
  const [holding, setHolding] = createSignal(false);

  let rafId: number | null = null;
  let startTime: number | null = null;
  let reachedStages = new Set<number>();
  let justCompleted = false;
  let activePointerId: number | undefined;

  // A second pointer (e.g. another finger) must neither restart nor cancel the hold.
  const isOtherPointer = (e: PointerEvent): boolean =>
    startTime !== null && e.pointerId !== activePointerId;

  // Pure state reset, shared by stop() and onCleanup. Separate paths are what keep onCancel to
  // user gestures, never disposal.
  const resetState = (): void => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    startTime = null;
    setHolding(false);
    setProgress(0);
    reachedStages = new Set<number>();
  };

  // User-cancellation entry: fires onCancel only if a hold was in progress. Completion nulls
  // startTime first, so a trailing pointerup is a no-op here.
  const stop = (): void => {
    const wasInProgress = startTime !== null;
    resetState();
    if (wasInProgress) options.onCancel?.();
  };

  const start = (pointerId: number | undefined): void => {
    if (!enabled()) return;
    stop();
    justCompleted = false;
    activePointerId = pointerId;
    startTime = performance.now();
    setHolding(true);

    const tick = (now: number): void => {
      if (startTime === null) return;
      const elapsed = now - startTime;
      const p = Math.min(elapsed / options.durationMs, 1);
      setProgress(p);
      options.onProgress?.(p);

      // Fire stages that have been crossed
      if (options.stages) {
        for (let i = 0; i < options.stages.length; i++) {
          const stage = options.stages[i];
          if (!reachedStages.has(i) && elapsed >= stage.at) {
            reachedStages.add(i);
            stage.onReach();
          }
        }
      }

      if (p >= 1) {
        rafId = null;
        startTime = null;
        setHolding(false);
        setProgress(0);
        reachedStages = new Set<number>();
        justCompleted = true;
        options.onComplete();
        return;
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
  };

  // Document-level mouseup — catches releases outside the target element.
  if (cancelOnDocUp) {
    safeAddEventListener(
      typeof document !== 'undefined' ? document : null,
      'mouseup',
      () => { if (holding()) stop(); },
    );
  }

  // Cleanup uses resetState (not stop) — onCancel must not fire on disposal.
  onCleanup(resetState);

  const handlers: UseHoldActionHandlers = {
    onPointerDown: (e) => {
      if (trigger !== 'press') return;
      if (e.button !== undefined && e.button !== 0) return; // left click only for mouse
      if (isOtherPointer(e)) return;
      start(e.pointerId);
    },
    onPointerUp: (e) => {
      if (trigger !== 'press') return;
      if (isOtherPointer(e)) return;
      stop();
    },
    onPointerEnter: (e) => {
      if (trigger !== 'hover') return;
      if (isOtherPointer(e)) return;
      start(e.pointerId);
    },
    onPointerLeave: (e) => {
      if (isOtherPointer(e)) return;
      if (trigger === 'hover' || cancelOnLeave) stop();
    },
    // The platform took the pointer (touch pan, gesture). No pointerup follows,
    // and a trailing pointerleave is inert when cancelOnLeave is false.
    onPointerCancel: (e) => {
      if (isOtherPointer(e)) return;
      stop();
    },
  };

  /**
   * One-shot: true if a hold just completed and this is the first read; clears on read. False
   * when `suppressClickAfterComplete` is off.
   */
  const shouldSuppressClick = (): boolean => {
    if (!suppressClick) return false;
    if (!justCompleted) return false;
    justCompleted = false;
    return true;
  };

  return {
    handlers,
    shouldSuppressClick,
    progress,
    holding,
    cancel: stop,
  };
}
