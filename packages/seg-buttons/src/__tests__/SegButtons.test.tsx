/**
 * SegGroup + SegButton: the controlled/uncontrolled context fork and radiogroup roving focus.
 * Uses `solid-js/web` render, not testing-library, which loads a second Solid and leaks Portals.
 */

import { describe, it, expect, afterEach, vi, onTestFinished } from 'vitest';
import { render, Portal } from 'solid-js/web';
import { createSignal, For, type JSX } from 'solid-js';
import { SegGroup } from '../SegGroup';
import { SegButton } from '../SegButton';
import {
  setSegTooltipHost,
  setSegTooltipDefaults,
  segTooltipDefaults,
  type SegTooltipHostProps,
} from '../tooltipHost';

let dispose: (() => void) | null = null;

function mount(ui: () => unknown): HTMLDivElement {
  const host = document.createElement('div');
  document.body.appendChild(host);
  dispose = render(ui as () => never, host);
  return host;
}

afterEach(() => {
  dispose?.();
  dispose = null;
  document.body.innerHTML = '';
});

const buttons = (c: HTMLElement): HTMLButtonElement[] =>
  [...c.querySelectorAll('.csb-btn')] as HTMLButtonElement[];
const group = (c: HTMLElement): HTMLElement => c.querySelector('.csb-group') as HTMLElement;
const click = (el: Element): boolean =>
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
const key = (el: EventTarget, k: string): boolean =>
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));

describe('uncontrolled mode (SegGroup has no `value`)', () => {
  it('a button drives its own `active` / `onClick` — the group provides no context', () => {
    const onClick = vi.fn();
    const c = mount(() => (
      <SegGroup ariaLabel="Side">
        <SegButton label="Buy" active onClick={onClick} />
        <SegButton label="Sell" onClick={onClick} />
      </SegGroup>
    ));

    expect(buttons(c)[0].getAttribute('aria-pressed')).toBe('true');
    expect(buttons(c)[1].getAttribute('aria-pressed')).toBe('false');

    click(buttons(c)[1]);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('a `value` on the button is INERT without a value on the group', () => {
    // Fork is `ctx?.controlled && props.value !== undefined`: `value` on buttons but not the group
    // silently goes uncontrolled. Pinned because it fails quietly.
    const onChange = vi.fn();
    const onClick = vi.fn();
    const c = mount(() => (
      <SegGroup onChange={onChange}>
        <SegButton value="buy" label="Buy" onClick={onClick} />
      </SegGroup>
    ));

    click(buttons(c)[0]);
    expect(onChange).not.toHaveBeenCalled(); // not controlled -> group's onChange never runs
    expect(onClick).toHaveBeenCalledTimes(1); // falls back to the button's own handler
  });
});

describe('controlled mode (SegGroup has a `value`)', () => {
  it('active state is read from the group, and clicking emits the button’s value', () => {
    const [value, setValue] = createSignal('buy');
    const c = mount(() => (
      <SegGroup value={value()} onChange={setValue} ariaLabel="Side">
        <SegButton value="buy" label="Buy" />
        <SegButton value="sell" label="Sell" />
      </SegGroup>
    ));

    expect(buttons(c)[0].getAttribute('aria-pressed')).toBe('true');

    click(buttons(c)[1]);
    expect(value()).toBe('sell');
    expect(buttons(c)[0].getAttribute('aria-pressed')).toBe('false');
    expect(buttons(c)[1].getAttribute('aria-pressed')).toBe('true');
  });

  it('the group’s value WINS over a button’s own `active` prop', () => {
    // Both are settable at once and they can disagree. Context must be authoritative, or a
    // stale `active` left behind during a refactor would quietly out-vote the real state.
    const c = mount(() => (
      <SegGroup value="sell" onChange={() => {}}>
        <SegButton value="buy" label="Buy" active />
        <SegButton value="sell" label="Sell" />
      </SegGroup>
    ));

    expect(buttons(c)[0].getAttribute('aria-pressed')).toBe('false');
    expect(buttons(c)[1].getAttribute('aria-pressed')).toBe('true');
  });

  it('re-clicking the ALREADY-ACTIVE option still emits onChange', () => {
    // Documents, not endorses: no equality guard, so a re-click fires onChange; consumers must dedupe.
    const onChange = vi.fn();
    const c = mount(() => (
      <SegGroup value="buy" onChange={onChange}>
        <SegButton value="buy" label="Buy" />
      </SegGroup>
    ));

    click(buttons(c)[0]);
    click(buttons(c)[0]);
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenLastCalledWith('buy');
  });

  it('carries a non-string value type through onChange untouched', () => {
    const onChange = vi.fn();
    const c = mount(() => (
      <SegGroup<number> value={1} onChange={onChange}>
        <SegButton<number> value={1} label="one" />
        <SegButton<number> value={2} label="two" />
      </SegGroup>
    ));

    click(buttons(c)[1]);
    expect(onChange).toHaveBeenCalledWith(2);
  });
});

describe('disabled', () => {
  it('does not emit in controlled mode', () => {
    const onChange = vi.fn();
    const c = mount(() => (
      <SegGroup value="buy" onChange={onChange}>
        <SegButton value="sell" label="Sell" disabled />
      </SegGroup>
    ));

    click(buttons(c)[0]);
    expect(onChange).not.toHaveBeenCalled();
    expect(buttons(c)[0].disabled).toBe(true);
  });

  it('does not emit in uncontrolled mode', () => {
    const onClick = vi.fn();
    const c = mount(() => (
      <SegGroup>
        <SegButton label="Sell" disabled onClick={onClick} />
      </SegGroup>
    ));

    click(buttons(c)[0]);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('a11y roles', () => {
  it('group mode uses aria-pressed and NO radio role', () => {
    const c = mount(() => (
      <SegGroup value="a" onChange={() => {}} ariaLabel="Group">
        <SegButton value="a" label="A" />
      </SegGroup>
    ));

    expect(group(c).getAttribute('role')).toBe('group');
    expect(group(c).getAttribute('aria-label')).toBe('Group');
    expect(buttons(c)[0].getAttribute('role')).toBeNull();
    expect(buttons(c)[0].getAttribute('aria-pressed')).toBe('true');
    expect(buttons(c)[0].getAttribute('aria-checked')).toBeNull();
  });

  it('radiogroup mode uses role=radio + aria-checked, and a ROVING tabindex', () => {
    // Exactly one button may be tabbable, or the group swallows N tab stops instead of one.
    const c = mount(() => (
      <SegGroup value="b" onChange={() => {}} role="radiogroup" ariaLabel="Side">
        <SegButton value="a" label="A" />
        <SegButton value="b" label="B" />
        <SegButton value="c" label="C" />
      </SegGroup>
    ));

    expect(group(c).getAttribute('role')).toBe('radiogroup');
    expect(buttons(c).map((b) => b.getAttribute('role'))).toEqual(['radio', 'radio', 'radio']);
    expect(buttons(c).map((b) => b.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false']);
    expect(buttons(c).map((b) => b.tabIndex)).toEqual([-1, 0, -1]);
    expect(buttons(c)[0].getAttribute('aria-pressed')).toBeNull();
  });

  it('radio semantics need the GROUP’s role — an uncontrolled group is never a radiogroup', () => {
    // isRadio() requires ctx.controlled, which is false without a `value`. So role="radiogroup" on an
    // uncontrolled group silently produces plain buttons with no radio semantics at all.
    const c = mount(() => (
      <SegGroup role="radiogroup">
        <SegButton label="A" active />
      </SegGroup>
    ));

    expect(group(c).getAttribute('role')).toBe('radiogroup'); // the wrapper says radiogroup...
    expect(buttons(c)[0].getAttribute('role')).toBeNull(); // ...but the buttons are not radios
    expect(buttons(c)[0].getAttribute('aria-checked')).toBeNull();
  });
});

describe('radiogroup keyboard (roving focus)', () => {
  it('ArrowRight moves to the next option and SELECTS it', () => {
    const [value, setValue] = createSignal('a');
    const c = mount(() => (
      <SegGroup value={value()} onChange={setValue} role="radiogroup">
        <SegButton value="a" label="A" />
        <SegButton value="b" label="B" />
        <SegButton value="c" label="C" />
      </SegGroup>
    ));

    key(buttons(c)[0], 'ArrowRight');
    expect(value()).toBe('b');
    expect(document.activeElement).toBe(buttons(c)[1]);
  });

  it('ArrowLeft moves backwards', () => {
    const [value, setValue] = createSignal('c');
    const c = mount(() => (
      <SegGroup value={value()} onChange={setValue} role="radiogroup">
        <SegButton value="a" label="A" />
        <SegButton value="b" label="B" />
        <SegButton value="c" label="C" />
      </SegGroup>
    ));

    key(buttons(c)[2], 'ArrowLeft');
    expect(value()).toBe('b');
  });

  it('WRAPS at both ends rather than dead-ending', () => {
    const [value, setValue] = createSignal('a');
    const c = mount(() => (
      <SegGroup value={value()} onChange={setValue} role="radiogroup">
        <SegButton value="a" label="A" />
        <SegButton value="b" label="B" />
        <SegButton value="c" label="C" />
      </SegGroup>
    ));

    key(buttons(c)[0], 'ArrowLeft'); // off the front -> last
    expect(value()).toBe('c');

    key(buttons(c)[2], 'ArrowRight'); // off the end -> first
    expect(value()).toBe('a');
  });

  it('SKIPS a disabled option in both directions instead of dead-ending on it', () => {
    // Was a pinned defect: the handler stepped onto the disabled option, the browser dropped the
    // click, and ArrowRight appeared to do nothing. Disabled options are now filtered out.
    const [value, setValue] = createSignal('a');
    const c = mount(() => (
      <SegGroup value={value()} onChange={setValue} role="radiogroup">
        <SegButton value="a" label="A" />
        <SegButton value="b" label="B" disabled />
        <SegButton value="c" label="C" />
      </SegGroup>
    ));

    key(buttons(c)[0], 'ArrowRight');
    expect(value()).toBe('c');
    expect(document.activeElement).toBe(buttons(c)[2]);

    key(buttons(c)[2], 'ArrowLeft');
    expect(value()).toBe('a');
    expect(document.activeElement).toBe(buttons(c)[0]);
  });

  it('mirrors the arrows under dir="rtl", where the next DOM sibling is drawn to the LEFT', () => {
    // jsdom computes no `direction`, so the stub stands in for `[dir=rtl]`. Only the GROUP is
    // rtl: flex items are ordered by the container, not by the buttons' own direction.
    const realGetComputedStyle = window.getComputedStyle.bind(window);
    const spy = vi.spyOn(window, 'getComputedStyle').mockImplementation((el) =>
      el.classList.contains('csb-group')
        ? Object.assign(realGetComputedStyle(el), { direction: 'rtl' })
        : realGetComputedStyle(el),
    );
    onTestFinished(() => spy.mockRestore());
    const [value, setValue] = createSignal('b');
    const c = mount(() => (
      <div dir="rtl">
        <SegGroup value={value()} onChange={setValue} role="radiogroup">
          <SegButton value="a" label="A" />
          <SegButton value="b" label="B" />
          <SegButton value="c" label="C" />
        </SegGroup>
      </div>
    ));

    key(buttons(c)[1], 'ArrowRight');
    expect(value()).toBe('a');

    key(buttons(c)[0], 'ArrowLeft');
    expect(value()).toBe('b');
  });

  it('does not rove into a NESTED group’s buttons', () => {
    const [value, setValue] = createSignal('a');
    const c = mount(() => (
      <SegGroup value={value()} onChange={setValue} role="radiogroup">
        <SegButton value="a" label="A" />
        <SegGroup value="x" onChange={() => {}} role="radiogroup">
          <SegButton value="x" label="X" />
        </SegGroup>
        <SegButton value="b" label="B" />
      </SegGroup>
    ));

    key(buttons(c)[0], 'ArrowRight');
    expect(value()).toBe('b');
    expect(document.activeElement).toBe(buttons(c)[2]);
  });

  it('still roves when the buttons are PORTALED out of the group element', () => {
    // Context flows through the owner tree, so these are radios with no `.csb-group` ancestor;
    // roving falls back to the shared parent element.
    const [value, setValue] = createSignal('a');
    mount(() => (
      <SegGroup value={value()} onChange={setValue} role="radiogroup">
        <Portal>
          <SegButton value="a" label="A" />
          <SegButton value="b" label="B" />
        </Portal>
      </SegGroup>
    ));

    const portaled = buttons(document.body);
    expect(portaled.length).toBe(2);
    expect(portaled[0].closest('.csb-group')).toBeNull();

    key(portaled[0], 'ArrowRight');
    expect(value()).toBe('b');
    expect(document.activeElement).toBe(portaled[1]);
  });

  it('ignores the arrows entirely in plain group mode', () => {
    const onChange = vi.fn();
    const c = mount(() => (
      <SegGroup value="a" onChange={onChange}>
        <SegButton value="a" label="A" />
        <SegButton value="b" label="B" />
      </SegGroup>
    ));

    key(buttons(c)[0], 'ArrowRight');
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('sizing', () => {
  it('applies the size preset as a class', () => {
    const c = mount(() => (
      <SegGroup>
        <SegButton label="xs" size="xs" />
        <SegButton label="sm" size="sm" />
        <SegButton label="md" />
      </SegGroup>
    ));

    expect(buttons(c)[0].className).toContain('csb-btn-xs');
    expect(buttons(c)[1].className).toContain('csb-btn-sm');
    expect(buttons(c)[2].className).toContain('csb-btn-md'); // md is the default
  });

  it('raw overrides land as inline styles on top of the preset', () => {
    const c = mount(() => (
      <SegGroup>
        <SegButton label="A" height={30} paddingX={9} fontSize={15} minWidth={70} />
      </SegGroup>
    ));

    const b = buttons(c)[0];
    expect(b.style.height).toBe('30px');
    expect(b.style.paddingInlineStart).toBe('9px');
    expect(b.style.paddingInlineEnd).toBe('9px');
    expect(b.style.fontSize).toBe('15px');
    expect(b.style.minWidth).toBe('70px');
  });

  it('reserves bold width by default, so selecting an option does not reflow the group', () => {
    // The active label goes bold; without reserved width every sibling shifts sideways on click.
    const c = mount(() => (
      <SegGroup>
        <SegButton label="A" />
        <SegButton label="B" reserveBoldWidth={false} />
      </SegGroup>
    ));

    expect(buttons(c)[0].dataset.reserveBold).toBe('true');
    expect(buttons(c)[0].dataset.label).toBe('A'); // the CSS reserves width off this attribute
    expect(buttons(c)[1].dataset.reserveBold).toBeUndefined();
  });

  it('renders children in place of the label, keeping data-label for the width reservation', () => {
    const c = mount(() => (
      <SegGroup>
        <SegButton label="Buy">
          <span data-custom>custom</span>
        </SegButton>
      </SegGroup>
    ));

    expect(buttons(c)[0].querySelector('[data-custom]')).not.toBeNull();
    expect(buttons(c)[0].dataset.label).toBe('Buy');
  });
});

/**
 * `title` has two renderers (native or a registered host); callers never pick. A host must not
 * break direct-child CSS or DOM-walking roving focus.
 */
describe('tooltip host', () => {
  /** Props the fake host was last called with. Solid props are getters, so the
   *  object stays live; only scalars are read back. */
  let seen: SegTooltipHostProps | null = null;

  function FakeHost(props: SegTooltipHostProps): JSX.Element {
    seen = props;
    // `display: contents` mirrors what a real host does under `wrapperLayout`,
    // so the group's `> * > .csb-btn` rules are exercised on the real shape.
    return (
      <span data-fake-host style={{ display: 'contents' }}>
        {props.children}
      </span>
    );
  }

  const ORIGINAL_DEFAULTS = segTooltipDefaults();

  afterEach(() => {
    // Both are MODULE-level singletons: without this reset a registration leaks
    // into every later test in the file.
    setSegTooltipHost(null);
    setSegTooltipDefaults(ORIGINAL_DEFAULTS);
    seen = null;
  });

  it('renders a native `title` when no host is registered', () => {
    const c = mount(() => (
      <SegGroup>
        <SegButton label="A" title="Explain A" />
      </SegGroup>
    ));

    expect(buttons(c)[0].getAttribute('title')).toBe('Explain A');
    expect(c.querySelector('[data-fake-host]')).toBeNull();
  });

  it('renders NO wrapper and no title when there is no hint to give', () => {
    setSegTooltipHost(FakeHost);
    const c = mount(() => (
      <SegGroup>
        <SegButton label="A" />
      </SegGroup>
    ));

    expect(buttons(c)[0].getAttribute('title')).toBeNull();
    expect(c.querySelector('[data-fake-host]')).toBeNull();
    expect(seen).toBeNull();
  });

  it('routes the hint through a registered host INSTEAD of the native title — never both', () => {
    setSegTooltipHost(FakeHost);
    const c = mount(() => (
      <SegGroup>
        <SegButton label="A" title="Explain A" />
      </SegGroup>
    ));

    // The double-popup this indirection exists to prevent.
    expect(buttons(c)[0].getAttribute('title')).toBeNull();
    expect(c.querySelector('[data-fake-host]')).not.toBeNull();
    expect(buttons(c)[0].closest('[data-fake-host]')).not.toBeNull();
    expect(seen?.description).toBe('Explain A');
    // Required by SegGroup's layout — a host that boxes the button breaks the
    // joined-control look.
    expect(seen?.wrapperLayout).toBe('contents');
    expect(seen?.hideOnPointerDown).toBe(true);
  });

  it('upgrades ALREADY-MOUNTED buttons when the host is registered later', () => {
    // Registration order vs. render order is not something a consumer controls in
    // every framework entry point, so the host is a signal rather than a constant.
    const c = mount(() => (
      <SegGroup>
        <SegButton label="A" title="Explain A" />
      </SegGroup>
    ));
    expect(buttons(c)[0].getAttribute('title')).toBe('Explain A');

    setSegTooltipHost(FakeHost);

    expect(c.querySelector('[data-fake-host]')).not.toBeNull();
    expect(buttons(c)[0].getAttribute('title')).toBeNull();
  });

  it('passes the shared defaults, and lets a per-button prop override the delay', () => {
    setSegTooltipHost(FakeHost);
    setSegTooltipDefaults({ delayMs: 111, maxWidth: 222 });

    const c = mount(() => (
      <SegGroup>
        <SegButton label="A" title="Explain A" />
      </SegGroup>
    ));
    expect(seen?.showDelayMs).toBe(111);
    expect(seen?.maxWidth).toBe(222);
    expect(buttons(c).length).toBe(1);

    dispose?.();
    dispose = null;
    mount(() => (
      <SegGroup>
        <SegButton label="A" title="Explain A" tooltipDelayMs={7} />
      </SegGroup>
    ));
    expect(seen?.showDelayMs).toBe(7);
    expect(seen?.maxWidth).toBe(222); // width still comes from the shared default
  });

  it('keeps roving focus working when every button sits inside a host wrapper', () => {
    // Regression: the handler queried the button's PARENT, which under a host wrapper holds one
    // button, killing arrows. Now scoped to `.csb-group`.
    setSegTooltipHost(FakeHost);
    const [value, setValue] = createSignal('a');
    const c = mount(() => (
      <SegGroup value={value()} onChange={setValue} role="radiogroup">
        <SegButton value="a" label="A" title="a" />
        <SegButton value="b" label="B" title="b" />
        <SegButton value="c" label="C" title="c" />
      </SegGroup>
    ));

    expect(buttons(c).length).toBe(3);
    key(buttons(c)[0], 'ArrowRight');
    expect(value()).toBe('b');
    expect(document.activeElement).toBe(buttons(c)[1]);
  });
});

describe('controlled mode follows `value` after mount', () => {
  // Solid's Provider reads its `value` once, untracked. Deciding controlled-ness by swapping the
  // provided object froze it at mount; the flag must live on a stable context object instead.
  it('a group mounted with `value` undefined becomes controlled once a value arrives', () => {
    const [tf, setTf] = createSignal<string | undefined>(undefined);
    const c = mount(() => (
      <SegGroup value={tf()} onChange={setTf}>
        <SegButton value="day" label="Day" />
        <SegButton value="week" label="Week" />
      </SegGroup>
    ));

    setTf('day');
    expect(buttons(c).map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false']);

    click(buttons(c)[1]);
    expect(tf()).toBe('week');
    expect(buttons(c).map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
  });

  it('a group whose `value` becomes undefined falls back to the buttons’ own handlers', () => {
    const [v, setV] = createSignal<string | undefined>('buy');
    const onChange = vi.fn();
    const onClick = vi.fn();
    const c = mount(() => (
      <SegGroup value={v()} onChange={onChange}>
        <SegButton value="buy" label="Buy" onClick={onClick} />
      </SegGroup>
    ));

    setV(undefined);
    click(buttons(c)[0]);
    expect(onChange).not.toHaveBeenCalled();
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('radiogroup has exactly one tab stop while any option is enabled', () => {
  const tabbable = (c: HTMLElement): number[] => buttons(c).map((b) => b.tabIndex);

  it('falls back to the first option when the value matches none', () => {
    const [v, setV] = createSignal('');
    const c = mount(() => (
      <SegGroup value={v()} onChange={setV} role="radiogroup">
        <SegButton value="a" label="A" />
        <SegButton value="b" label="B" />
      </SegGroup>
    ));

    expect(tabbable(c)).toEqual([0, -1]);

    setV('b');
    expect(tabbable(c)).toEqual([-1, 0]);
  });

  it('skips disabled options — a disabled button cannot take focus, so it cannot be the stop', () => {
    const c = mount(() => (
      <SegGroup value="b" onChange={() => {}} role="radiogroup">
        <SegButton value="a" label="A" disabled />
        <SegButton value="b" label="B" disabled />
        <SegButton value="c" label="C" />
      </SegGroup>
    ));

    expect(tabbable(c)).toEqual([-1, -1, 0]);
  });

  it('has NO tab stop when every option is disabled — and the arrows are inert', () => {
    const onChange = vi.fn();
    const c = mount(() => (
      <SegGroup value="a" onChange={onChange} role="radiogroup">
        <SegButton value="a" label="A" disabled />
        <SegButton value="b" label="B" disabled />
      </SegGroup>
    ));

    expect(tabbable(c)).toEqual([-1, -1]);

    // Arrows on a disabled option do nothing: Solid's delegated handler skips disabled nodes
    // (web.js:491), and the `idx < 0` guard backs that up if the event ever arrives.
    const before = document.activeElement;
    key(buttons(c)[0], 'ArrowRight');
    expect(onChange).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(before);
  });

  it('follows DOM order, not mount order, when an option is inserted before the others', () => {
    const [opts, setOpts] = createSignal(['b', 'c']);
    const c = mount(() => (
      <SegGroup value="" onChange={() => {}} role="radiogroup">
        <For each={opts()}>{(o) => <SegButton value={o} label={o} />}</For>
      </SegGroup>
    ));

    setOpts(['a', 'b', 'c']);
    expect(buttons(c).map((b) => b.dataset.label)).toEqual(['a', 'b', 'c']);
    expect(tabbable(c)).toEqual([0, -1, -1]);
  });
});
