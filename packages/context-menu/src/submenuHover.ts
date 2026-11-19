import { aimRegion, isInAimRegion, type AimLock, type AimRegion } from './_internal/submenuAim.js';

export interface SubmenuHoverOptions {
  key: symbol;
  lock: AimLock;
  isOpen: () => boolean;
  trigger: () => HTMLElement | undefined;
  flyout: () => HTMLElement | undefined;
  close: () => void;
}

export interface SubmenuHover {
  /** Watch the parent menu while the flyout is open. */
  attach(parent: HTMLElement | null): void;
  /** Stop watching and drop any aim, without handing off. */
  detach(): void;
  onTriggerPointerMove(e: PointerEvent): void;
  onTriggerPointerLeave(e: PointerEvent): void;
  /** The pointer reached the trigger or flyout, or the keyboard took over: keep the flyout open. */
  endAim(): void;
}

function within(el: HTMLElement | undefined, target: EventTarget | null): boolean {
  return !!el && target instanceof Node && el.contains(target);
}

/**
 * Hover close for one submenu. Leaving the trigger toward the flyout keeps it open; any move
 * outside that aim region, or a stop inside it past the region's travel time, closes it.
 * A hover elsewhere in the parent with no aim in progress closes it at once.
 */
export function createSubmenuHover(opts: SubmenuHoverOptions): SubmenuHover {
  let parentEl: HTMLElement | null = null;
  let region: AimRegion | undefined;
  let graceTimer: ReturnType<typeof setTimeout> | undefined;
  // Last pointer position inside the trigger. `pointerleave` carries the landing point, not the
  // exit point, so the aim starts here and the landing point is judged against it.
  let insideX = 0;
  let insideY = 0;
  let hasInside = false;

  function finishAim(handOff: boolean) {
    if (!region) return;
    region = undefined;
    clearTimeout(graceTimer);
    graceTimer = undefined;
    document.removeEventListener('pointermove', onAimMove, { capture: true });
    opts.lock.release(opts.key, handOff);
  }

  // Runs per pointer move only while aiming; layout was read once, at the trigger exit.
  function onAimMove(e: PointerEvent) {
    if (region && isInAimRegion(region, e.clientX, e.clientY)) return;
    const arrived = within(opts.trigger(), e.target) || within(opts.flyout(), e.target);
    finishAim(!arrived);
  }

  function onTriggerPointerMove(e: PointerEvent) {
    // Solid delegation carries moves from the Portal'd flyout up to the trigger; keep trigger points only.
    if (!within(opts.trigger(), e.target)) return;
    insideX = e.clientX;
    insideY = e.clientY;
    hasInside = true;
  }

  function onTriggerPointerLeave(e: PointerEvent) {
    const fromInside = hasInside;
    hasInside = false;
    // Touch has no hover path to protect.
    if (e.pointerType === 'touch') return;
    if (!opts.isOpen()) {
      opts.lock.withdraw(opts.key);
      return;
    }
    const flyout = opts.flyout();
    if (within(flyout, e.relatedTarget)) return;
    // A flyout not yet shown has no rect, so the pointer cannot be heading for it.
    const next = flyout?.matches(':popover-open')
      ? aimRegion(fromInside ? insideX : e.clientX, fromInside ? insideY : e.clientY, flyout.getBoundingClientRect())
      : null;
    // A single move can land already off course: judge the landing point now, not on the next move.
    if (!next || !isInAimRegion(next, e.clientX, e.clientY)) {
      opts.close();
      return;
    }
    finishAim(false);
    region = next;
    opts.lock.hold(opts.key);
    // Capture: a custom row that stops pointermove propagation must not hide a move from the aim.
    document.addEventListener('pointermove', onAimMove, { capture: true, passive: true });
    graceTimer = setTimeout(() => finishAim(true), next.graceMs);
  }

  function onParentPointerOver(e: PointerEvent) {
    if (region || within(opts.trigger(), e.target)) return;
    opts.close();
  }

  // The flyout is placed once from the trigger rect; a scrolled parent would leave it detached.
  function onParentScroll() {
    opts.close();
  }

  function detach() {
    parentEl?.removeEventListener('pointerover', onParentPointerOver);
    parentEl?.removeEventListener('scroll', onParentScroll, true);
    parentEl = null;
    finishAim(false);
  }

  return {
    attach(parent) {
      detach();
      parentEl = parent;
      parentEl?.addEventListener('pointerover', onParentPointerOver);
      // Capture: scroll doesn't bubble, and GlassMenu scrolls a body child, not the root.
      parentEl?.addEventListener('scroll', onParentScroll, true);
    },
    detach,
    onTriggerPointerMove,
    onTriggerPointerLeave,
    endAim: () => finishAim(false),
  };
}
