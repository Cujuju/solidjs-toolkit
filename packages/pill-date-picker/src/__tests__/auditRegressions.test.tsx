/**
 * Audit register regressions (F060, F006, F063, F008, F029, F033, F030, F010, F046, F043).
 *
 * Same harness conventions as hardening.test.tsx — hand-disposed `render` from solid-js/web.
 * Layout is stubbed per test: jsdom lays nothing out, so every rect is otherwise zero.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render } from 'solid-js/web';
import { createSignal } from 'solid-js';
import { PillDatePicker } from '../PillDatePicker';
import { POPOUT_VIEWPORT_MARGIN_PX } from '../_internal/popout';

let dispose: (() => void) | null = null;
function mount(ui: () => any): HTMLDivElement {
  const host = document.createElement('div');
  document.body.appendChild(host);
  dispose = render(ui, host);
  return host;
}
afterEach(() => {
  dispose?.();
  dispose = null;
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (document.documentElement as unknown as Record<string, unknown>).clientWidth;
  delete (document.documentElement as unknown as Record<string, unknown>).clientHeight;
});

const NOW = new Date(2026, 5, 13);
const LADDER = ['2026-06-19', '2026-06-26', '2026-07-02', '2026-07-17', '2026-09-18'];
const SELECTED = '2026-07-17';

const pills = () => [...document.body.querySelectorAll('.cpdp-pill')] as HTMLButtonElement[];
const panel = () => document.body.querySelector('.cpdp-popout') as HTMLElement | null;
const panels = () => [...document.body.querySelectorAll('.cpdp-popout')] as HTMLElement[];
const activeRow = () => document.body.querySelector('.cpdp-row[data-active]') as HTMLElement | null;
const click = (el: Element) => el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
/** Dispatches a cancelable keydown and returns it, so `defaultPrevented` can be asserted. */
const keyOn = (target: EventTarget, k: string): KeyboardEvent => {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
  target.dispatchEvent(e);
  return e;
};

interface Layout {
  viewport: { width: number; height: number; clientWidth?: number; clientHeight?: number };
  anchor: { top: number; left: number; width: number; height: number };
  panel: { width: number; height: number };
}
/** Stubs the viewport and the pill/panel rects; mutate the returned object to move them. */
function stubLayout(layout: Layout): Layout {
  vi.stubGlobal('innerWidth', layout.viewport.width);
  vi.stubGlobal('innerHeight', layout.viewport.height);
  Object.defineProperty(document.documentElement, 'clientWidth', {
    configurable: true,
    get: () => layout.viewport.clientWidth ?? layout.viewport.width,
  });
  Object.defineProperty(document.documentElement, 'clientHeight', {
    configurable: true,
    get: () => layout.viewport.clientHeight ?? layout.viewport.height,
  });
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const r = this.classList.contains('cpdp-pill')
      ? layout.anchor
      : this.classList.contains('cpdp-popout')
        ? { top: 0, left: 0, ...layout.panel }
        : { top: 0, left: 0, width: 0, height: 0 };
    return { ...r, right: r.left + r.width, bottom: r.top + r.height, x: r.left, y: r.top, toJSON() {} } as DOMRect;
  });
  return layout;
}

describe('F060 — the open ladder serves only keystrokes that belong to it', () => {
  it('does not commit or swallow keys typed into a control that already had focus', () => {
    const picked = vi.fn();
    const c = mount(() => (
      <>
        <PillDatePicker items={LADDER} value={SELECTED} onChange={picked} now={NOW} open />
        <input type="text" />
      </>
    ));
    const input = c.querySelector('input')!;
    input.focus();
    expect(keyOn(input, ' ').defaultPrevented).toBe(false);
    expect(keyOn(input, 'Home').defaultPrevented).toBe(false);
    expect(keyOn(input, 'Enter').defaultPrevented).toBe(false);
    expect(picked).not.toHaveBeenCalled();
  });

  it('closes the ladder when focus moves to something outside it', () => {
    const c = mount(() => (
      <>
        <PillDatePicker items={LADDER} value={SELECTED} onChange={() => {}} now={NOW} />
        <input type="text" />
      </>
    ));
    pills()[0].focus();
    click(pills()[0]);
    expect(panel()).not.toBeNull();
    c.querySelector('input')!.focus();
    expect(panel()).toBeNull();
  });

  it('still serves keys aimed at the pill itself', () => {
    const picked = vi.fn();
    mount(() => <PillDatePicker items={LADDER} value={null} onChange={picked} now={NOW} />);
    const pill = pills()[0];
    pill.focus();
    click(pill);
    keyOn(pill, 'ArrowDown');
    keyOn(pill, 'Enter');
    expect(picked).toHaveBeenCalledWith('2026-06-19');
    expect(panel()).toBeNull(); // the trigger's own Enter handler must not reopen it
  });
});

describe('F006 — placement props are not open-effect dependencies', () => {
  it('flipping preferPlacement while open keeps the cursor and re-places the panel', () => {
    stubLayout({
      viewport: { width: 1000, height: 800 },
      anchor: { top: 300, left: 100, width: 60, height: 22 },
      panel: { width: 140, height: 100 },
    });
    const [prefer, setPrefer] = createSignal<'top' | 'bottom'>('bottom');
    mount(() => (
      <PillDatePicker items={LADDER} value={SELECTED} onChange={() => {}} now={NOW} preferPlacement={prefer()} />
    ));
    click(pills()[0]);
    keyOn(document, 'Home');
    expect(activeRow()!.textContent).toContain('Jun 19');
    expect(panel()!.dataset.placement).toBe('bottom');
    setPrefer('top');
    expect(activeRow()!.textContent).toContain('Jun 19'); // NOT re-seeded to the selection
    expect(panel()!.dataset.placement).toBe('top');
  });

  it('a changing popoutGap on the picker underneath does not steal the keyboard', () => {
    const a = vi.fn();
    const b = vi.fn();
    const [gap, setGap] = createSignal(4);
    mount(() => (
      <>
        <PillDatePicker items={LADDER} value={null} onChange={a} now={NOW} open popoutGap={gap()} />
        <PillDatePicker items={LADDER} value={null} onChange={b} now={NOW} open />
      </>
    ));
    setGap(8);
    keyOn(document, 'ArrowDown');
    keyOn(document, 'Enter');
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });
});

describe('F063 — an Escape the picker consumed goes no further', () => {
  it('does not reach an enclosing handler, and cancels the default close-request', () => {
    const outer = vi.fn();
    const wrapper = document.createElement('div');
    wrapper.addEventListener('keydown', outer);
    document.body.appendChild(wrapper);
    dispose = render(
      () => <PillDatePicker items={LADDER} value={null} onChange={() => {}} now={NOW} />,
      wrapper,
    );
    const pill = pills()[0];
    pill.focus();
    click(pill);
    const e = keyOn(pill, 'Escape');
    expect(panel()).toBeNull();
    expect(e.defaultPrevented).toBe(true);
    expect(outer).not.toHaveBeenCalled();
  });

  it('dismisses the ladder on top of the stack even when focus is elsewhere', () => {
    const [topOpen, setTopOpen] = createSignal(false);
    const topOpenChanges: boolean[] = [];
    const c = mount(() => (
      <>
        <input type="text" />
        <PillDatePicker items={LADDER} value={null} onChange={() => {}} now={NOW} />
        <PillDatePicker
          items={LADDER}
          value={null}
          onChange={() => {}}
          now={NOW}
          open={topOpen()}
          onOpenChange={(o) => {
            topOpenChanges.push(o);
            setTopOpen(o);
          }}
        />
      </>
    ));
    const input = c.querySelector('input')!;
    input.focus();
    click(pills()[0]);
    setTopOpen(true);
    expect(panels()).toHaveLength(2);
    const e = keyOn(input, 'Escape');
    expect(e.defaultPrevented).toBe(true);
    expect(topOpenChanges).toEqual([false]);
    expect(pills()[1].getAttribute('aria-expanded')).toBe('false');
    // And the stack was released: the picker underneath is dismissable again, though focus
    // is now on the other pill — it owns the top of the stack, which is the whole contract.
    click(pills()[0]);
    expect(panels()).toHaveLength(1);
    expect(keyOn(pills()[1], 'Escape').defaultPrevented).toBe(true);
    expect(panels()).toHaveLength(0);
  });
});

describe('F008 / F046 — disabled + controlled open releases everything the panel owned', () => {
  it('drops the keyboard, stops claiming expanded, and re-seeds when re-enabled', () => {
    const [dis, setDis] = createSignal(false);
    mount(() => (
      <PillDatePicker
        items={LADDER}
        value={SELECTED}
        onChange={() => {}}
        now={NOW}
        open
        onOpenChange={() => {}}
        disabled={dis()}
      />
    ));
    setDis(true);
    expect(panel()).toBeNull();
    expect(keyOn(document, 'ArrowDown').defaultPrevented).toBe(false);
    const combo = pills()[0];
    expect(combo.getAttribute('aria-expanded')).toBe('false');
    expect(combo.getAttribute('aria-controls')).toBeNull();
    setDis(false);
    expect(activeRow()!.textContent).toContain('Jul 17');
  });
});

describe('F029 — the panel is re-placed when its own size changes', () => {
  it('flips above when rows arriving make it too tall for the space below', () => {
    let resized: (() => void) | undefined;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: () => void) {
          resized = cb;
        }
        observe() {}
        disconnect() {}
      },
    );
    const layout = stubLayout({
      viewport: { width: 1000, height: 800 },
      anchor: { top: 700, left: 100, width: 60, height: 22 },
      panel: { width: 140, height: 44 },
    });
    mount(() => <PillDatePicker items={LADDER} value={null} onChange={() => {}} now={NOW} />);
    click(pills()[0]);
    expect(panel()!.dataset.placement).toBe('bottom');
    layout.panel.height = 260;
    resized?.();
    expect(panel()!.dataset.placement).toBe('top');
  });
});

describe('F033 — a ladder whose pill has scrolled out of view is put away', () => {
  it('closes instead of clamping an orphaned panel to the viewport edge', () => {
    const layout = stubLayout({
      viewport: { width: 1000, height: 800 },
      anchor: { top: 300, left: 100, width: 60, height: 22 },
      panel: { width: 140, height: 200 },
    });
    mount(() => <PillDatePicker items={LADDER} value={null} onChange={() => {}} now={NOW} />);
    click(pills()[0]);
    expect(panel()).not.toBeNull();
    layout.anchor.top = -500;
    window.dispatchEvent(new Event('scroll'));
    expect(panel()).toBeNull();
  });
});

describe('F030 — placement uses the layout viewport, not window.inner*', () => {
  it('clamps against clientWidth, so a classic scrollbar does not cover the panel', () => {
    const SCROLLBAR_PX = 15;
    const layout = stubLayout({
      viewport: { width: 1000, height: 800, clientWidth: 1000 - SCROLLBAR_PX },
      anchor: { top: 300, left: 960, width: 30, height: 22 },
      panel: { width: 140, height: 100 },
    });
    mount(() => <PillDatePicker items={LADDER} value={null} onChange={() => {}} now={NOW} />);
    click(pills()[0]);
    const expectedLeft = layout.viewport.clientWidth! - layout.panel.width - POPOUT_VIEWPORT_MARGIN_PX;
    expect(panel()!.style.left).toBe(`${expectedLeft}px`);
  });
});

describe('F010 — Enter/Space with no active row are still owned by the open list', () => {
  it("prevents the pill's native activation instead of letting it dismiss the ladder", () => {
    mount(() => (
      <PillDatePicker items={LADDER} value={null} onChange={() => {}} now={NOW} itemState={() => 'disabled'} />
    ));
    const pill = pills()[0];
    pill.focus();
    click(pill);
    keyOn(pill, 'ArrowDown');
    expect(activeRow()).toBeNull();
    expect(keyOn(pill, 'Enter').defaultPrevented).toBe(true);
    expect(keyOn(pill, ' ').defaultPrevented).toBe(true);
  });
});

describe('F043 — aria-activedescendant only ever names a rendered row', () => {
  it('names nothing when the selection is not in the ladder', () => {
    mount(() => <PillDatePicker items={[]} value={SELECTED} onChange={() => {}} now={NOW} />);
    click(pills()[0]);
    expect(pills()[0].getAttribute('aria-activedescendant')).toBeNull();
  });

  it('drops the pointer when the active row leaves a re-supplied ladder', () => {
    const [items, setItems] = createSignal<string[]>(LADDER);
    mount(() => <PillDatePicker items={items()} value={null} onChange={() => {}} now={NOW} />);
    click(pills()[0]);
    keyOn(document, 'ArrowDown');
    expect(pills()[0].getAttribute('aria-activedescendant')).toBeTruthy();
    setItems(LADDER.slice(1));
    expect(pills()[0].getAttribute('aria-activedescendant')).toBeNull();
  });
});

// ── Round 2 (review a / review b) ─────────────────────────────────────────────

describe('F060 — containment is judged on the composed path, so a shadow-root host still works', () => {
  it('serves keys aimed at a pill inside a shadow root, and focus returning to it keeps the ladder', () => {
    const shadowHost = document.createElement('div');
    document.body.appendChild(shadowHost);
    const root = shadowHost.attachShadow({ mode: 'open' });
    const container = document.createElement('div');
    root.appendChild(container);
    dispose = render(
      () => <PillDatePicker items={LADDER} value={null} onChange={() => {}} now={NOW} />,
      container,
    );
    const pill = root.querySelector('.cpdp-pill') as HTMLButtonElement;
    pill.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    expect(panel()).not.toBeNull();
    pill.focus();
    expect(panel(), 'focus landing on the pill closed its own ladder').not.toBeNull();
    const e = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true, composed: true });
    pill.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(activeRow()).not.toBeNull();
  });
});

describe('F033 — an off-screen anchor hides the panel; only leaving the viewport closes it, once', () => {
  const REPEATED_SCROLLS = 3;
  const IN_VIEW = { top: 300, left: 100, width: 60, height: 22 };
  const OUT_OF_VIEW_TOP = -500;

  it('opening while the anchor is out of view reports only the open, and keeps a hidden ladder', () => {
    stubLayout({
      viewport: { width: 1000, height: 800 },
      anchor: { ...IN_VIEW, top: OUT_OF_VIEW_TOP },
      panel: { width: 140, height: 200 },
    });
    const seen: boolean[] = [];
    mount(() => (
      <PillDatePicker items={LADDER} value={null} onChange={() => {}} now={NOW} onOpenChange={(o) => seen.push(o)} />
    ));
    click(pills()[0]);
    expect(seen).toEqual([true]);
    expect(panel()!.style.visibility).toBe('hidden');
  });

  it('stays open when only the anchor rect is mocked (jsdom reports a zero layout viewport)', () => {
    stubLayout({
      viewport: { width: 1024, height: 768, clientWidth: 0, clientHeight: 0 },
      anchor: IN_VIEW,
      panel: { width: 140, height: 200 },
    });
    mount(() => <PillDatePicker items={LADDER} value={null} onChange={() => {}} now={NOW} />);
    click(pills()[0]);
    expect(panel()).not.toBeNull();
  });

  it('hides on a non-reflow placement, and still closes exactly once on the next scroll', () => {
    let resized: (() => void) | undefined;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: () => void) {
          resized = cb;
        }
        observe() {}
        disconnect() {}
      },
    );
    const layout = stubLayout({
      viewport: { width: 1000, height: 800 },
      anchor: { ...IN_VIEW },
      panel: { width: 140, height: 200 },
    });
    const seen: boolean[] = [];
    mount(() => (
      <PillDatePicker items={LADDER} value={null} onChange={() => {}} now={NOW} onOpenChange={(o) => seen.push(o)} />
    ));
    click(pills()[0]);
    layout.anchor.top = OUT_OF_VIEW_TOP;
    // A placement nobody asked a dismissal of: it hides the panel and leaves the edge for `onReflow`.
    resized?.();
    expect(panel(), 'a ResizeObserver placement closed the ladder instead of hiding it').not.toBeNull();
    expect(panel()!.style.visibility).toBe('hidden');
    expect(seen).toEqual([true]);
    for (let i = 0; i < REPEATED_SCROLLS; i++) window.dispatchEvent(new Event('scroll'));
    expect(panel(), 'the ResizeObserver placement ate the close').toBeNull();
    expect(seen).toEqual([true, false]);
  });

  it('a controlled parent that ignores onOpenChange is asked once and left with no visible stale panel', () => {
    const layout = stubLayout({
      viewport: { width: 1000, height: 800 },
      anchor: { ...IN_VIEW },
      panel: { width: 140, height: 200 },
    });
    const onOpenChange = vi.fn();
    mount(() => (
      <PillDatePicker items={LADDER} value={null} onChange={() => {}} now={NOW} open onOpenChange={onOpenChange} />
    ));
    layout.anchor.top = OUT_OF_VIEW_TOP;
    for (let i = 0; i < REPEATED_SCROLLS; i++) window.dispatchEvent(new Event('scroll'));
    expect(onOpenChange).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(panel()!.style.visibility).toBe('hidden');
  });
});

describe('F045 / F031 — a non-finite caller dteOf reaches consumers as null', () => {
  it('ctx.dte and tooltipEntries see null, never NaN', () => {
    const rowDtes: (number | null)[] = [];
    const tipDtes: (number | null)[] = [];
    mount(() => (
      <PillDatePicker
        items={LADDER}
        value={SELECTED}
        onChange={() => {}}
        now={NOW}
        dteOf={() => Number.NaN}
        tooltipEntries={(_item, dte) => {
          tipDtes.push(dte);
          return {};
        }}
        renderRow={(ctx) => {
          rowDtes.push(ctx.dte);
          return <span>{ctx.dteLabel}</span>;
        }}
      />
    ));
    click(pills()[0]);
    expect(tipDtes.length).toBeGreaterThan(0);
    expect(rowDtes).toHaveLength(LADDER.length);
    expect([...tipDtes, ...rowDtes].every((d) => d === null)).toBe(true);
  });
});
