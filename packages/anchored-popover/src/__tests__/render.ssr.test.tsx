import { describe, expect, it } from 'vitest';
import { renderToString } from 'solid-js/web';
import { AnchoredPopover } from '../index';

describe('server render', () => {
  it.each([false, true])('renders with open=%s', (open) => {
    const html = renderToString(() => (
      <AnchoredPopover open={() => open} anchor={() => undefined} onDismiss={() => {}}>
        <span>body</span>
      </AnchoredPopover>
    ));
    expect(typeof html).toBe('string');
  });
});
