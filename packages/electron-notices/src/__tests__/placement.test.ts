import { describe, expect, it } from 'vitest';
import { overlayBounds, resolvePlacement, type DisplayArea } from '../placement';

const SCREEN = { x: 0, y: 0, width: 1920, height: 1080 };
const TASKBAR = 48;
const size = { width: 300, height: 100 };
const display = (workArea: DisplayArea['workArea']): DisplayArea => ({ bounds: SCREEN, workArea });

describe('overlayBounds', () => {
  it('puts tray styles above a bottom taskbar, at the right', () => {
    expect(overlayBounds('bottom-right', size, display({ x: 0, y: 0, width: 1920, height: 1080 - TASKBAR }))).toEqual({ x: 1620, y: 932, width: 300, height: 100 });
  });

  it('puts tray styles below a top bar (macOS menu bar)', () => {
    expect(overlayBounds('top-right', size, display({ x: 0, y: 25, width: 1920, height: 1055 }))).toEqual({ x: 1620, y: 25, width: 300, height: 100 });
  });

  it('puts tray styles beside a left taskbar, at the bottom', () => {
    expect(overlayBounds('bottom-left', size, display({ x: TASKBAR, y: 0, width: 1920 - TASKBAR, height: 1080 }))).toEqual({ x: TASKBAR, y: 980, width: 300, height: 100 });
  });

  it('hangs the drip from the top of the work area, centred', () => {
    expect(overlayBounds('top-center', size, display({ x: 0, y: 25, width: 1920, height: 1055 }))).toEqual({ x: 810, y: 25, width: 300, height: 100 });
  });

  it('follows a secondary display and never outgrows the work area', () => {
    const area = { x: 1920, y: 0, width: 200, height: 80 };
    expect(overlayBounds('bottom-right', size, { bounds: area, workArea: area })).toEqual({ x: 1920, y: 0, width: 200, height: 80 });
  });
});
it('resolves auto by taskbar and explicit placements, with drip fixed at top center', () => {
  expect(resolvePlacement('tray', 'auto')).toBe('bottom-right');
  expect(resolvePlacement('tray', 'auto', display({ x: 48, y: 0, width: 1872, height: 1080 }))).toBe('bottom-left');
  expect(resolvePlacement('console', 'auto', display({ x: 0, y: 25, width: 1920, height: 1055 }))).toBe('top-right');
  expect(resolvePlacement('tray', 'bottom-center')).toBe('bottom-center');
  expect(resolvePlacement('drip', 'bottom-left')).toBe('top-center');
  expect(overlayBounds('bottom-center', size, display(SCREEN))).toEqual({ x: 810, y: 980, width: 300, height: 100 });
});
