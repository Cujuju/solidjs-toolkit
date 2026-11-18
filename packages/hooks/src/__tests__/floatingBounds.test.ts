import { afterEach, describe, expect, it } from 'vitest';
import { FLOATING_INSET_VARS, floatingBounds } from '../_internal/floatingBounds.js';

const root = document.documentElement;

afterEach(() => {
  for (const name of Object.values(FLOATING_INSET_VARS)) root.style.removeProperty(name);
});

describe('floatingBounds', () => {
  it('is the full window when the host reserves nothing', () => {
    expect(floatingBounds()).toEqual({
      top: 0, left: 0, right: window.innerWidth, bottom: window.innerHeight,
      width: window.innerWidth, height: window.innerHeight,
    });
  });

  it('excludes every host-reserved edge', () => {
    root.style.setProperty(FLOATING_INSET_VARS.top, '48px');
    root.style.setProperty(FLOATING_INSET_VARS.right, '10px');
    root.style.setProperty(FLOATING_INSET_VARS.bottom, '20px');
    root.style.setProperty(FLOATING_INSET_VARS.left, '5px');
    expect(floatingBounds()).toEqual({
      top: 48, left: 5, right: window.innerWidth - 10, bottom: window.innerHeight - 20,
      width: window.innerWidth - 15, height: window.innerHeight - 68,
    });
  });

  it('ignores negative and unparseable insets', () => {
    root.style.setProperty(FLOATING_INSET_VARS.top, '-30px');
    root.style.setProperty(FLOATING_INSET_VARS.left, 'auto');
    expect(floatingBounds()).toMatchObject({ top: 0, left: 0 });
  });

  it('never yields a negative size when insets exceed the window', () => {
    root.style.setProperty(FLOATING_INSET_VARS.top, `${window.innerHeight + 100}px`);
    expect(floatingBounds().height).toBe(0);
  });
});

describe('floatingBounds(viewport)', () => {
  it('reserves the insets from a supplied layout viewport instead of the window', () => {
    document.documentElement.style.setProperty(FLOATING_INSET_VARS.top, '48px');
    expect(floatingBounds({ width: 900, height: 700 })).toEqual({
      top: 48, left: 0, right: 900, bottom: 700, width: 900, height: 652,
    });
  });
});
