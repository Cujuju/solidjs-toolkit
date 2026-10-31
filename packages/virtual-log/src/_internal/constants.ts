export const DEFAULT_OLDER_THRESHOLD = 10;
export const DEFAULT_OVERSCAN = 4;
export const DEFAULT_RUNWAY_VIEWPORTS = 3;
/** Newer rows load when the newest loaded is within this many viewports below the view. */
export const NEWER_LOOKAHEAD_VIEWPORTS = 4;
/** Folding a held correction adds at most this much of the scroll's own step (content at most 2x the scroll). */
export const MAX_FOLD = 1;
/** An offset this close past an end is at the end (engines round; WebKit rests 1px past the bottom). */
export const END_SLOP_PX = 2;
export const MIN_ESTIMATE_SCALE = 0.5;
export const MAX_ESTIMATE_SCALE = 4;
/** Estimates are rescaled at rest only when the measured ratio moved by more than this. */
export const ESTIMATE_SCALE_STEP = 0.05;
/** A scroll event this close to a position we wrote, this soon after, is our own. */
export const OWN_WRITE_PX = 1;
export const OWN_WRITE_MS = 250;
/** Keys that scroll the scroller itself when it has focus. */
export const NAV_KEYS = new Set(['PageUp', 'PageDown', 'Home', 'End', ' ', 'ArrowUp', 'ArrowDown']);

export const defaultKey = (row: unknown): string => (row as { key: string }).key;
export const sameKeys = (a: string[], b: string[]): boolean => a.length === b.length && a.every((k, i) => k === b[i]);

