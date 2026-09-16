/**
 * Hover-intent state machine, DOM-free for testing. Interactive hide debounces so the pointer
 * crosses the trigger–panel gap: ~20px at ~200px/s ≈ 100ms. showDelayMs defaults to 0:
 * density-dependent.
 */

export interface HoverIntentOptions {
  setVisible: (v: boolean) => void;
  shouldShow: () => boolean;
  interactive: () => boolean;
  hideDelayMs: () => number;
  /**
   * Rest delay (ms) before showing. Optional; absent or <= 0 means show
   * immediately, which is the 0.1.x behaviour. See the header for why this
   * has no derived default.
   */
  showDelayMs?: () => number;
  /**
   * Enables the pointerdown dismissal branch. Absent = disabled, which is the
   * 0.1.x behaviour (pointerdown was not observed at all).
   */
  hideOnPointerDown?: () => boolean;
  /**
   * Veto consulted on both show paths; suppresses without touching timers. Injected to keep
   * the machine DOM-free.
   */
  blockShow?: () => boolean;
}

export interface HoverIntentApi {
  onTriggerEnter: () => void;
  onTriggerLeave: () => void;
  onPanelEnter: () => void;
  onPanelLeave: () => void;
  /**
   * Show now, skipping `showDelayMs` but honouring every gate. For focus: the rest delay guards
   * pointer sweeps, which focus can't cause.
   */
  showNow: () => void;
  /** Pointer pressed on the trigger — see `hideOnPointerDown`. */
  onTriggerPointerDown: () => void;
  /**
   * Hide immediately, cancelling both pending timers. For external dismissal
   * causes (scroll) that are not part of the hover state machine.
   */
  hideNow: () => void;
  /** Cancels any pending show/hide timer — call from component cleanup. */
  cleanup: () => void;
}

export function createHoverIntent(opts: HoverIntentOptions): HoverIntentApi {
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  let showTimer: ReturnType<typeof setTimeout> | undefined;

  const cancelHide = (): void => {
    if (hideTimer !== undefined) {
      clearTimeout(hideTimer);
      hideTimer = undefined;
    }
  };

  const cancelShow = (): void => {
    if (showTimer !== undefined) {
      clearTimeout(showTimer);
      showTimer = undefined;
    }
  };

  const armHide = (): void => {
    cancelHide();
    hideTimer = setTimeout(() => {
      hideTimer = undefined;
      opts.setVisible(false);
    }, opts.hideDelayMs());
  };

  /**
   * Set by pointerdown, cleared only on trigger leave. Load-bearing: hiding alone can't stop a
   * pending `showDelayMs` show from painting over what the click opened.
   */
  let suppressedUntilReenter = false;

  /** The single place visibility is asserted — every show gate lives here. */
  const show = (): void => {
    if (suppressedUntilReenter) return;
    if (opts.blockShow?.()) return;
    if (opts.shouldShow()) opts.setVisible(true);
  };

  return {
    onTriggerEnter: (): void => {
      cancelHide();
      const delay = opts.showDelayMs?.() ?? 0;
      if (delay <= 0) {
        show();
        return;
      }
      // Rest delay: a pointer passing through leaves first, cancelling this timer.
      cancelShow();
      showTimer = setTimeout(() => {
        showTimer = undefined;
        show();
      }, delay);
    },
    onTriggerLeave: (): void => {
      // Unconditional: a pending show must die on leave in BOTH interactive
      // and non-interactive mode, otherwise the panel appears after the
      // pointer has already gone.
      cancelShow();
      // Leaving the trigger is the ONLY thing that clears pointerdown
      // suppression — that is what makes it "until the pointer leaves and
      // re-enters" rather than "until the next mouse event".
      suppressedUntilReenter = false;
      if (opts.interactive()) armHide();
      else opts.setVisible(false);
    },
    showNow: (): void => {
      cancelHide();
      cancelShow();
      show();
    },
    onPanelEnter: (): void => {
      if (opts.interactive()) cancelHide();
    },
    onPanelLeave: (): void => {
      if (opts.interactive()) armHide();
    },
    onTriggerPointerDown: (): void => {
      if (!(opts.hideOnPointerDown?.() ?? false)) return;
      cancelShow();
      cancelHide();
      suppressedUntilReenter = true;
      opts.setVisible(false);
    },
    hideNow: (): void => {
      cancelShow();
      cancelHide();
      opts.setVisible(false);
    },
    cleanup: (): void => {
      cancelHide();
      cancelShow();
    },
  };
}
