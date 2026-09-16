import { createEffect, createSignal, onCleanup, type Accessor } from 'solid-js';
import type { AccordionGroupApi } from './context';
import { RAIL_CONTROL_SELECTOR } from './railOverflow';
import { blockNextClick, createCancelListeners } from './gesture';

/**
 * Drag-to-pan for the rail, coexisting with drag-to-reorder. Reorder keeps the unmodified
 * drag; pan takes the modified ones. See DESIGN_NOTES.md § src/railPan.ts:6.
 */

/** Secondary/middle pointer button, per the UI Events `button` enumeration. */
const MIDDLE_BUTTON = 1;
/** Primary button, matching `createReorderList`'s own `e.button !== 0` gate. */
const PRIMARY_BUTTON = 0;

/**
 * Movement before a press becomes a pan, in px. Mirrors `createReorderList`'s `activateDistance`
 * default (5); duplicated because it is only an inline `?? 5` there, but the value must match.
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
   * Space both arms a pan and activates a focused rail button; it arms a pan only when the
   * pointer is over a scrollable rail. See DESIGN_NOTES.md § src/railPan.ts:85.
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

    // The selector is IMPORTED, never retyped: spelling these attribute names as literals
        // would produce no error, just `null` for every press and every rail-button drag read as a pan.
    const onButton = (e.target as HTMLElement | null)?.closest?.(RAIL_CONTROL_SELECTOR);
    const isMiddle = e.button === MIDDLE_BUTTON;
    const isPrimary = e.button === PRIMARY_BUTTON;
    const wantsPan =
      isMiddle || (isPrimary && (spaceHeld() ? scrollable() : onButton === null));
    if (!wantsPan) return;

    /**
         * CAPTURE-PHASE stopPropagation is what keeps a pan from becoming a reorder: the reorder
         * primitive listens on the button in the bubble phase, so stopping here means it never arms.
         */
    e.stopPropagation();
    // Suppresses middle-click autoscroll and text selection during the drag.
    e.preventDefault();

    const startY = e.clientY;
    // A second touch neither moves nor ends this pan. Mouse buttons share one id, but
    // a chorded button change fires `pointermove`, not `pointerup`.
    const pointerId = e.pointerId;
    const startScroll = rail.scrollTop;
    let activated = false;

    const onMove = (ev: PointerEvent): void => {
      if (ev.pointerId !== pointerId) return;
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

    const onUp = (ev: PointerEvent): void => {
      if (ev.pointerId !== pointerId) return;
      // Only a pan that actually MOVED eats the click. A press inside the dead zone is still
            // a click on the button underneath, so space-tapping still toggles its panel.
      if (activated) blockNextClick();
      stop();
    };

    /** Touch scrolling can claim the gesture: the UA fires `pointercancel` and no `pointerup`, which would strand the listeners, the guard and `panning()`. */
    const onCancelled = (ev: PointerEvent): void => {
      if (ev.pointerId !== pointerId) return;
      stop();
    };

    // At PRESS time: Esc / blur / contextmenu inside the dead zone must also release the in-flight guard.
    cancel.add();

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onCancelled);
    cleanupMove = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onCancelled);
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
