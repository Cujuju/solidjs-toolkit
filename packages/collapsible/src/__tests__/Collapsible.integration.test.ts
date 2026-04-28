import { describe, it, expect, afterEach } from 'vitest';
import { render } from 'solid-js/web';
import { createComponent } from 'solid-js';
import { Collapsible } from '../Collapsible';

/**
 * Integration tests for the JSX wiring.
 *
 * The pure animation logic now lives in CSS (grid-template-rows 0fr ↔ 1fr
 * driven by data-animated and data-open attributes); there is no JS-side
 * measurement to test. These tests verify the JSX contract that the CSS
 * needs to function:
 *
 *  - The wrapper element with class `.ccl-content-wrapper` is always
 *    rendered when content is rendered.
 *  - `data-animated` reflects the prop on the root.
 *  - `data-open` reflects the open state on the root.
 *
 * If either attribute is renamed or the wrapper is removed, the CSS
 * animation breaks silently. These tests prevent that drift.
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
    // Regression lock: the prior buggy implementation set
    // style="max-height: none" on open and "max-height: 0px" on close —
    // a non-animatable transition that snapped instead of animating.
    // After the fix, no inline max-height style should appear; CSS owns
    // the animation entirely via grid-template-rows on the wrapper.
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
