import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from 'solid-js/web';
import { createComponent } from 'solid-js';
import { KvTooltip } from '../KvTooltip';

/**
 * Accessibility contract.
 *
 * The panel is portalled, mounted only while hovered, and referenced by
 * nothing — so `role="tooltip"` on it announces nothing at all. Before this
 * contract, replacing a native `title` with a KvTooltip silently deleted the
 * text for every screen-reader and keyboard user, and a consumer could not
 * keep both (two popups fire on one hover).
 *
 * What is guaranteed here:
 *   1. An always-mounted, visually-hidden description node carries the text.
 *   2. `aria-describedby` points at it from the wrapper AND from the caller's
 *      own trigger element (merged, never overwriting existing ids) — the
 *      attribute is not inherited, so it must sit where focus lands.
 *   3. `description` overrides the text derived from `entries`.
 *   4. The wrapper takes a tab stop only when the caller's trigger has none.
 *   5. Focus shows the panel, blur hides it, Escape dismisses it.
 *   6. The visible panel is `aria-hidden` whenever the hidden node duplicates
 *      it, so nothing is announced twice.
 *   7. `describeTrigger={false}` restores the 0.2.x mouse-only behaviour.
 */

function renderTooltip(props: Parameters<typeof KvTooltip>[0]): {
  dispose: () => void;
  container: HTMLDivElement;
} {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const dispose = render(() => createComponent(KvTooltip, props), container);
  return {
    dispose: () => {
      dispose();
      container.remove();
    },
    container,
  };
}

function getWrapper(container: HTMLElement): HTMLElement {
  const el = container.querySelector('span');
  if (!el) throw new Error('expected wrapper <span>');
  return el;
}

/** The hidden node the wrapper's aria-describedby resolves to. */
function getDescriptionNode(container: HTMLElement): HTMLElement | null {
  const id = getWrapper(container).getAttribute('aria-describedby');
  return id ? document.getElementById(id) : null;
}

function fireMouse(el: EventTarget, type: 'mouseenter' | 'mouseleave'): void {
  el.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: 10, clientY: 10 }));
}

function fireFocus(el: EventTarget, type: 'focusin' | 'focusout'): void {
  el.dispatchEvent(new FocusEvent(type, { bubbles: true }));
}

function getPanel(): HTMLElement | null {
  return document.querySelector('.ckv-panel');
}

describe('KvTooltip accessibility', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    document.querySelectorAll('.ckv-panel').forEach((el) => el.remove());
  });

  it('exposes the entries as an always-mounted hidden description', () => {
    const { dispose, container } = renderTooltip({
      entries: { Delta: '0.42', Gamma: '0.03' },
      children: 'hover me',
    });
    const node = getDescriptionNode(container);
    expect(node).not.toBeNull();
    expect(node!.textContent).toBe('Delta: 0.42. Gamma: 0.03');
    // Present with no hover at all — a description that needs a pointer is no
    // description.
    expect(getPanel()).toBeNull();
    dispose();
  });

  it('an explicit description wins over the derived entry text', () => {
    const { dispose, container } = renderTooltip({
      entries: { Delta: '0.42' },
      description: 'Rate of change of option price per $1 of underlying.',
      children: 'hover me',
    });
    expect(getDescriptionNode(container)!.textContent).toBe(
      'Rate of change of option price per $1 of underlying.',
    );
    dispose();
  });

  it('extraContent-only with no description stays mouse-only (nothing to derive)', () => {
    const { dispose, container } = renderTooltip({
      entries: {},
      extraContent: 'prose',
      children: 'hover me',
    });
    expect(getWrapper(container).getAttribute('aria-describedby')).toBeNull();
    dispose();
  });

  it("merges aria-describedby onto the caller's own trigger element", () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const button = document.createElement('button');
    button.setAttribute('aria-describedby', 'caller-owned-id');
    const dispose = render(
      () => createComponent(KvTooltip, { entries: { Delta: '0.42' }, children: button }),
      container,
    );

    const descId = getWrapper(container).getAttribute('aria-describedby')!;
    const ids = button.getAttribute('aria-describedby')!.split(/\s+/);
    expect(ids).toContain('caller-owned-id'); // never clobbered
    expect(ids).toContain(descId);

    dispose();
    container.remove();
  });

  it('takes a tab stop only when the trigger has none of its own', () => {
    const plain = renderTooltip({ entries: { Delta: '0.42' }, children: 'text' });
    expect(getWrapper(plain.container).getAttribute('tabindex')).toBe('0');
    plain.dispose();

    const withButton = document.createElement('div');
    document.body.appendChild(withButton);
    const button = document.createElement('button');
    const dispose = render(
      () => createComponent(KvTooltip, { entries: { Delta: '0.42' }, children: button }),
      withButton,
    );
    // A wrapped button already stops the tab; a second stop around it is noise.
    expect(getWrapper(withButton).getAttribute('tabindex')).toBeNull();
    dispose();
    withButton.remove();
  });

  it('focus shows the panel and blur hides it', () => {
    const { dispose, container } = renderTooltip({
      entries: { Delta: '0.42' },
      children: 'text',
    });
    const wrapper = getWrapper(container);

    fireFocus(wrapper, 'focusin');
    expect(getPanel()).not.toBeNull();

    fireFocus(wrapper, 'focusout');
    expect(getPanel()).toBeNull();

    dispose();
  });

  it('Escape dismisses a visible panel', () => {
    const { dispose, container } = renderTooltip({
      entries: { Delta: '0.42' },
      interactive: true,
      children: 'text',
    });
    const wrapper = getWrapper(container);

    fireMouse(wrapper, 'mouseenter');
    expect(getPanel()).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(getPanel()).toBeNull();

    dispose();
  });

  it('hides the visible panel from AT while the hidden node carries the text', () => {
    const { dispose, container } = renderTooltip({
      entries: { Delta: '0.42' },
      children: 'text',
    });
    fireMouse(getWrapper(container), 'mouseenter');
    expect(getPanel()!.getAttribute('aria-hidden')).toBe('true');
    dispose();
  });

  it('describeTrigger={false} restores the 0.2.x mouse-only behaviour', () => {
    const { dispose, container } = renderTooltip({
      entries: { Delta: '0.42' },
      describeTrigger: false,
      children: 'text',
    });
    const wrapper = getWrapper(container);
    expect(wrapper.getAttribute('aria-describedby')).toBeNull();
    expect(wrapper.getAttribute('tabindex')).toBeNull();

    fireFocus(wrapper, 'focusin');
    expect(getPanel()).toBeNull();

    fireMouse(wrapper, 'mouseenter');
    expect(getPanel()!.getAttribute('aria-hidden')).toBeNull();

    dispose();
  });
});
