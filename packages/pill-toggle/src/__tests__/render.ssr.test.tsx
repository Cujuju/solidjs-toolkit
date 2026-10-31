import { describe, expect, it } from 'vitest';
import { renderToString } from 'solid-js/web';
import { PillToggle } from '../index';

describe('server render', () => {
  it.each([false, true])('renders with enabled=%s', (enabled) => {
    expect(typeof renderToString(() => <PillToggle enabled={enabled} onToggle={() => {}} />)).toBe('string');
  });
});
