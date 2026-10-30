import { describe, it, expect, afterEach } from 'vitest';
import { render } from 'solid-js/web';
import { MenuTintSection } from '../MenuTintSection';
import {
  DEFAULT_MENU_TINT_STORAGE_KEY,
  MENU_TINT_DEFAULTS,
  MENU_TINT_DARKEN_CSS_VAR,
  applyMenuTintKnobs,
  writeMenuTintKnobsToStorage,
} from '../menuTint';

afterEach(() => {
  localStorage.removeItem(DEFAULT_MENU_TINT_STORAGE_KEY);
  applyMenuTintKnobs(null);
  document.body.innerHTML = '';
});

describe('MenuTintSection', () => {
  it('applies stored knobs on mount, so the menus match the sliders without a host bootstrap', () => {
    const STORED_DARKEN = 55;
    writeMenuTintKnobsToStorage({ ...MENU_TINT_DEFAULTS, darken: STORED_DARKEN });
    const dispose = render(() => <MenuTintSection />, document.body);
    expect(document.documentElement.style.getPropertyValue(MENU_TINT_DARKEN_CSS_VAR)).toBe(`${STORED_DARKEN}%`);
    dispose();
  });
});
