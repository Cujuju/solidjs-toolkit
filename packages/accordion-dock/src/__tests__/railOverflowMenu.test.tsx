import { describe, expect, it } from 'vitest';
import { render } from 'solid-js/web';
import { RailOverflowMenu } from '../RailOverflowMenu';
import { createStubGroup } from './stubGroup';

/**
 * The `⋯` trigger is a TOGGLE (`aria-expanded`). ContextMenu dismisses on document
 * `mousedown`, and the trigger opened on the following `click`, so it could never close.
 */

/** The menu surface `ContextMenu` renders, Portal'd to <body>. */
const MENU_SELECTOR = '.cujuju-context-menu';

function mount(ids: readonly string[]) {
  const { group } = createStubGroup({ panels: ids.map((id) => ({ id, title: id })) });
  const container = document.createElement('div');
  document.body.appendChild(container);

  const dispose = render(() => <RailOverflowMenu group={group} ids={() => ids} />, container);
  const trigger = container.querySelector<HTMLElement>('.acc-rail-overflow');
  if (trigger === null) throw new Error('the overflow trigger did not render');

  return {
    trigger,
    menuOpen: (): boolean => document.querySelector(MENU_SELECTOR) !== null,
    dispose: () => {
      dispose();
      container.remove();
    },
  };
}

/** One real mouse press on the trigger: `mousedown` (which is what the open menu
 *  dismisses on) followed by the `click` it produces. */
function pressWithMouse(el: HTMLElement): void {
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  // `detail: 1` is what a real pointer-driven click carries; a keyboard
  // activation reports 0, and the trigger has to tell them apart.
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
}

/** Enter/Space on a focused button: a `click` with no press behind it. */
function pressWithKeyboard(el: HTMLElement): void {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
}

describe('the ⋯ trigger closes the menu it opened', () => {
  it('opens on the first press and closes on the second', () => {
    const m = mount(['a', 'b']);

    pressWithMouse(m.trigger);
    expect(m.menuOpen()).toBe(true);

    pressWithMouse(m.trigger);
    expect(m.menuOpen()).toBe(false);
    expect(m.trigger.getAttribute('aria-expanded')).toBe('false');

    m.dispose();
  });

  it('reopens on the press after that, rather than latching shut', () => {
    const m = mount(['a', 'b']);

    pressWithMouse(m.trigger);
    pressWithMouse(m.trigger);
    pressWithMouse(m.trigger);
    expect(m.menuOpen()).toBe(true);

    m.dispose();
  });

  it('still opens from the keyboard, which fires click with no mousedown', () => {
    const m = mount(['a', 'b']);

    pressWithKeyboard(m.trigger);
    expect(m.menuOpen()).toBe(true);

    m.dispose();
  });

  it('a mouse press that never became a click does not swallow the next keypress', () => {
    const m = mount(['a', 'b']);

    pressWithMouse(m.trigger);
    // Pressed on the trigger, released elsewhere: the menu is dismissed by the
    // document handler and no `click` is ever delivered here.
    m.trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(m.menuOpen()).toBe(false);

    pressWithKeyboard(m.trigger);
    expect(m.menuOpen()).toBe(true);

    m.dispose();
  });

  it('still closes on a press somewhere else', () => {
    const m = mount(['a', 'b']);

    pressWithMouse(m.trigger);
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(m.menuOpen()).toBe(false);

    m.dispose();
  });
});
