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
   * Called when an in-progress hold is cancelled before completion. Fires for
   * every user-cancellation path: pointerup mid-hold, pointerleave (when
   * cancelOnLeave is true), document mouseup (when cancelOnDocumentMouseUp is
   * true), and the imperative `cancel()` return-value method.
   *
   * Does NOT fire after a completed hold (use `onComplete` for that).
   * Does NOT fire on component cleanup — the component is being torn down,
   * so any "revert UI" logic in onCancel would run against a dead tree.
   */
  onCancel?: () => void;

  /** Default true: eats the synthetic click that fires after a completed hold. */
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
}

export interface UseHoldActionReturn {
  handlers: UseHoldActionHandlers;
  progress: Accessor<number>;
  holding: Accessor<boolean>;
  /**
   * Returns true if the most recent hold just completed AND the current
   * call is the first check since completion — callers use this in their
   * own onClick to decide whether to suppress the click that synthetically
   * follows pointerup. The flag auto-clears after one read (single-shot),
   * so subsequent clicks are never suppressed.
   *
   * @example
   *   const hold = useHoldAction({ durationMs: 250, onComplete: markRead });
   *   const onClick = (e: MouseEvent) => {
   *     if (hold.shouldSuppressClick()) { e.preventDefault(); return; }
   *     openPopover();
   *   };
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

  // Pure state reset. Used by both stop() (user-cancellation path) and
  // onCleanup (component-disposal path). Splitting these is what lets
  // onCancel fire only on user gestures, not on lifecycle events — running
  // consumer logic against a torn-down component would be a footgun.
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

  // User-cancellation entry point. Fires onCancel only if a hold was actually
  // in progress (startTime !== null). After a completion the inline path at
  // line ~115 already nulled startTime, so a trailing pointerup that calls
  // stop() is a no-op here — onCancel does NOT fire after onComplete.
  const stop = (): void => {
    const wasInProgress = startTime !== null;
    resetState();
    if (wasInProgress) options.onCancel?.();
  };

  const start = (): void => {
    if (!enabled()) return;
    stop();
    justCompleted = false;
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
      start();
    },
    onPointerUp: () => {
      if (trigger !== 'press') return;
      stop();
    },
    onPointerEnter: () => {
      if (trigger !== 'hover') return;
      start();
    },
    onPointerLeave: () => {
      if (trigger === 'hover' || cancelOnLeave) stop();
    },
  };

  /**
   * One-shot accessor: true if a hold just completed and this is the first
   * read since. Automatically clears on read so subsequent clicks aren't
   * accidentally suppressed. No-ops (returns false) when the feature is
   * disabled via `suppressClickAfterComplete: false`.
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
