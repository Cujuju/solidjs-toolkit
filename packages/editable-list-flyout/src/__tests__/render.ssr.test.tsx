import { describe, expect, it } from 'vitest';
import { renderToString } from 'solid-js/web';
import { EditableListFlyout } from '../index';

describe('server render', () => {
  it.each([false, true])('renders with open=%s', (open) => {
    const html = renderToString(() => (
      <EditableListFlyout open={() => open} anchor={() => undefined} onDismiss={() => {}} items={[{ id: 'a', name: 'Alpha' }]} />
    ));
    expect(typeof html).toBe('string');
  });
});
