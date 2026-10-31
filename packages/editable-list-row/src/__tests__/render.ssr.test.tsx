import { describe, expect, it } from 'vitest';
import { renderToString } from 'solid-js/web';
import { EditableListRow } from '../index';

describe('server render', () => {
  it.each([false, true])('renders with checked=%s', (checked) => {
    const html = renderToString(() => (
      <EditableListRow id="a" name="Alpha" selection={{ kind: 'checkbox', checked, onToggle: () => {} }} />
    ));
    expect(html).toContain('Alpha');
  });
});
