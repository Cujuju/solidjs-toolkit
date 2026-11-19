import type { Setter } from 'solid-js';
import { submenuCloseDelayMs } from '../submenuTiming.js';

/** Pointer coordinates may arrive rounded to whole CSS px; one px of slack either way keeps a true aim inside. */
const POINTER_ROUNDING_PX = 1;

/**
 * Where a pointer heading from its trigger exit point to the open flyout may travel: a trapezoid
 * between a vertical apex edge (the exit point plus rounding slack) and the flyout's near edge.
 */
export interface AimRegion {
  apexX: number;
  apexTop: number;
  apexBottom: number;
  baseX: number;
  baseTop: number;
  baseBottom: number;
  /** Unhurried travel time from the exit point to the base's farther corner. */
  graceMs: number;
}

interface FlyoutRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Aim region from a trigger exit point to the flyout's near edge, or null when the exit point
 *  sits within the flyout's horizontal span (an overlapping, clamped flyout has no corridor). */
export function aimRegion(exitX: number, exitY: number, flyout: FlyoutRect): AimRegion | null {
  let baseX: number;
  let towardFlyout: number;
  if (exitX < flyout.left) {
    baseX = flyout.left;
    towardFlyout = 1;
  } else if (exitX > flyout.right) {
    baseX = flyout.right;
    towardFlyout = -1;
  } else {
    return null;
  }
  const farCornerPx = Math.max(
    Math.hypot(baseX - exitX, flyout.top - exitY),
    Math.hypot(baseX - exitX, flyout.bottom - exitY),
  );
  return {
    apexX: exitX - towardFlyout * POINTER_ROUNDING_PX,
    apexTop: exitY - POINTER_ROUNDING_PX,
    apexBottom: exitY + POINTER_ROUNDING_PX,
    baseX,
    baseTop: flyout.top,
    baseBottom: flyout.bottom,
    graceMs: submenuCloseDelayMs(farCornerPx),
  };
}

/** True when (x, y) lies inside the region, edges included. Arithmetic only: no DOM, no allocation. */
export function isInAimRegion(r: AimRegion, x: number, y: number): boolean {
  // apexX sits at least POINTER_ROUNDING_PX from baseX, so the span is never zero.
  const t = (x - r.apexX) / (r.baseX - r.apexX);
  if (t < 0 || t > 1) return false;
  return y >= r.apexTop + t * (r.baseTop - r.apexTop)
    && y <= r.apexBottom + t * (r.baseBottom - r.apexBottom);
}

/**
 * Per-menu-level hover arbitration. While one submenu holds the aim, a hover on a sibling trigger
 * is deferred; releasing with hand-off opens that sibling (or closes the holder when none waits).
 */
export interface AimLock {
  /** A hover asks to open `key`; deferred while another submenu holds the aim. */
  request(key: symbol): void;
  /** The pointer left `key`'s trigger before its deferred open ran. */
  withdraw(key: symbol): void;
  hold(key: symbol): void;
  /** `handOff`: the pointer settled elsewhere, so the holder yields to the waiting sibling or closes. */
  release(key: symbol, handOff: boolean): void;
}

export function createAimLock(setActive: Setter<symbol | undefined>): AimLock {
  let holder: symbol | undefined;
  let pending: symbol | undefined;
  return {
    request(key) {
      if (holder !== undefined && holder !== key) pending = key;
      else setActive(key);
    },
    withdraw(key) {
      if (pending === key) pending = undefined;
    },
    hold(key) {
      holder = key;
      pending = undefined;
    },
    release(key, handOff) {
      if (holder !== key) return;
      const next = pending;
      holder = undefined;
      pending = undefined;
      if (handOff) setActive((active) => (active === key ? next : active));
    },
  };
}
