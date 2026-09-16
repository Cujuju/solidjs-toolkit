import { describe, expect, it, vi } from 'vitest';
import { render } from 'solid-js/web';
import { Breadcrumb } from '../Breadcrumb';
import { createStubGroup } from './stubGroup';

/**
 * The `…` button's keyboard contract: activating it unmounts the focused element, so
 * focus must land on the crumbs it reveals.
 */

/** Enough crumbs to trip `CRUMB_ELISION_THRESHOLD` with a real hidden run. */
const IDS = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5'];

function mount() {
  const { group } = createStubGroup({
    panels: IDS.map((id) => ({ id, title: id })),
    open: IDS,
    // The path is then the panel order, so which crumb the ellipsis hides is
    // stated by this list rather than by the divider's partition.
    railDivider: false,
  });

  const container = document.createElement('div');
  document.body.appendChild(container);
  const dispose = render(() => <Breadcrumb group={group} />, container);

  return {
    container,
    ellipsis: (): HTMLElement | null =>
      container.querySelector<HTMLElement>('.acc-breadcrumb-ellipsis'),
    titles: (): (string | null)[] =>
      [...container.querySelectorAll('.acc-breadcrumb-crumb')].map((el) =>
        el.getAttribute('title'),
      ),
    dispose: () => {
      dispose();
      container.remove();
    },
  };
}

describe('expanding the elided middle', () => {
  it('elides at all, and hides the run this test is about', () => {
    const m = mount();
    expect(m.ellipsis()).not.toBeNull();
    // Head + ellipsis + tail: p1..p3 are the ones only the ellipsis can reach.
    // The ellipsis carries its summary as a title, so it is the entry between.
    expect(m.titles()).toEqual(['p0', 'Show 3 hidden: p1 › p2 › p3', 'p4', 'p5']);
    m.dispose();
  });

  it('moves focus to the first crumb it revealed', () => {
    const m = mount();
    const ellipsis = m.ellipsis()!;
    ellipsis.focus();
    expect(document.activeElement).toBe(ellipsis);

    ellipsis.click();

    // The focused button is gone; focus must land on the run it opened, not on <body>.
    expect(m.titles()).toEqual(['p0', 'p1', 'p2', 'p3', 'p4', 'p5']);
    expect(document.activeElement).not.toBe(document.body);
    expect((document.activeElement as HTMLElement).getAttribute('title')).toBe('p1');

    m.dispose();
  });

  it('leaves the revealed crumb as the roving tab stop', () => {
    const m = mount();
    m.ellipsis()!.click();

    const stops = [...m.container.querySelectorAll('.acc-breadcrumb-crumb')].filter(
      (el) => el.getAttribute('tabindex') === '0',
    );
    expect(stops).toHaveLength(1);
    expect(stops[0].getAttribute('title')).toBe('p1');

    m.dispose();
  });

  it('reports its expansion state instead of claiming a constant', () => {
    const m = mount();
    // Rendered only while collapsed, so `false` is the right answer — but it has
    // to be the answer the state gives, not one written into the markup.
    expect(m.ellipsis()!.getAttribute('aria-expanded')).toBe('false');
    m.dispose();
  });
});

describe('arrow keys follow the writing direction', () => {
  function keyOn(el: Element, key: string): void {
    el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  }

  it('ArrowRight moves toward the start of the path in RTL', () => {
    const m = mount();
    const crumbs = [...m.container.querySelectorAll<HTMLElement>('.acc-breadcrumb-crumb')];
    const p4 = crumbs.find((el) => el.getAttribute('title') === 'p4')!;
    p4.focus();

    // jsdom resolves no inherited `direction`, so the computed value is supplied.
    const real = window.getComputedStyle;
    const spy = vi
      .spyOn(window, 'getComputedStyle')
      .mockImplementation((el, pseudo) =>
        ({ ...real(el, pseudo), direction: 'rtl' }) as CSSStyleDeclaration,
      );
    keyOn(p4, 'ArrowRight');
    spy.mockRestore();

    expect(document.activeElement).toBe(m.ellipsis());
    m.dispose();
  });

  it('ArrowLeft still moves toward the start in LTR', () => {
    const m = mount();
    const crumbs = [...m.container.querySelectorAll<HTMLElement>('.acc-breadcrumb-crumb')];
    const p4 = crumbs.find((el) => el.getAttribute('title') === 'p4')!;
    p4.focus();
    keyOn(p4, 'ArrowLeft');
    expect(document.activeElement).toBe(m.ellipsis());
    m.dispose();
  });
});
