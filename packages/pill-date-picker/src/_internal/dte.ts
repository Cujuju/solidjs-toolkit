/**
 * DTE math + expiration formatting — pure, no DOM, no ambient clock.
 *
 * Everything here takes `now` as an argument. That is the whole point: DTE is the one
 * number in this control with a right and a wrong answer, and a function that reaches for
 * `Date.now()` internally can only be tested by mocking the clock — which tests the mock.
 *
 * Kept out of the component for the same reason `popout.ts` is: it is the part that can be
 * proven without mounting anything.
 */

/** Milliseconds in a UTC day. Exact — UTC has no DST, which is why the math below normalises
 *  both ends of the subtraction to UTC midnight before dividing. */
const MS_PER_UTC_DAY = 86_400_000;

/** Fixed month abbreviations, deliberately NOT `Intl` / `toLocaleDateString`.
 *
 *  Intl's output varies with the host's ICU build and locale ('Jul 17' vs '17 Jul' vs
 *  'juil. 17'), which would make both the rendered pill and its tests non-deterministic
 *  across machines. An expiration label is a fixed market convention, not prose, so a
 *  fixed table is the correct trade — and a consumer who genuinely needs localised dates
 *  overrides `formatDate` on the component. */
const MONTH_ABBREVIATIONS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

/** A calendar date with no time and no zone — the only shape an expiration actually has. */
export interface CalendarDate {
  year: number;
  /** 1-12. NOT the JS 0-11 month; this struct is a date, not a Date. */
  month: number;
  day: number;
}

/**
 * Parse the leading `YYYY-MM-DD` of an ISO date (or ISO datetime) string.
 *
 * Deliberately does NOT go through `new Date(str)`: that constructor treats a bare
 * '2026-07-17' as UTC midnight but '2026-07-17T00:00:00' as LOCAL midnight, so the same
 * calendar day parses to two different instants depending on a suffix the caller may or
 * may not have included. Reading the fields off the string sidesteps the whole trap.
 *
 * Returns null on anything unparseable — the component then renders the raw string rather
 * than throwing, because a caller's bad date must not take the panel down with it.
 */
export function parseIsoDate(iso: string): CalendarDate | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/.exec(iso);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  // Round-trip through UTC to reject the impossible-but-well-formed ('2026-02-31',
  // which Date would silently roll forward to March 3rd).
  const asUtc = new Date(Date.UTC(year, month - 1, day));
  if (
    asUtc.getUTCFullYear() !== year ||
    asUtc.getUTCMonth() !== month - 1 ||
    asUtc.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

/**
 * Days to expiration: a CALENDAR-DAY difference, not an elapsed-time division.
 *
 * `(expiry - now) / MS_PER_DAY` is the obvious implementation and it is wrong twice over:
 *   1. It drifts with the time of day. At 09:00 the same expiration reads 34 days; at 23:00
 *      it reads 33. DTE is a property of the DATE, not of the hour you asked.
 *   2. Doing the arithmetic on LOCAL dates makes a DST boundary a 23- or 25-hour day, so
 *      the floor lands one day off for anyone whose window spans the changeover.
 *
 * So both ends are collapsed to UTC midnight first — `now` via its LOCAL calendar fields
 * (a trader at 20:00 ET on the 16th is on the 16th, and tomorrow's expiry is 1 DTE, not 0),
 * the expiration via its parsed Y/M/D. Both are then exact multiples of a UTC day and the
 * subtraction is exact.
 *
 * Returns null for an unparseable date. Negative values are returned as-is: the caller owns
 * which dates are legitimate, and silently clamping an already-expired one to 0 would hide
 * their bug rather than surface it.
 */
export function daysToExpiration(iso: string, now: Date): number | null {
  const d = parseIsoDate(iso);
  if (!d) return null;
  const expiryUtc = Date.UTC(d.year, d.month - 1, d.day);
  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return (expiryUtc - todayUtc) / MS_PER_UTC_DAY;
}

/** `Jul 17` — the collapsed pill's whole content. Falls back to the raw string when the
 *  date does not parse, so a malformed entry is visible rather than blank. */
export function formatMonthDay(iso: string): string {
  const d = parseIsoDate(iso);
  if (!d) return iso;
  return `${MONTH_ABBREVIATIONS[d.month - 1]} ${d.day}`;
}

/** `Jul 17, 2026` — the long form, for the tooltip, where the year is worth the pixels
 *  (a LEAPS ladder is otherwise ambiguous: 'Jan 16' of WHICH year?). */
export function formatLongDate(iso: string): string {
  const d = parseIsoDate(iso);
  if (!d) return iso;
  return `${MONTH_ABBREVIATIONS[d.month - 1]} ${d.day}, ${d.year}`;
}

/** `34d`. Null DTE (unparseable date) has no honest rendering, so it gets an em dash. */
export function formatDte(dte: number | null): string {
  if (dte === null) return '—';
  return `${dte}d`;
}

// ── DTE urgency colour ──────────────────────────────────────────────────────

/** One band of the urgency ramp: "DTE at or below `maxDte` days paints `color`". */
export interface DteColorStop {
  /** Inclusive upper bound of the band, in days. */
  maxDte: number;
  /** Any CSS colour — a literal, or (as in the default ramp) a `var(--…)` reference. */
  color: string;
}

/**
 * The default bands, in days.
 *
 * These are calendar boundaries, not tuning knobs: an option expiring TODAY (0) is a
 * different animal from one expiring this week (a weekly cycle, 7), which is different from
 * one inside the current monthly cycle (30). Past a month out, urgency stops being a useful
 * signal, so everything beyond is one band.
 *
 * A consumer whose ramp disagrees passes their own `dteRamp` — the thresholds are a PROP,
 * not a constant, precisely because "urgent" is a house opinion.
 */
export const DTE_EXPIRING_MAX_DAYS = 0;
export const DTE_URGENT_MAX_DAYS = 7;
export const DTE_NEAR_MAX_DAYS = 30;

/**
 * Default ramp. The colours are CSS custom properties, NOT literals: the package must not
 * ship an opinion about a consuming app's palette, and a token indirects the choice back to
 * the consumer's stylesheet where the rest of their theme already lives. `styles.css`
 * defines neutral fallbacks so the control is legible out of the box.
 *
 * The terminal band is unbounded (`Infinity`) so the ramp is TOTAL — every DTE resolves to
 * a colour, and `resolveDteColor` never has to invent one.
 */
export const DEFAULT_DTE_RAMP: readonly DteColorStop[] = [
  { maxDte: DTE_EXPIRING_MAX_DAYS, color: 'var(--pdp-dte-expiring)' },
  { maxDte: DTE_URGENT_MAX_DAYS, color: 'var(--pdp-dte-urgent)' },
  { maxDte: DTE_NEAR_MAX_DAYS, color: 'var(--pdp-dte-near)' },
  { maxDte: Number.POSITIVE_INFINITY, color: 'var(--pdp-dte-far)' },
];

/**
 * First band whose bound the DTE fits under.
 *
 * Stops are consulted IN ORDER and the first match wins, so an unsorted or overlapping ramp
 * degrades to "the caller's order is the priority" rather than to nonsense.
 *
 * A ramp with no terminal catch-all still resolves — the last stop's colour is used — which
 * is the belt to the `Infinity` suspenders: a consumer who forgets the catch-all gets the
 * far-dated colour, never `undefined` leaking into a style attribute.
 */
export function resolveDteColor(
  dte: number | null,
  ramp: readonly DteColorStop[] = DEFAULT_DTE_RAMP,
): string | undefined {
  if (dte === null || ramp.length === 0) return undefined;
  for (const stop of ramp) {
    if (dte <= stop.maxDte) return stop.color;
  }
  return ramp[ramp.length - 1].color;
}
