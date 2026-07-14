/**
 * DTE math + formatting — the part with a right and a wrong answer.
 *
 * Every case pins `now` explicitly. That is the contract the `now` prop exists to serve: if
 * these needed a mocked clock, the component would too, and a control whose central number
 * can only be tested against a fake is a control whose central number is untested.
 */

import { describe, it, expect } from 'vitest';
import {
  parseIsoDate,
  daysToExpiration,
  formatMonthDay,
  formatLongDate,
  formatDte,
  resolveDteColor,
  DEFAULT_DTE_RAMP,
  DTE_URGENT_MAX_DAYS,
  DTE_NEAR_MAX_DAYS,
} from '../_internal/dte';

describe('parseIsoDate', () => {
  it('reads Y/M/D off a bare ISO date', () => {
    expect(parseIsoDate('2026-07-17')).toEqual({ year: 2026, month: 7, day: 17 });
  });

  it('accepts an ISO datetime and ignores everything after the date', () => {
    expect(parseIsoDate('2026-07-17T21:00:00Z')).toEqual({ year: 2026, month: 7, day: 17 });
  });

  it('rejects a well-formed but impossible date instead of rolling it forward', () => {
    // `new Date('2026-02-31')` would silently become March 3rd. A picker that renders
    // "Mar 3" for an entry the caller wrote as "2026-02-31" is lying about their data.
    expect(parseIsoDate('2026-02-31')).toBeNull();
    expect(parseIsoDate('2026-13-01')).toBeNull();
  });

  it('returns null on garbage rather than throwing', () => {
    expect(parseIsoDate('')).toBeNull();
    expect(parseIsoDate('next friday')).toBeNull();
    expect(parseIsoDate('17/07/2026')).toBeNull();
  });

  it('accepts a leap day in a leap year and rejects it in a common year', () => {
    expect(parseIsoDate('2028-02-29')).toEqual({ year: 2028, month: 2, day: 29 });
    expect(parseIsoDate('2027-02-29')).toBeNull();
  });
});

describe('daysToExpiration', () => {
  it('counts calendar days', () => {
    expect(daysToExpiration('2026-07-17', new Date(2026, 5, 13))).toBe(34); // Jun 13 -> Jul 17
  });

  it('is 0 on the expiration date itself', () => {
    expect(daysToExpiration('2026-07-17', new Date(2026, 6, 17))).toBe(0);
  });

  it('is 1 the day before', () => {
    expect(daysToExpiration('2026-07-17', new Date(2026, 6, 16))).toBe(1);
  });

  it('does NOT drift with the time of day — the whole reason this is not a ms division', () => {
    // (expiry - now) / 86_400_000 gives 34.6 at 09:00 and 33.0 at 23:59, so a naive floor
    // silently drops a day as the session wears on. DTE is a property of the DATE.
    const morning = new Date(2026, 5, 13, 9, 0, 0);
    const lateNight = new Date(2026, 5, 13, 23, 59, 59);
    expect(daysToExpiration('2026-07-17', morning)).toBe(34);
    expect(daysToExpiration('2026-07-17', lateNight)).toBe(34);
  });

  it('survives a DST boundary — the days between are not all 24h long', () => {
    // US DST springs forward 2026-03-08. A local-date subtraction makes that a 23-hour day,
    // so a naive floor over any window containing it lands one day short.
    // 2026-03-01 -> 2026-03-15 is 14 calendar days regardless.
    expect(daysToExpiration('2026-03-15', new Date(2026, 2, 1))).toBe(14);
    // And the fall-back boundary (2026-11-01), where a day is 25 hours long.
    expect(daysToExpiration('2026-11-15', new Date(2026, 9, 25))).toBe(21);
  });

  it('crosses a year boundary', () => {
    expect(daysToExpiration('2027-01-15', new Date(2026, 11, 31))).toBe(15);
  });

  it('returns a NEGATIVE dte for a past date rather than clamping it', () => {
    // The caller owns which dates are legitimate. Clamping an already-expired entry to 0
    // would hide their bug behind our formatting.
    expect(daysToExpiration('2026-07-10', new Date(2026, 6, 17))).toBe(-7);
  });

  it('returns null for an unparseable date', () => {
    expect(daysToExpiration('whenever', new Date(2026, 6, 17))).toBeNull();
  });
});

describe('formatting', () => {
  it('formats the collapsed label as month + day', () => {
    expect(formatMonthDay('2026-07-17')).toBe('Jul 17');
    expect(formatMonthDay('2026-01-02')).toBe('Jan 2');
    expect(formatMonthDay('2026-12-31')).toBe('Dec 31');
  });

  it('formats the long date with the year (a LEAPS ladder is otherwise ambiguous)', () => {
    expect(formatLongDate('2027-01-15')).toBe('Jan 15, 2027');
  });

  it('falls back to the raw string when the date does not parse — visible, not blank', () => {
    expect(formatMonthDay('not-a-date')).toBe('not-a-date');
    expect(formatLongDate('not-a-date')).toBe('not-a-date');
  });

  it('formats DTE with a trailing d, and an em dash when there is no honest number', () => {
    expect(formatDte(34)).toBe('34d');
    expect(formatDte(0)).toBe('0d');
    expect(formatDte(-3)).toBe('-3d');
    expect(formatDte(null)).toBe('—');
  });
});

describe('resolveDteColor', () => {
  const [expiring, urgent, near, far] = DEFAULT_DTE_RAMP;

  it('picks the band the DTE falls in, on the default ramp', () => {
    expect(resolveDteColor(0)).toBe(expiring.color);
    expect(resolveDteColor(1)).toBe(urgent.color);
    expect(resolveDteColor(DTE_URGENT_MAX_DAYS)).toBe(urgent.color);
    expect(resolveDteColor(DTE_URGENT_MAX_DAYS + 1)).toBe(near.color);
    expect(resolveDteColor(DTE_NEAR_MAX_DAYS)).toBe(near.color);
    expect(resolveDteColor(DTE_NEAR_MAX_DAYS + 1)).toBe(far.color);
    expect(resolveDteColor(900)).toBe(far.color);
  });

  it('treats bounds as INCLUSIVE upper edges', () => {
    expect(resolveDteColor(7)).toBe(urgent.color);
    expect(resolveDteColor(30)).toBe(near.color);
  });

  it('puts an already-expired (negative) DTE in the first band', () => {
    expect(resolveDteColor(-2)).toBe(expiring.color);
  });

  it('honours a caller-supplied ramp — the thresholds are a house opinion, not a constant', () => {
    const ramp = [
      { maxDte: 2, color: 'red' },
      { maxDte: 45, color: 'blue' },
      { maxDte: Number.POSITIVE_INFINITY, color: 'grey' },
    ];
    expect(resolveDteColor(1, ramp)).toBe('red');
    expect(resolveDteColor(30, ramp)).toBe('blue');
    expect(resolveDteColor(400, ramp)).toBe('grey');
  });

  it('still resolves when the caller forgets a catch-all band', () => {
    // Belt to the Infinity suspenders: `undefined` must never leak into a style attribute.
    const truncated = [{ maxDte: 7, color: 'red' }, { maxDte: 30, color: 'blue' }];
    expect(resolveDteColor(500, truncated)).toBe('blue');
  });

  it('has no colour for a DTE that does not exist, or for an empty ramp', () => {
    expect(resolveDteColor(null)).toBeUndefined();
    expect(resolveDteColor(10, [])).toBeUndefined();
  });
});
