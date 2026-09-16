import { describe, it, expect, afterEach } from 'vitest';
import { render } from 'solid-js/web';
import { createComponent, createSignal } from 'solid-js';
import { Collapsible } from '../Collapsible';

/**
 * JSX contract the CSS animation needs: `.ccl-content-wrapper` always rendered, `data-animated`
 * and `data-open` on the root. Renaming either breaks the animation silently.
 */

function renderCollapsible(props: Parameters<typeof Collapsible>[0]): {
  dispose: () => void;
  container: HTMLDivElement;
} {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const dispose = render(() => createComponent(Collapsible, props), container);
  return {
    dispose: () => { dispose(); container.remove(); },
    container,
  };
}

afterEach(() => {
  document.querySelectorAll('.ccl-root').forEach((el) => el.remove());
});

describe('Collapsible CSS-animation contract', () => {
  it('always renders the .ccl-content-wrapper when content is rendered', () => {
    const { dispose, container } = renderCollapsible({
      title: 'X',
      defaultOpen: true,
      children: 'content',
    });
    const wrapper = container.querySelector('.ccl-content-wrapper');
    expect(wrapper).not.toBeNull();
    expect(wrapper!.querySelector('.ccl-content')).not.toBeNull();
    dispose();
  });

  it('data-animated="true" appears on the root when animated=true', () => {
    const { dispose, container } = renderCollapsible({
      title: 'X',
      defaultOpen: true,
      animated: true,
      children: 'content',
    });
    const root = container.querySelector('.ccl-root');
    expect(root!.getAttribute('data-animated')).toBe('true');
    dispose();
  });

  it('data-animated="false" appears on the root when animated is unset', () => {
    const { dispose, container } = renderCollapsible({
      title: 'X',
      defaultOpen: true,
      children: 'content',
    });
    const root = container.querySelector('.ccl-root');
    expect(root!.getAttribute('data-animated')).toBe('false');
    dispose();
  });

  it('data-open reflects the open state', () => {
    const { dispose, container } = renderCollapsible({
      title: 'X',
      defaultOpen: false,
      animated: true,
      children: 'content',
    });
    const root = container.querySelector('.ccl-root');
    expect(root!.getAttribute('data-open')).toBe('false');
    const header = root!.querySelector('.ccl-header') as HTMLButtonElement;
    header.click();
    expect(root!.getAttribute('data-open')).toBe('true');
    dispose();
  });

  it('does NOT set inline max-height style on .ccl-content (replaced by CSS grid-rows)', () => {
    // Regression lock: the old inline max-height none ↔ 0px snapped instead of animating; CSS
    // grid rows own it now.
    const { dispose, container } = renderCollapsible({
      title: 'X',
      defaultOpen: true,
      animated: true,
      children: 'content',
    });
    const content = container.querySelector('.ccl-content') as HTMLElement;
    expect(content.style.maxHeight).toBe('');
    dispose();
  });
});

describe('Collapsible mount / a11y contract', () => {
  const header = (c: HTMLElement): HTMLButtonElement => c.querySelector('.ccl-header') as HTMLButtonElement;

  it('lazyMount + keepMounted={false} unmounts content on close after the first open', () => {
    const { dispose, container } = renderCollapsible({
      title: 'X',
      lazyMount: true,
      keepMounted: false,
      defaultOpen: true,
      children: 'body',
    });
    expect(container.querySelector('.ccl-content')).not.toBeNull();
    header(container).click();
    expect(container.querySelector('.ccl-content')).toBeNull();
    dispose();
  });

  it('lazyMount keeps content mounted but hidden on close after the first open', () => {
    const { dispose, container } = renderCollapsible({
      title: 'X',
      lazyMount: true,
      defaultOpen: false,
      children: 'body',
    });
    expect(container.querySelector('.ccl-content')).toBeNull();
    header(container).click();
    header(container).click();
    const wrapper = container.querySelector('.ccl-content-wrapper') as HTMLElement;
    expect(wrapper).not.toBeNull();
    expect(wrapper.hidden).toBe(true);
    dispose();
  });

  it('omits aria-controls while the controlled content is not in the document', () => {
    const { dispose, container } = renderCollapsible({
      title: 'X',
      lazyMount: true,
      defaultOpen: false,
      children: 'body',
    });
    expect(header(container).hasAttribute('aria-controls')).toBe(false);
    header(container).click();
    const controlled = header(container).getAttribute('aria-controls');
    expect(controlled).not.toBeNull();
    expect(document.getElementById(controlled!)).not.toBeNull();
    dispose();
  });

  it('animated + collapsed makes the mounted content inert', () => {
    const { dispose, container } = renderCollapsible({
      title: 'X',
      animated: true,
      defaultOpen: false,
      children: 'body',
    });
    // Solid writes the `inert` IDL property; jsdom 24 lacks its attribute reflection, so assert the property.
    const wrapper = container.querySelector('.ccl-content-wrapper') as HTMLElement;
    expect(wrapper.inert).toBe(true);
    header(container).click();
    expect(wrapper.inert).toBe(false);
    dispose();
  });

  it('invokes the current onChange prop, not the one captured at mount', () => {
    const calls: string[] = [];
    const [cb, setCb] = createSignal<(open: boolean) => void>(() => calls.push('A'));
    const { dispose, container } = renderCollapsible({
      title: 'X',
      defaultOpen: false,
      children: 'body',
      get onChange() { return cb(); },
    });
    header(container).click();
    setCb(() => () => calls.push('B'));
    header(container).click();
    expect(calls).toEqual(['A', 'B']);
    dispose();
  });

  it('derives header/content ids from the current id prop', () => {
    const [id, setId] = createSignal('a');
    const { dispose, container } = renderCollapsible({
      title: 'X',
      defaultOpen: true,
      children: 'body',
      get id() { return id(); },
    });
    const content = container.querySelector('.ccl-content') as HTMLElement;
    expect(header(container).id).toBe('a-header');
    expect(content.id).toBe('a-content');
    setId('b');
    expect(header(container).id).toBe('b-header');
    expect(header(container).getAttribute('aria-controls')).toBe('b-content');
    expect(content.id).toBe('b-content');
    expect(content.getAttribute('aria-labelledby')).toBe('b-header');
    dispose();
  });

  it('gives the root a nameable role only when ariaLabel is set', () => {
    const labelled = renderCollapsible({ title: 'X', ariaLabel: 'Saved filters', children: 'body' });
    const root = labelled.container.querySelector('.ccl-root') as HTMLElement;
    expect(root.getAttribute('role')).toBe('group');
    expect(root.getAttribute('aria-label')).toBe('Saved filters');
    labelled.dispose();

    const plain = renderCollapsible({ title: 'X', children: 'body' });
    expect(plain.container.querySelector('.ccl-root')!.hasAttribute('role')).toBe(false);
    plain.dispose();
  });
});
