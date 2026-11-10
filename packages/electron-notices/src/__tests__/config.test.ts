import { expect, it, vi } from 'vitest';
import { DEFAULT_NOTICE_CONFIG, normalizeNoticeConfig, isSticky, noticeDuration, BASIC_TONES } from '../types.js';
it('normalizes fields independently with caller defaults', () => {
  expect(normalizeNoticeConfig(null)).toEqual(DEFAULT_NOTICE_CONFIG);
  const fallback = { ...DEFAULT_NOTICE_CONFIG, delivery: 'system' as const, dripLip: true };
  expect(normalizeNoticeConfig({ delivery: 'bad', style: 'console', dripLip: 1, consoleLines: NaN }, fallback)).toEqual({ ...fallback, style: 'console' });
  expect(normalizeNoticeConfig({ consoleLines: 1 }).consoleLines).toBe(2);
  expect(normalizeNoticeConfig({ consoleLines: 9 }).consoleLines).toBe(8);
  expect(normalizeNoticeConfig({ consoleLines: 3.6 }).consoleLines).toBe(4);
});
it('normalizes placement, tray count and duration', () => {
  expect(normalizeNoticeConfig({ position: 'top-center', trayVisible: 2.7, durationMs: 0 })).toMatchObject({ position: 'top-center', trayVisible: 3, durationMs: 0 });
  expect(normalizeNoticeConfig({ position: 'bad', trayVisible: Infinity, durationMs: -1 })).toEqual(DEFAULT_NOTICE_CONFIG);
  expect(normalizeNoticeConfig({ trayVisible: -1 }).trayVisible).toBe(1);
  expect(normalizeNoticeConfig({ trayVisible: 99 }).trayVisible).toBe(8);
  expect(normalizeNoticeConfig({ maxKept: 20, trayVisible: 99 })).toMatchObject({ maxKept: 20, trayVisible: 20 });
  expect(normalizeNoticeConfig({ maxKept: 999 }).maxKept).toBe(50);
  expect(normalizeNoticeConfig({ maxKept: 2 })).toMatchObject({ maxKept: 2, trayVisible: 2 });
});
it('resolves durations by notice, tone, then config; invalid values stay sticky', () => {
  const v = { config: DEFAULT_NOTICE_CONFIG, appearance: { vars: {} }, tones: BASIC_TONES };
  const n = { title: 't', tone: 'error' };
  expect(noticeDuration(n, v)).toBe(0);
  expect(noticeDuration({ ...n, durationMs: 20 }, v)).toBe(20);
  expect(noticeDuration({ ...n, tone: 'custom' }, v)).toBe(6000);
  expect(noticeDuration({ ...n, pinned: true, durationMs: 20 }, v)).toBe(0);
  expect(isSticky(n, v)).toBe(true);
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  for (const durationMs of [-1, NaN, Infinity, -1]) expect(noticeDuration({ ...n, durationMs }, v)).toBe(0);
  expect(noticeDuration({ ...n, durationMs: -1 }, v)).toBe(0);
  expect(warn).toHaveBeenCalledTimes(3); warn.mockRestore();
});
