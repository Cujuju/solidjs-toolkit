import { describe, expect, it, vi } from 'vitest';
import { render } from 'solid-js/web';
import { AccordionGroup } from '../AccordionGroup';
import { AccordionPanel } from '../AccordionPanel';
import type { AccordionGroupApi, AccordionOrientation } from '../context';

/**
 * `appearance` is chrome: these assert that switching to `cards` changes NOTHING about
 * behaviour. The card chrome is untested. See DESIGN_NOTES.md § src/__tests__/appearance.test.tsx:7.
 */

function mount(options: {
  appearance?: 'flush' | 'cards';
  orientation?: AccordionOrientation;
  panels: readonly string[];
}) {
  let api!: AccordionGroupApi;
  const onPinChange = vi.fn();
  const host = document.createElement('div');
  document.body.appendChild(host);

  const dispose = render(
    () => (
      <AccordionGroup
        appearance={options.appearance}
        orientation={options.orientation ?? 'vertical'}
        policy="multi"
        onPinChange={onPinChange}
        apiRef={(a) => (api = a)}
      >
        {options.panels.map((id) => (
          <AccordionPanel id={id} title={id} defaultOpen>
            <div>{id} body</div>
          </AccordionPanel>
        ))}
      </AccordionGroup>
    ),
    host,
  );

  const groupEl = (): HTMLElement => host.querySelector('.acc-group') as HTMLElement;

  return {
    api,
    onPinChange,
    groupEl,
    dispose: () => {
      dispose();
      host.remove();
    },
  };
}

describe('appearance — what the group publishes', () => {
  it('defaults to flush, so an existing consumer that says nothing is unchanged', () => {
    const { groupEl, dispose } = mount({ panels: ['a', 'b'] });
    expect(groupEl().dataset.appearance).toBe('flush');
    dispose();
  });

  it('publishes cards when asked', () => {
    const { groupEl, dispose } = mount({ appearance: 'cards', panels: ['a', 'b'] });
    expect(groupEl().dataset.appearance).toBe('cards');
    dispose();
  });

  it('treats an explicit flush exactly as the default', () => {
    const { groupEl, dispose } = mount({ appearance: 'flush', panels: ['a', 'b'] });
    expect(groupEl().dataset.appearance).toBe('flush');
    dispose();
  });

  it('publishes it in BOTH orientations, since cards is not a vertical-only look', () => {
    const vertical = mount({
      appearance: 'cards',
      orientation: 'vertical',
      panels: ['a', 'b'],
    });
    expect(vertical.groupEl().dataset.appearance).toBe('cards');
    vertical.dispose();

    const horizontal = mount({
      appearance: 'cards',
      orientation: 'horizontal',
      panels: ['a', 'b'],
    });
    expect(horizontal.groupEl().dataset.appearance).toBe('cards');
    horizontal.dispose();
  });
});

describe('appearance — cards must not touch BEHAVIOUR', () => {
  it('opens and closes the same', () => {
    const { api, dispose } = mount({ appearance: 'cards', panels: ['a', 'b'] });

    expect(api.isOpen('a')).toBe(true);
    api.setOpen('a', false);
    expect(api.isOpen('a')).toBe(false);
    api.setOpen('a', true);
    expect(api.isOpen('a')).toBe(true);

    dispose();
  });

  it('pins and unpins the same, and reports it', () => {
    const { api, onPinChange, dispose } = mount({
      appearance: 'cards',
      panels: ['a', 'b'],
    });

    api.togglePin('a');
    expect(api.isPinned('a')).toBe(true);
    expect(onPinChange).toHaveBeenCalled();

    api.togglePin('a');
    expect(api.isPinned('a')).toBe(false);

    dispose();
  });

  it('keeps collapse-keep-pin and close-and-unpin distinct', () => {
    // The two closers differ only in whether the pin survives, and that
    // distinction is exactly the sort of thing a chrome change must not disturb.
    const { api, dispose } = mount({ appearance: 'cards', panels: ['a', 'b'] });

    api.togglePin('a');
    api.collapseKeepPin('a');
    expect(api.isOpen('a')).toBe(false);
    expect(api.isPinned('a')).toBe(true);

    api.setOpen('a', true);
    api.closeAndUnpin('a');
    expect(api.isOpen('a')).toBe(false);
    expect(api.isPinned('a')).toBe(false);

    dispose();
  });

  it('agrees with flush on every one of those', () => {
    /* The assertion of the whole feature: run the same sequence under both appearances and
           require identical state. Behaviour that drifted under one look would surface only as a
           bug report. */
    const sequence = (appearance: 'flush' | 'cards') => {
      const { api, dispose } = mount({ appearance, panels: ['a', 'b'] });
      api.togglePin('a');
      api.collapseKeepPin('a');
      const afterCollapse = { open: api.isOpen('a'), pinned: api.isPinned('a') };
      api.setOpen('a', true);
      api.closeAndUnpin('a');
      const afterClose = { open: api.isOpen('a'), pinned: api.isPinned('a') };
      const order = [...api.order()];
      dispose();
      return { afterCollapse, afterClose, order };
    };

    expect(sequence('cards')).toEqual(sequence('flush'));
  });
});
