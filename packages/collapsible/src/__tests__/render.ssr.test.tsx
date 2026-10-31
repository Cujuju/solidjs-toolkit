import { describe, expect, it } from 'vitest';
import { renderToString } from 'solid-js/web';
import { Collapsible } from '../index';

describe('server render', () => {
  it.each([false, true])('renders with defaultOpen=%s', (open) => {
    expect(renderToString(() => <Collapsible title="Section" defaultOpen={open}>body</Collapsible>)).toContain('Section');
  });
});
