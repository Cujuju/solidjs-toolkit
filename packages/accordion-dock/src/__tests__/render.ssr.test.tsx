import { describe, expect, it } from 'vitest';
import { renderToString } from 'solid-js/web';
import { AccordionGroup, AccordionLeaf, AccordionPanel, Breadcrumb, createTearOff, TearOffOutlet } from '../index';

describe('server render', () => {
  it.each([false, true])('a group renders its panels and leaf, open=%s', (open) => {
    const html = renderToString(() => (
      <AccordionGroup>
        <Breadcrumb />
        <AccordionPanel id="a" title="Alpha" defaultOpen={open}>alpha body</AccordionPanel>
        <AccordionLeaf id="leaf" open={open}>leaf body</AccordionLeaf>
      </AccordionGroup>
    ));
    expect(html).toContain('Alpha');
  });

  it('a tear-off outlet renders', () => {
    const api = createTearOff({ titleOf: (id) => id });
    expect(typeof renderToString(() => <TearOffOutlet id="a" api={api}>body</TearOffOutlet>)).toBe('string');
  });
});
