/**
 * DTE math + expiration formatting — pure, no DOM, no ambient clock. Everything takes `now` as
 * an argument: a function reaching for `Date.now()` can only be tested by mocking the clock.
 */

/** Milliseconds in a UTC day. Exact — UTC has no DST, which is why the math below normalises
 *  both ends of the subtraction to UTC midnight before dividing. */
const MS_PER_UTC_DAY = 86_400_000;

/** Fixed month abbreviations, deliberately NOT `Intl`: its output varies with the host's ICU
 *  build and locale, which would make the pill and its tests non-deterministic. Callers
 *  override `formatDate`. */
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
 * Parse the leading `YYYY-MM-DD`. NOT via `new Date(str)`: that reads a bare date as UTC
 * midnight but a datetime as LOCAL, so one calendar day parses two ways.
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
 * Days to expiration: a CALENDAR-DAY difference, not elapsed time. A naive division drifts
 * with the hour and lands a day off across DST, so both ends collapse to UTC midnight.
 */
export function daysToExpiration(iso: string, now: Date): number | null {
  const d = parseIsoDate(iso);
  if (!d) return null;
  const expiryUtc = Date.UTC(d.year, d.month - 1, d.day);
  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  // An Invalid Date clock has no honest DTE either.
  if (Number.isNaN(todayUtc)) return null;
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

/** `34d`. A null or non-finite DTE (unparseable date, or a caller's NaN) has no honest rendering, so it gets an em dash. */
export function formatDte(dte: number | null): string {
  if (dte === null || !Number.isFinite(dte)) return '—';
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
 * The default bands, in days: today (0), this week (7), this monthly cycle (30), and one
 * unbounded band beyond, where urgency stops being a useful signal.
 */
export const DTE_EXPIRING_MAX_DAYS = 0;
export const DTE_URGENT_MAX_DAYS = 7;
export const DTE_NEAR_MAX_DAYS = 30;

/**
 * Default ramp. The colours are custom properties, not literals: the package ships no opinion
 * about a consumer's palette. The terminal band is unbounded so the ramp is TOTAL.
 */
export const DEFAULT_DTE_RAMP: readonly DteColorStop[] = [
  { maxDte: DTE_EXPIRING_MAX_DAYS, color: 'var(--pdp-dte-expiring)' },
  { maxDte: DTE_URGENT_MAX_DAYS, color: 'var(--pdp-dte-urgent)' },
  { maxDte: DTE_NEAR_MAX_DAYS, color: 'var(--pdp-dte-near)' },
  { maxDte: Number.POSITIVE_INFINITY, color: 'var(--pdp-dte-far)' },
];

/**
 * First band whose bound the DTE fits under. Stops are consulted IN ORDER, so an unsorted ramp
 * degrades to the caller's priority; one with no catch-all still resolves.
 */
export function resolveDteColor(
  dte: number | null,
  ramp: readonly DteColorStop[] = DEFAULT_DTE_RAMP,
): string | undefined {
  // Non-finite fails every `<=` below and would fall through to the far band.
  if (dte === null || !Number.isFinite(dte) || ramp.length === 0) return undefined;
  for (const stop of ramp) {
    if (dte <= stop.maxDte) return stop.color;
  }
  return ramp[ramp.length - 1].color;
}
