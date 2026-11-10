import { describe, expect, it } from 'vitest';
import { renderToString } from 'solid-js/web';
import { MenuTintSection } from '../index.js';

describe('server render', () => {
  it('renders the tint section', () => {
    expect(typeof renderToString(() => <MenuTintSection />)).toBe('string');
  });
});
