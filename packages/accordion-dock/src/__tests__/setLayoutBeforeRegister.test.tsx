import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'solid-js/web';
import { AccordionGroup } from '../AccordionGroup';
import { AccordionPanel } from '../AccordionPanel';
import { ACCORDION_LAYOUT_VERSION, type AccordionGroupApi } from '../context';

// apiRef fires before the panels register, so a restore there must outrank their defaultOpen.

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  document.body.innerHTML = '';
});

describe('setLayout before panels register', () => {
  it('is not undone by a panel defaultOpen', () => {
    let api!: AccordionGroupApi;
    const container = document.body.appendChild(document.createElement('div'));
    dispose = render(
      () => (
        <AccordionGroup
          policy="multi"
          apiRef={(a) => {
            api = a;
            a.setLayout({ version: ACCORDION_LAYOUT_VERSION, open: ['b'], pinned: [], order: ['a', 'b'], sizes: {} });
          }}
        >
          <AccordionPanel id="a" title="a" defaultOpen>a body</AccordionPanel>
          <AccordionPanel id="b" title="b">b body</AccordionPanel>
        </AccordionGroup>
      ),
      container,
    );
    expect(api.isOpen('a')).toBe(false);
    expect(api.isOpen('b')).toBe(true);
  });
});
