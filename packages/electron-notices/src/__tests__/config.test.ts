import { expect, it } from 'vitest';
import { DEFAULT_NOTICE_CONFIG, normalizeNoticeConfig, isSticky } from '../types';
it('normalizes fields independently with caller defaults', () => {
  expect(normalizeNoticeConfig(null)).toEqual(DEFAULT_NOTICE_CONFIG);
  const fallback = { ...DEFAULT_NOTICE_CONFIG, delivery: 'system' as const, dripLip: true };
  expect(normalizeNoticeConfig({ delivery: 'bad', style: 'console', dripLip: 1, consoleLines: NaN }, fallback)).toEqual({ ...fallback, style: 'console' });
  expect(normalizeNoticeConfig({ consoleLines: 1 }).consoleLines).toBe(2);
  expect(normalizeNoticeConfig({ consoleLines: 9 }).consoleLines).toBe(8);
  expect(normalizeNoticeConfig({ consoleLines: 3.6 }).consoleLines).toBe(4);
});
it('lets sticky override the error default', () => {
  expect(isSticky({ title: 't', tone: 'error' })).toBe(true);
  expect(isSticky({ title: 't', tone: 'error', sticky: false })).toBe(false);
  expect(isSticky({ title: 't', tone: 'info', sticky: true })).toBe(true);
});
