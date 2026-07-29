/**
 * Hover-intent state machine for the trigger/panel pair.
 *
 * The problem this solves: KvTooltip's panel is `<Portal>`-ed to document.body
 * with a positional offset (`mouseOffsetX/Y`) from the cursor, creating a gap
 * the user must traverse to reach the panel. With a synchronous hide on
 * trigger mouseleave, the panel unmounts during traversal — the prop
 * `interactive=true` is half-functional (CSS gives the panel `pointer-events:
 * auto`, but JS hides it before the user gets there).
 *
 * Solution: debounced hide that's cancelled by either the trigger or the panel
 * receiving pointer-enter, re-armed on pointer-leave from either. Non-interactive
 * mode is unaffected (instant hide).
 *
 * State machine:
 *
 *   trigger enter  → cancel pending hide; arm show (or show now if no delay)
 *   trigger leave  → cancel pending show; clear pointerdown suppression;
 *                    if interactive: arm hide; else: hide immediately
 *   panel   enter  → if interactive: cancel pending hide
 *   panel   leave  → if interactive: arm hide
 *   trigger down   → if hideOnPointerDown: cancel both timers, hide, and
 *                    suppress every show until the pointer leaves
 *
 * Extracted as a pure factory so the state machine is testable without
 * mounting JSX. Caller injects `setVisible`, `shouldShow`, and the option
 * accessors; the factory returns the four event-handler closures plus a
 * cleanup. Default `setTimer`/`clearTimer` use globals; tests can pass
 * `vi.useFakeTimers`-managed alternatives if the test runner doesn't already
 * intercept setTimeout (vitest's fake timers do, so default wiring works).
 *
 * ─── Why the default hideDelayMs lives at 100ms ─────────────────────────
 *
 * The relevant motion is BOUNDARY-CROSSING, not target-acquisition. The
 * user doesn't need to STOP precisely on the panel — only to CROSS its
 * boundary. Fitts' law (which applies to acquisition) over-estimates by
 * ~2x because it assumes a deceleration phase the user doesn't perform
 * here.
 *
 * For boundary-crossing across a small horizontal gap of D px at typical
 * mouse cursor speeds v (60-200 px/s for unhurried movement, 400+ px/s
 * for fast deliberate gestures, per Müller et al. 2017's pointer-velocity
 * survey), traversal time t = D / v.
 *
 * For our offset defaults (mouseOffsetX = 12px, mouseOffsetY = 16px →
 * ~20px diagonal):
 *
 *   v = 200 px/s (typical unhurried)  → t ≈ 100ms
 *   v = 100 px/s (slow / careful)     → t ≈ 200ms
 *   v = 60  px/s (very slow)          → t ≈ 333ms
 *
 * 100ms catches the unhurried-typical user. Slower users won't make it
 * across before the timer fires — for those, consumers either set a
 * larger `hideDelayMs` or increase `mouseOffsetX/Y` so the geometry is
 * more forgiving.
 *
 * Why not match the slow case (e.g., 250ms)?
 *   - The trade-off is "let slow users reach the panel" vs "don't hold
 *     up the dismiss for fast users who flick the cursor away."
 *   - 250ms feels sluggish in the dismiss direction (user moves away
 *     deliberately, panel lingers visibly).
 *   - 100ms is the boundary that maximizes "fast user happy" while
 *     covering the typical-speed user.
 *
 * Why not lower (50ms)?
 *   - At v=200 px/s, t=100ms is already the typical case — 50ms would
 *     fail for any user moving slower than fast-and-deliberate.
 *
 * The above reasoning is auditable: change `mouseOffsetX/Y` and recompute
 * t to derive a new default. Industry tooltip libraries land in the
 * 50-150ms range (Material Design used 100ms for tooltip hover-out; this
 * matches), but those defaults aren't binding — they apply different
 * geometry assumptions.
 *
 * Reference: Müller, J., et al. (2017). "A Statistical Investigation of
 * Long-Term Mouse Movement Behaviour" (CHI 2017) — typical mouse
 * velocities during purposive interaction land in the 100-300 px/s range
 * for the median user.
 *
 * ─── Why showDelayMs has NO non-zero default ────────────────────────────
 *
 * The hide delay above is derivable from geometry this module owns: the
 * gap between trigger and panel is `mouseOffsetX/Y`, so traversal time
 * follows from the same velocity figures. The SHOW delay is not. It is a
 * rest-intent threshold — "how long must the pointer sit still before we
 * believe the user meant to hover this?" — and the answer depends on
 * things only the consumer knows:
 *
 *   - trigger DENSITY. A row of adjacent hover targets needs a real delay,
 *     because a pointer crossing five of them on the way somewhere else
 *     would otherwise flash five tooltips. An isolated info icon needs
 *     none: there is nothing to pass through.
 *   - trigger SIZE. Crossing a 40px cell at the same 200 px/s that gives
 *     t ≈ 100ms across the panel gap takes t ≈ 200ms — so the delay that
 *     suppresses a pass-through is a function of the consumer's layout,
 *     not of this module's offsets.
 *   - whether the tooltip is the primary affordance or a progressive
 *     disclosure. A delay on the former reads as lag; on the latter it
 *     reads as restraint.
 *
 * Picking a number here would encode one consumer's layout as everyone's
 * default and would be a silent behaviour change for every 0.1.x caller.
 * So the default is 0 — show immediately, exactly as before — and the
 * consumer sets a value derived from ITS densest case. Values in the
 * 200-500ms band are typical for a dense grid; the same Müller velocity
 * figures let a consumer derive its own from cell width / pointer speed.
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
   * Veto predicate consulted at every show attempt — both the immediate path
   * and the deferred one. Returning true suppresses the show without touching
   * any timer state. Injected rather than called directly so the state machine
   * stays testable without a DOM.
   */
  blockShow?: () => boolean;
}

export interface HoverIntentApi {
  onTriggerEnter: () => void;
  onTriggerLeave: () => void;
  onPanelEnter: () => void;
  onPanelLeave: () => void;
  /**
   * Show immediately, skipping `showDelayMs`, but honouring every show GATE
   * (pointerdown suppression, `blockShow`, `shouldShow`).
   *
   * For show causes that are not a pointer resting on the trigger — keyboard
   * focus above all. The rest-delay exists to stop a pointer sweeping THROUGH
   * a dense row from flashing panels behind it; a focus event has no such
   * failure mode (focus lands on exactly one trigger deliberately), and
   * deferring it would just make the keyboard path feel broken.
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
   * Set by pointerdown, cleared only by leaving the trigger. This flag is
   * load-bearing, not belt-and-braces: without it a pointerdown that lands
   * BEFORE a pending `showDelayMs` elapses still lets the deferred show fire,
   * painting the tooltip on top of whatever the click just opened. Hiding
   * alone cannot prevent a show that has not happened yet.
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
      // Rest-delay: the panel appears only once the pointer has stayed on the
      // trigger for `delay`. A pointer passing THROUGH leaves first, which
      // cancels this timer, so it never flashes a panel.
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
