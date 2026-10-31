/** Typical unhurried pointer speed: top of the 60-200 px/s unhurried band (kv-tooltip `hoverIntent.ts`, citing Müller et al. 2017). */
const UNHURRIED_POINTER_PX_PER_S = 200;
const MS_PER_S = 1000;

/** Close grace after a hover elsewhere in the parent: diagonal path (the parent's measured width) ÷ pointer speed.
 *  Residual: slower pointers still lose it mid-path. */
export function submenuCloseDelayMs(parentWidthPx: number): number {
  return (parentWidthPx / UNHURRIED_POINTER_PX_PER_S) * MS_PER_S;
}

