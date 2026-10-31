import { describe, expect, it } from 'vitest';
import { renderToString } from 'solid-js/web';
import { Flyout } from '../index';

describe('server render', () => {
  it('renders', () => {
    const html = renderToString(() => (
      <Flyout options={[{ value: 'a', label: 'Alpha' }]} value="a" onChange={() => {}} />
    ));
    expect(html).toContain('Alpha');
  });
});
