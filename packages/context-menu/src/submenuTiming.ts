/** Typical unhurried pointer speed: top of the 60-200 px/s unhurried band (kv-tooltip `hoverIntent.ts`, citing Müller et al. 2017). */
const UNHURRIED_POINTER_PX_PER_S = 200;
const MS_PER_S = 1000;

/** Time an unhurried pointer takes to travel `pathPx`: the aim grace from trigger exit to flyout.
 *  Residual: slower pointers that pause mid-path lose it. */
export function submenuCloseDelayMs(pathPx: number): number {
  return (pathPx / UNHURRIED_POINTER_PX_PER_S) * MS_PER_S;
}
