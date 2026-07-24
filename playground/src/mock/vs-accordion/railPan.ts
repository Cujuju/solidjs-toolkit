import { createEffect, createSignal, onCleanup, type Accessor } from 'solid-js';
import type { AccordionGroupApi } from './context';
import { blockNextClick, createCancelListeners } from './vendor/shared';

/**
 * MOCK — same status as the rest of this directory.
 *
 * Drag-to-pan for the rail, coexisting with drag-to-reorder.
 *
 * THE COLLISION, AND HOW IT IS RESOLVED
 *
 * `createReorderList` already owns the bare left-button drag on a rail button.
 * Reorder is available always; panning only means anything once the rail
 * overflows. The always-available gesture therefore keeps the unmodified drag,
 * and pan takes the modified ones. (Team-lead call, recorded here so the next
 * reader does not relitigate it from the code.)
 *
 * Three entry points, and each is unambiguous for a different reason:
 *
 *   1. MIDDLE-BUTTON drag, anywhere in the rail. Costs nothing to allow, because
 *      `createReorderList` returns early on `e.button !== 0` — it never sees a
 *      middle-button press, so there is no contention to arbitrate.
 *   2. SPACE-held + left drag, anywhere in the rail. This one genuinely collides,
 *      and is resolved in the capture phase — see `onPointerDownCapture`.
 *   3. Bare left drag on rail BACKGROUND (not on a button). No reorder gesture
 *      exists there — `itemProps` are attached per-button — so the unmodified
 *      drag is free.
 *
 * Everything about click and reorder suppression reuses the vendored primitive's
 * own helpers rather than reimplementing them, so the two gestures cannot drift
 * apart in feel.
 */

/** Secondary/middle pointer button, per the UI Events `button` enumeration. */
const MIDDLE_BUTTON = 1;
/** Primary button, matching `createReorderList`'s own `e.button !== 0` gate. */
const PRIMARY_BUTTON = 0;

/**
 * Movement before a press becomes a pan, in px.
 *
 * Mirrors `createReorderList`'s `activateDistance` default (5). It is duplicated
 * rather than imported because the vendored file exposes it only as an inline
 * `?? 5` default — but the VALUE must match, or the two gestures would have
 * different dead zones and a user would feel one as looser than the other on the
 * same strip of chrome. If the vendored default ever changes, this follows it.
 */
const PAN_ACTIVATE_DISTANCE_PX = 5;

export interface RailPanOptions {
  railEl: Accessor<HTMLElement | undefined>;
  /** The group, read only to know whether panning is meaningful right now. */
  group: AccordionGroupApi;
  /** Turn panning off entirely (e.g. under the `menu` overflow strategy, where
   *  the rail never scrolls). Defaults to on. */
  enabled?: Accessor<boolean>;
}

export interface RailPan {
  /** True while a pan is actually moving the rail. */
  panning: Accessor<boolean>;
  /** True while the space modifier is held and a pan would start on press —
   *  drives the `grab` cursor so the modifier is discoverable. */
  armed: Accessor<boolean>;
}

export function createRailPan(options: RailPanOptions): RailPan {
  const [panning, setPanning] = createSignal(false);
  const [spaceHeld, setSpaceHeld] = createSignal(false);
  const [pointerInside, setPointerInside] = createSignal(false);

  const enabled = (): boolean => options.enabled?.() ?? true;

  /** Panning is only meaningful when there is something to scroll. Used to gate
   *  the modifier as well as the gesture, so space stays inert on a rail that
   *  fits. */
  const scrollable = (): boolean => {
    const rail = options.railEl();
    return rail !== undefined && rail.scrollHeight > rail.clientHeight;
  };

  const armed = (): boolean => enabled() && spaceHeld() && pointerInside() && scrollable();

  // ── Space modifier ─────────────────────────────────────────────────────────

  /**
   * Space is the modifier AND the activation key for a focused button, which is a
   * real conflict rather than a theoretical one: a keyboard user on a rail button
   * presses Space to open the panel.
   *
   * It is resolved by narrowing when Space is claimed, not by choosing a winner.
   * Space arms a pan only when the POINTER is over the rail (so the user is in a
   * mouse gesture), the rail actually scrolls (so panning means something), and
   * focus is NOT inside the rail (so no button is waiting for that keypress).
   * Outside that intersection Space keeps every default it has — page scroll,
   * button activation — untouched.
   */
  const focusInsideRail = (): boolean => {
    const rail = options.railEl();
    const active = document.activeElement;
    return rail !== undefined && active !== null && rail.contains(active);
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key !== ' ' || e.repeat) return;
    if (!enabled() || !pointerInside() || !scrollable() || focusInsideRail()) return;
    setSpaceHeld(true);
    // Only now — inside the narrowed condition — is it safe to take Space away
    // from its default of scrolling the page.
    e.preventDefault();
  };

  const onKeyUp = (e: KeyboardEvent): void => {
    if (e.key !== ' ') return;
    setSpaceHeld(false);
  };

  // A window blur while Space is down would otherwise leave the modifier latched
  // on forever, because the keyup lands in whatever took focus.
  const onWindowBlur = (): void => {
    setSpaceHeld(false);
  };

  createEffect(() => {
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onWindowBlur);
    onCleanup(() => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onWindowBlur);
    });
  });

  // ── The pan gesture ────────────────────────────────────────────────────────

  let cleanupMove: (() => void) | null = null;

  const stop = (): void => {
    if (cleanupMove !== null) {
      cleanupMove();
      cleanupMove = null;
    }
    cancel.remove();
    setPanning(false);
  };

  // Esc / window blur / contextmenu abort a pan, using the SAME helper the
  // reorder primitive uses — one cancellation vocabulary for both gestures.
  const cancel = createCancelListeners({ onCancel: stop });

  const onPointerDownCapture = (e: PointerEvent): void => {
    const rail = options.railEl();
    if (rail === undefined || !enabled() || cleanupMove !== null) return;

    const onButton = (e.target as HTMLElement | null)?.closest?.(
      '[data-panel-id], [data-rail-overflow]',
    );
    const isMiddle = e.button === MIDDLE_BUTTON;
    const isPrimary = e.button === PRIMARY_BUTTON;
    const wantsPan =
      isMiddle || (isPrimary && (spaceHeld() ? scrollable() : onButton === null));
    if (!wantsPan) return;

    /**
     * CAPTURE-PHASE stopPropagation is what keeps a pan from becoming a reorder.
     *
     * The reorder primitive listens on the BUTTON, in the bubble phase. Capture
     * runs root→target, so stopping here means the event never reaches the
     * button's handler and no reorder is ever armed — as opposed to letting both
     * start and trying to cancel one afterwards, which is how a gesture ends up
     * committing a reorder it visibly abandoned. Note this is reached only when
     * `wantsPan` is true; an unmodified press on a button falls through
     * untouched, so reorder keeps its gesture exactly as before.
     */
    e.stopPropagation();
    // Suppresses middle-click autoscroll and text selection during the drag.
    e.preventDefault();

    const startY = e.clientY;
    const startScroll = rail.scrollTop;
    let activated = false;

    const onMove = (ev: PointerEvent): void => {
      const delta = ev.clientY - startY;
      if (!activated) {
        if (Math.abs(delta) < PAN_ACTIVATE_DISTANCE_PX) return;
        activated = true;
        setPanning(true);
        cancel.add();
      }
      // Content follows the finger: dragging down reveals what is above.
      rail.scrollTop = startScroll - delta;
    };

    const onUp = (): void => {
      // Only a pan that actually MOVED eats the click. A press that never passed
      // the dead zone is still a click on the button underneath, which is the
      // same rule `createReorderList` applies to an unactivated drag — and it is
      // why space-tapping a rail button still toggles its panel.
      if (activated) blockNextClick();
      stop();
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    cleanupMove = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
  };

  const onPointerEnter = (): void => {
    setPointerInside(true);
  };
  const onPointerLeave = (): void => {
    setPointerInside(false);
    setSpaceHeld(false);
  };

  createEffect(() => {
    const rail = options.railEl();
    if (rail === undefined) return;
    rail.addEventListener('pointerdown', onPointerDownCapture, { capture: true });
    rail.addEventListener('pointerenter', onPointerEnter);
    rail.addEventListener('pointerleave', onPointerLeave);
    onCleanup(() => {
      rail.removeEventListener('pointerdown', onPointerDownCapture, { capture: true });
      rail.removeEventListener('pointerenter', onPointerEnter);
      rail.removeEventListener('pointerleave', onPointerLeave);
      stop();
    });
  });

  /** Surface state as attributes so the cursor and the scrollbar treatment are
   *  pure CSS — see `rail.css`. Written imperatively because the rail element is
   *  the group's markup, not this module's. */
  createEffect(() => {
    const rail = options.railEl();
    if (rail === undefined) return;
    rail.setAttribute('data-pan-armed', armed() ? 'true' : 'false');
    rail.setAttribute('data-panning', panning() ? 'true' : 'false');
  });

  return { panning, armed };
}
