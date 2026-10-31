import { describe, expect, it } from 'vitest';
import { renderToString } from 'solid-js/web';
import { MenuTintSection } from '../index';

describe('server render', () => {
  it('renders the tint section', () => {
    expect(typeof renderToString(() => <MenuTintSection />)).toBe('string');
  });
});
