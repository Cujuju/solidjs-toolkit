import { describe, expect, it } from 'vitest';
import { renderToString } from 'solid-js/web';
import { SegButton, SegGroup } from '../index';

describe('server render', () => {
  it('renders a group and a standalone button', () => {
    const html = renderToString(() => (
      <>
        <SegGroup value="a" onChange={() => {}}>
          <SegButton label="Alpha" value="a" />
        </SegGroup>
        <SegButton label="Bold" active />
      </>
    ));
    expect(html).toContain('Alpha');
  });
});
