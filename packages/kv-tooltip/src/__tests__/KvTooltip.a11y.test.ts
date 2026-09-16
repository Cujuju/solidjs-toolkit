import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from 'solid-js/web';
import { createComponent, createSignal, Show, type JSX } from 'solid-js';
import { KvTooltip } from '../KvTooltip';
import { DEFAULT_ANCHOR_GAP_PX } from '../clamp';

/**
 * Accessibility contract: the portalled panel's `role="tooltip"` announces nothing, so a
 * hidden describedby node, focus/blur/Escape and tab-stop rules carry the tooltip.
 */

/** `createComponent` infers from Show's LAST (keyed) overload; pin the non-keyed one. */
const UnkeyedShow = Show as (props: {
  when: boolean;
  fallback: JSX.Element;
  children: JSX.Element;
}) => JSX.Element;

const GAP = DEFAULT_ANCHOR_GAP_PX;
/** The pointer coordinate `fireMouse` reports, in both axes. */
const POINTER_CLIENT_XY = 10;

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
  el.dispatchEvent(
    new MouseEvent(type, { bubbles: true, clientX: POINTER_CLIENT_XY, clientY: POINTER_CLIENT_XY }),
  );
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

  // Non-interactive panels do not freeze position, so only they expose re-anchoring.
  it.each([true, false])('focus moving into an extraContent control keeps the panel; leaving hides it (interactive=%s)', (interactive) => {
    const copy = document.createElement('button');
    copy.textContent = 'Copy';
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    const { dispose, container } = renderTooltip({
      entries: { Delta: '0.42' },
      interactive,
      extraContent: copy,
      children: 'text',
    });
    const wrapper = getWrapper(container);
    const triggerRect = { top: 200, bottom: 224, left: 300, right: 420 } as DOMRect;
    wrapper.getBoundingClientRect = () => triggerRect;
    copy.getBoundingClientRect = () => ({ top: 500, bottom: 520, left: 50, right: 90 }) as DOMRect;

    wrapper.focus();
    expect(getPanel()).not.toBeNull();

    copy.focus();
    expect(document.activeElement).toBe(copy);
    expect(getPanel()).not.toBeNull();
    // Focus within the panel must not re-anchor the panel to its own child.
    expect(getPanel()!.style.top).toBe(`${triggerRect.bottom + GAP}px`);
    expect(getPanel()!.style.left).toBe(`${triggerRect.left}px`);

    outside.focus();
    expect(getPanel()).toBeNull();

    dispose();
    outside.remove();
  });

  it('a focus show places the panel against the focused trigger, not a stale cursor point', () => {
    const rect = { top: 200, bottom: 224, left: 300, right: 420 } as DOMRect;
    const { dispose, container } = renderTooltip({ entries: { Delta: '0.42' }, children: 'text' });
    const wrapper = getWrapper(container);
    wrapper.getBoundingClientRect = () => rect;

    fireFocus(wrapper, 'focusin'); // never hovered: the cursor point is (0,0)
    expect(getPanel()!.style.top).toBe(`${rect.bottom + GAP}px`);
    expect(getPanel()!.style.left).toBe(`${rect.left}px`);

    dispose();
  });

  it('focus while the pointer is on the trigger keeps cursor placement', () => {
    // Clicking a hovered control focuses it; the panel must not jump.
    const OFFSET_X = 12;
    const OFFSET_Y = 16;
    const { dispose, container } = renderTooltip({ entries: { Delta: '0.42' }, children: 'text' });
    const wrapper = getWrapper(container);
    wrapper.getBoundingClientRect = () => ({ top: 200, bottom: 224, left: 300, right: 420 }) as DOMRect;

    fireMouse(wrapper, 'mouseenter');
    fireFocus(wrapper, 'focusin');
    expect(getPanel()!.style.left).toBe(`${POINTER_CLIENT_XY + OFFSET_X}px`);
    expect(getPanel()!.style.top).toBe(`${POINTER_CLIENT_XY + OFFSET_Y}px`);

    dispose();
  });

  it('re-wires aria-describedby when a Show-gated trigger swaps in', async () => {
    const [loaded, setLoaded] = createSignal(false);
    const button = document.createElement('button');
    const placeholder = document.createElement('span');
    const { dispose, container } = renderTooltip({
      entries: { Delta: '0.42' },
      get children() {
        return createComponent(UnkeyedShow, {
          get when() { return loaded(); },
          fallback: placeholder,
          children: button,
        });
      },
    });
    const descId = getWrapper(container).getAttribute('aria-describedby')!;
    expect(placeholder.getAttribute('aria-describedby')).toBe(descId);

    setLoaded(true);
    await Promise.resolve();
    expect(button.getAttribute('aria-describedby')).toBe(descId);
    // Removal is keyed to the element it was applied to.
    expect(placeholder.getAttribute('aria-describedby')).toBeNull();

    dispose();
  });

  it('does not rewrite the trigger aria-describedby across a show/hide cycle', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const button = document.createElement('button');
    const dispose = render(
      () => createComponent(KvTooltip, { entries: { Delta: '0.42' }, children: button }),
      container,
    );
    await Promise.resolve();

    const writes: MutationRecord[] = [];
    const spy = new MutationObserver((records) => writes.push(...records));
    spy.observe(button, { attributes: true, attributeFilter: ['aria-describedby'] });

    const wrapper = getWrapper(container);
    fireMouse(wrapper, 'mouseenter');
    expect(getPanel()).not.toBeNull();
    await Promise.resolve();
    fireMouse(wrapper, 'mouseleave');
    expect(getPanel()).toBeNull();
    await Promise.resolve();

    // Solid's Portal marker enters and leaves the wrapper on every show; the
    // trigger element itself never changed, so the id must not be re-applied.
    expect(writes).toHaveLength(0);
    expect(button.getAttribute('aria-describedby')).not.toBeNull();

    spy.disconnect();
    dispose();
    container.remove();
  });

  it('does not rewrite the trigger aria-describedby when entries tick with the same text', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const button = document.createElement('button');
    const [entries, setEntries] = createSignal<Record<string, string>>({ Delta: '0.42' });
    const dispose = render(
      () => createComponent(KvTooltip, { get entries() { return entries(); }, children: button }),
      container,
    );
    await Promise.resolve();

    const writes: MutationRecord[] = [];
    const spy = new MutationObserver((records) => writes.push(...records));
    spy.observe(button, { attributes: true, attributeFilter: ['aria-describedby'] });

    setEntries({ Delta: '0.42' });
    await Promise.resolve();
    setEntries({ Delta: '0.43' });
    await Promise.resolve();

    expect(writes).toHaveLength(0);
    expect(button.getAttribute('aria-describedby')).not.toBeNull();

    spy.disconnect();
    dispose();
    container.remove();
  });

  it('re-probes the AUTO tab stop when a focusable trigger appears or disappears', async () => {
    const [loaded, setLoaded] = createSignal(false);
    const { dispose, container } = renderTooltip({
      entries: { Delta: '0.42' },
      get children() {
        return createComponent(UnkeyedShow, {
          get when() { return loaded(); },
          fallback: document.createElement('span'),
          children: document.createElement('button'),
        });
      },
    });
    const wrapper = getWrapper(container);
    expect(wrapper.getAttribute('tabindex')).toBe('0');

    setLoaded(true);
    await Promise.resolve();
    expect(wrapper.getAttribute('tabindex')).toBeNull(); // one tab stop, the button's

    setLoaded(false);
    await Promise.resolve();
    expect(wrapper.getAttribute('tabindex')).toBe('0');  // reachable again

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

  // ─── wrapperLayout: the wrapper must not reflow or clip a control ────────

  it("default 'text' layout keeps the historical inline+ellipsis box", () => {
    const { dispose, container } = renderTooltip({ entries: { A: '1' }, children: 'text' });
    const style = getWrapper(container).style;
    expect(style.display).toBe('inline');
    expect(style.overflow).toBe('hidden');
    expect(style.textOverflow).toBe('ellipsis');
    dispose();
  });

  it("'control' layout drops the clip so a wrapped button keeps its own box", () => {
    const { dispose, container } = renderTooltip({
      entries: { A: '1' },
      wrapperLayout: 'control',
      children: 'x',
    });
    const style = getWrapper(container).style;
    expect(style.display).toBe('inline-flex');
    expect(style.overflow).toBe('');
    expect(style.textOverflow).toBe('');
    dispose();
  });

  it("'contents' layout removes the wrapper from layout and takes no tab stop", () => {
    const { dispose, container } = renderTooltip({
      entries: { A: '1' },
      wrapperLayout: 'contents',
      children: 'x',
    });
    const wrapper = getWrapper(container);
    expect(wrapper.style.display).toBe('contents');
    // A boxless wrapper cannot draw a focus ring, so the child owns the
    // keyboard path — see the wrapperLayout doc.
    expect(wrapper.getAttribute('tabindex')).toBeNull();
    // The description still exists; only the tab stop is delegated.
    expect(getDescriptionNode(container)).not.toBeNull();
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
