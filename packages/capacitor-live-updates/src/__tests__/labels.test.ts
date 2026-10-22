import { describe, expect, it } from 'vitest';
import { bundleLabelRev, parseNativeVersion } from '../labels';

describe('bundleLabelRev', () => {
  it('reads the rev a bundle is labelled with', () => {
    expect(bundleLabelRev('3.0.0-r612')).toBe(612);
    expect(bundleLabelRev('1.2.3-beta-r7')).toBe(7);
  });

  it('is null for labels without a trailing rev', () => {
    expect(bundleLabelRev('3.0.0')).toBeNull();
    expect(bundleLabelRev('3.0.0-r612-1a2b3c4d5e6f')).toBeNull();
    expect(bundleLabelRev('3.0.0-r')).toBeNull();
    expect(bundleLabelRev('builtin')).toBeNull();
  });
});

describe('parseNativeVersion', () => {
  it('reads rev and fingerprint', () => {
    expect(parseNativeVersion('3.0.0-r612-1a2b3c4d5e6f')).toEqual({ rev: 612, fingerprint: '1a2b3c4d5e6f' });
  });

  it('is null for a native app built without live updates', () => {
    expect(parseNativeVersion('3.0.0')).toBeNull();
    expect(parseNativeVersion('3.0.0-r612')).toBeNull();
    expect(parseNativeVersion('3.0.0-r612-1A2B3C4D5E6F')).toBeNull();
    expect(parseNativeVersion('3.0.0-r612-1a2b3c4d5e')).toBeNull();
  });
});
