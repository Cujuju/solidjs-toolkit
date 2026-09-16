import { describe, expect, it, vi } from 'vitest';
import { Show, createSignal } from 'solid-js';
import { render } from 'solid-js/web';
import { AccordionGroup } from '../AccordionGroup';
import { AccordionPanel } from '../AccordionPanel';
import type { AccordionGroupApi } from '../context';
import { RAIL_ITEM_ATTR } from '../railOverflow';

/**
 * The rail `tablist` has ONE Tab stop; the arrow keys (`keys.ts`) move between tabs.
 */
function mount() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const dispose = render(
    () => (
      <AccordionGroup orientation="horizontal" mode="fill" policy="multi">
        <AccordionPanel id="a" title="a">
          <div>a</div>
        </AccordionPanel>
        <AccordionPanel id="b" title="b" defaultOpen>
          <div>b</div>
        </AccordionPanel>
        <AccordionPanel id="c" title="c">
          <div>c</div>
        </AccordionPanel>
      </AccordionGroup>
    ),
    container,
  );
  const buttons = (): HTMLElement[] => [...container.querySelectorAll<HTMLElement>('.acc-rail-btn')];
  return {
    buttons,
    stops: (): (string | null)[] =>
      buttons()
        .filter((el) => el.getAttribute('tabindex') === '0')
        .map((el) => el.querySelector('.acc-rail-label')?.textContent ?? null),
    dispose: () => {
      dispose();
      container.remove();
    },
  };
}

describe('the rail tablist has one tab stop', () => {
  it('rests on the open tab', () => {
    const m = mount();
    expect(m.buttons()).toHaveLength(3);
    expect(m.stops()).toEqual(['b']);
    m.dispose();
  });

  it('follows focus, so Tab returns to the tab the user left', () => {
    const m = mount();
    m.buttons()[2].focus();
    expect(m.stops()).toEqual(['c']);
    m.dispose();
  });
});

describe('focus dropped by a removed panel', () => {
  /** Long enough for any late stand-in to have settled; the user is idle on `<body>`. */
  const IDLE_MS = 20;

  it('is not reclaimed when the panel remounts later', async () => {
    const [show, setShow] = createSignal(true);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const dispose = render(
      () => (
        <AccordionGroup orientation="horizontal" mode="fill" policy="multi">
          <AccordionPanel id="a" title="a" defaultOpen>
            <div>a</div>
          </AccordionPanel>
          <Show when={show()}>
            <AccordionPanel id="x" title="x">
              <div>x</div>
            </AccordionPanel>
          </Show>
        </AccordionGroup>
      ),
      container,
    );
    const railBtn = (id: string) => container.querySelector<HTMLElement>(`.acc-rail-btn[${RAIL_ITEM_ATTR}="${id}"]`);
    railBtn('x')!.focus();
    expect(document.activeElement).toBe(railBtn('x'));

    // The panel itself goes away: no stand-in can ever arrive.
    setShow(false);
    expect(railBtn('x')).toBeNull();
    expect(document.activeElement).toBe(document.body);
    await new Promise((r) => setTimeout(r, IDLE_MS));

    setShow(true);
    await vi.waitFor(() => expect(railBtn('x')).not.toBeNull());
    expect(document.activeElement).toBe(document.body);
    dispose();
    container.remove();
  });
});

describe('focus dropped by a rail button becoming a column', () => {
  it('moves onto the pinned column bar that replaces it', async () => {
    let api!: AccordionGroupApi;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const dispose = render(
      () => (
        <AccordionGroup orientation="horizontal" mode="fill" policy="multi" railDivider apiRef={(a) => (api = a)}>
          <AccordionPanel id="a" title="a" defaultOpen>
            <div>a</div>
          </AccordionPanel>
          <AccordionPanel id="x" title="x">
            <div>x</div>
          </AccordionPanel>
        </AccordionGroup>
      ),
      container,
    );
    api.togglePin('x');
    const railBtn = container.querySelector<HTMLElement>(`.acc-rail-btn[${RAIL_ITEM_ATTR}="x"]`)!;
    railBtn.focus();

    api.toggle('x');
    await vi.waitFor(() => expect(railBtn.isConnected).toBe(false));
    await vi.waitFor(() => expect(document.activeElement).toBe(api.activatorElOf('x')));
    expect(document.activeElement).not.toBe(document.body);
    dispose();
    container.remove();
  });
});

describe('the tab stop under rail overflow', () => {
  /** Three tabs (120px) overflow a 100px rail, so the last lands in `⋯`. */
  const RAIL_EXTENT_PX = 100;
  const TAB_EXTENT_PX = 40;

  function mountOverflowing() {
    const realRect = Element.prototype.getBoundingClientRect;
    const rect = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      return this.hasAttribute(RAIL_ITEM_ATTR) ? ({ height: TAB_EXTENT_PX, width: 0 } as DOMRect) : realRect.call(this);
    });
    const height = vi.spyOn(Element.prototype, 'clientHeight', 'get').mockImplementation(function (this: Element) {
      return this.classList.contains('acc-rail') ? RAIL_EXTENT_PX : 0;
    });

    let api!: AccordionGroupApi;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const dispose = render(
      () => (
        <AccordionGroup orientation="horizontal" mode="fill" policy="multi" apiRef={(a) => (api = a)}>
          <AccordionPanel id="a" title="a">
            <div>a</div>
          </AccordionPanel>
          <AccordionPanel id="b" title="b" defaultOpen>
            <div>b</div>
          </AccordionPanel>
          <AccordionPanel id="c" title="c">
            <div>c</div>
          </AccordionPanel>
        </AccordionGroup>
      ),
      container,
    );
    const buttons = (): HTMLElement[] => [...container.querySelectorAll<HTMLElement>('.acc-rail-btn')];
    return {
      api: () => api,
      buttons,
      trigger: () => container.querySelector<HTMLElement>('.acc-rail-overflow'),
      stops: (): (string | null)[] =>
        buttons()
          .filter((el) => el.getAttribute('tabindex') === '0')
          .map((el) => el.getAttribute(RAIL_ITEM_ATTR)),
      dispose: () => {
        dispose();
        container.remove();
        rect.mockRestore();
        height.mockRestore();
      },
    };
  }

  it('leaves the stop on a visible tab, never on the ⋯ trigger', async () => {
    const m = mountOverflowing();
    await vi.waitFor(() => expect(m.trigger()).not.toBeNull());
    expect(m.trigger()!.getAttribute('tabindex')).toBe('-1');
    expect(m.stops()).toHaveLength(1);
    m.dispose();
  });

  it('falls back to the first open visible tab when the focused tab moves into overflow', async () => {
    const m = mountOverflowing();
    await vi.waitFor(() => expect(m.trigger()).not.toBeNull());
    const a = m.buttons().find((el) => el.getAttribute(RAIL_ITEM_ATTR) === 'a')!;
    a.focus();
    expect(m.stops()).toEqual(['a']);

    // To the end of the rail order, past the budget.
    m.api().moveBy('a', 2);
    await vi.waitFor(() => {
      expect(m.buttons().some((el) => el.getAttribute(RAIL_ITEM_ATTR) === 'a')).toBe(false);
      expect(m.stops()).toEqual(['b']);
    });
    // The focused button unmounted; the ⋯ trigger now stands in for its panel. Passing also
        // proves the ownership sample survives removal — `document.activeElement` is `<body>` afterwards.
    expect(document.activeElement).toBe(m.trigger());
    m.dispose();
  });

  it('leaves focus alone when the user had already left the rail before the move', async () => {
    const m = mountOverflowing();
    await vi.waitFor(() => expect(m.trigger()).not.toBeNull());
    const a = m.buttons().find((el) => el.getAttribute(RAIL_ITEM_ATTR) === 'a')!;
    a.focus();
    // Focus dropped by the USER, not by the unmount — `<body>` alone cannot tell these apart.
    a.blur();
    expect(document.activeElement).toBe(document.body);

    m.api().moveBy('a', 2);
    await vi.waitFor(() => {
      expect(m.buttons().some((el) => el.getAttribute(RAIL_ITEM_ATTR) === 'a')).toBe(false);
      expect(m.stops()).toEqual(['b']);
    });
    expect(document.activeElement).not.toBe(m.trigger());
    m.dispose();
  });
});
