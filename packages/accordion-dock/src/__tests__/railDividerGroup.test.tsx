import { describe, expect, it, vi } from 'vitest';
import { createSignal } from 'solid-js';
import { render } from 'solid-js/web';
import { AccordionGroup } from '../AccordionGroup';
import { AccordionPanel } from '../AccordionPanel';
import type { AccordionGroupApi } from '../context';

/**
 * Group WIRING of the divider rules (`railDivider.test.ts` covers the rules): one painted
 * sequence, and an activator for every panel, driven through a mounted group's api.
 */

interface Mounted {
  api: () => AccordionGroupApi;
  container: HTMLElement;
  dispose: () => void;
}

function mountHorizontal(panels: readonly { id: string; defaultOpen?: boolean }[]): Mounted {
  let api!: AccordionGroupApi;
  const container = document.createElement('div');
  document.body.appendChild(container);

  const dispose = render(
    () => (
      <AccordionGroup
        orientation="horizontal"
        mode="fill"
        policy="multi"
        railDivider
        apiRef={(a) => (api = a)}
      >
        {panels.map((p) => (
          <AccordionPanel id={p.id} title={p.id} defaultOpen={p.defaultOpen}>
            <div>{p.id} body</div>
          </AccordionPanel>
        ))}
      </AccordionGroup>
    ),
    container,
  );

  return {
    api: () => api,
    container,
    dispose: () => {
      dispose();
      container.remove();
    },
  };
}

describe('the painted sequence is ONE sequence', () => {
  /** Painted sequence and flex `order` agree: orders read along `visualOpenIds` ascend. */
  function assertMonotonicOrders(api: AccordionGroupApi): void {
    const orders = api.visualOpenIds().map((id) => api.columnOrder(id));
    const sorted = [...orders].sort((a, b) => a - b);
    expect(orders).toEqual(sorted);
  }

  it('sequences the pinned run in PIN order, not panel order', () => {
    const m = mountHorizontal([
      { id: 'a', defaultOpen: true },
      { id: 'b', defaultOpen: true },
      { id: 'c', defaultOpen: true },
    ]);

    // Panel order is a,b,c. The user pins c first, then a — so the columns paint
    // c | a | rail | b.
    m.api().togglePin('c');
    m.api().togglePin('a');

    expect(m.api().visualOpenIds()).toEqual(['c', 'a', 'b']);
    assertMonotonicOrders(m.api());

    m.dispose();
  });

  it('pairs each splitter with the column it actually sits against', () => {
    const m = mountHorizontal([
      { id: 'a', defaultOpen: true },
      { id: 'b', defaultOpen: true },
      { id: 'c', defaultOpen: true },
    ]);
    m.api().togglePin('c');
    m.api().togglePin('a');

    // Painted c | a: the boundary between them is c's. Read in panel order, neither drew a splitter.
    expect(m.api().neighborOpenId('c')).toBe('a');
    // a's trailing edge IS the rail, which is why it is the boundary column.
    expect(m.api().isRailBoundary('a')).toBe(true);

    m.dispose();
  });

  it('makes the LAST painted column the trailing one, so `fill` surplus lands there', () => {
    const m = mountHorizontal([
      { id: 'a', defaultOpen: true },
      { id: 'b', defaultOpen: true },
      { id: 'c', defaultOpen: true },
    ]);
    // Only c pinned: the columns paint c | rail | a | b.
    m.api().togglePin('c');

    expect(m.api().visualOpenIds()).toEqual(['c', 'a', 'b']);
    // `columnFlex({ trailing })` is `neighborOpenId(id) === undefined`. b is last
    // on screen, so b absorbs the surplus — not c, which is pinned against the
    // opposite edge.
    expect(m.api().neighborOpenId('b')).toBeUndefined();
    expect(m.api().neighborOpenId('c')).toBe('a');

    m.dispose();
  });

  it('is unchanged when the pinned run is already a prefix of the panel order', () => {
    const m = mountHorizontal([
      { id: 'a', defaultOpen: true },
      { id: 'b', defaultOpen: true },
      { id: 'c', defaultOpen: true },
    ]);
    m.api().togglePin('a');

    expect(m.api().visualOpenIds()).toEqual(['a', 'b', 'c']);
    assertMonotonicOrders(m.api());

    m.dispose();
  });
});

describe('a pinned column keeps an activator', () => {
  it('claims the slot when pinning removes the rail button', () => {
    const m = mountHorizontal([
      { id: 'a', defaultOpen: true },
      { id: 'b', defaultOpen: true },
    ]);

    // Open and unpinned: the rail button is the activator.
    const viaRail = m.api().activatorElOf('b');
    expect(viaRail?.classList.contains('acc-rail-btn')).toBe(true);

    // Pinning removes the button; the column bar, mounted earlier, must take over.
    m.api().togglePin('b');

    const viaColumn = m.api().activatorElOf('b');
    expect(viaColumn).toBeDefined();
    expect(viaColumn?.classList.contains('acc-col-activator')).toBe(true);
    expect(m.api().showsRailButton('b')).toBe(false);

    m.dispose();
  });

  it('hands the slot back to the rail button when the pin is dropped', () => {
    const m = mountHorizontal([{ id: 'a', defaultOpen: true }]);

    m.api().togglePin('a');
    expect(m.api().activatorElOf('a')?.classList.contains('acc-col-activator')).toBe(true);

    m.api().togglePin('a');
    expect(m.api().activatorElOf('a')?.classList.contains('acc-rail-btn')).toBe(true);

    m.dispose();
  });

  it('never leaves arrow navigation with a dead stop', () => {
    const m = mountHorizontal([
      { id: 'a', defaultOpen: true },
      { id: 'b', defaultOpen: true },
      { id: 'c', defaultOpen: true },
    ]);
    m.api().togglePin('b');

    // `moveFocus` resolves its target through `activatorElOf`; a panel with no
    // element there swallows the keypress and the user can never arrow past it.
    for (const id of ['a', 'b', 'c']) {
      expect(m.api().activatorElOf(id)).toBeDefined();
    }

    m.dispose();
  });
});

describe('a column bar that unmounts releases its claim', () => {
  it('still yields a connected activator when a re-pin follows an orientation swap', () => {
    const [orientation, setOrientation] = createSignal<'horizontal' | 'vertical'>('horizontal');
    let api!: AccordionGroupApi;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const dispose = render(
      () => (
        <AccordionGroup orientation={orientation()} mode="fill" policy="multi" railDivider apiRef={(a) => (api = a)}>
          <AccordionPanel id="a" title="a" defaultOpen>
            <div>a body</div>
          </AccordionPanel>
          <AccordionPanel id="b" title="b">
            <div>b body</div>
          </AccordionPanel>
        </AccordionGroup>
      ),
      container,
    );

    api.togglePin('a');
    setOrientation('vertical');
    // Unpin then re-pin: a bar still held after unmount would be claimed again here.
    api.togglePin('a');
    api.togglePin('a');

    expect(api.activatorElOf('a')?.isConnected).toBe(true);

    dispose();
    container.remove();
  });
});

describe('a column drag reads the painted sequence', () => {
  /** Column width in the faked layout; the drag moves one column's worth. */
  const COLUMN_PX = 100;
  const PRESS_X = COLUMN_PX / 2;

  it('drags the first painted column one slot right: c | a | b → a | c | b', async () => {
    const m = mountHorizontal([
      { id: 'a', defaultOpen: true },
      { id: 'b', defaultOpen: true },
      { id: 'c', defaultOpen: true },
    ]);
    m.api().togglePin('c');
    m.api().togglePin('a');
    const painted = m.api().visualOpenIds();

    // jsdom has no layout: place each column at its painted slot.
    const realRect = Element.prototype.getBoundingClientRect;
    const rect = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const slot = this.classList.contains('acc-panel') ? painted.indexOf(this.getAttribute('data-reorder-id') ?? '') : -1;
      if (slot < 0) return realRect.call(this);
      const left = slot * COLUMN_PX;
      return { left, right: left + COLUMN_PX, width: COLUMN_PX, top: 0, bottom: 0, height: 0 } as DOMRect;
    });

    // The gesture starts on the column's title-bar activator (the drag HANDLE).
    const column = m.container.querySelector<HTMLElement>(".acc-panel[data-reorder-id='c'] .acc-col-activator");
    expect(column).not.toBeNull();
    const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
    column!.dispatchEvent(new PointerEvent('pointerdown', { clientX: PRESS_X, bubbles: true, button: 0 }));
    document.dispatchEvent(new PointerEvent('pointermove', { clientX: PRESS_X + 1, bubbles: true }));
    document.dispatchEvent(new PointerEvent('pointermove', { clientX: PRESS_X + COLUMN_PX / 2, bubbles: true }));
    await tick();
    document.dispatchEvent(new PointerEvent('pointermove', { clientX: PRESS_X + COLUMN_PX, bubbles: true }));
    await tick();
    document.dispatchEvent(new PointerEvent('pointerup', { clientX: PRESS_X + COLUMN_PX, bubbles: true, button: 0 }));

    expect(m.api().visualOpenIds()).toEqual(['a', 'c', 'b']);

    rect.mockRestore();
    m.dispose();
  });
});
