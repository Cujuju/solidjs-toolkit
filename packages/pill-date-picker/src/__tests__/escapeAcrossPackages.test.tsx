/**
 * One Escape-owner stack across PACKAGES: a date picker and an AnchoredPopover each bind Escape
 * to the DOCUMENT. Whichever opened LAST owns the key, and it dismisses exactly one layer.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { createSignal } from 'solid-js';
import { render } from 'solid-js/web';
import { ESCAPE_OWNERS_KEY } from '@cujuju/solidjs-hooks';
import { KvTooltip } from '@cujuju/solidjs-kv-tooltip';
import AnchoredPopover from '../../../anchored-popover/src/AnchoredPopover';
import { PillDatePicker } from '../PillDatePicker';

const escapeStack = (): unknown[] =>
  (globalThis as unknown as Record<symbol, { stack: unknown[] }>)[ESCAPE_OWNERS_KEY].stack;

// jsdom lacks the Popover API; the stub drives `:popover-open` off an attribute so the popover
// and the picker's panel can be asserted independently.
const originalMatches = HTMLElement.prototype.matches;
function installPopoverStubs(): void {
  const proto = HTMLElement.prototype as HTMLElement & {
    showPopover: () => void;
    hidePopover: () => void;
  };
  proto.showPopover = function showPopover(this: HTMLElement) {
    this.setAttribute('data-popover-open', '');
  };
  proto.hidePopover = function hidePopover(this: HTMLElement) {
    this.removeAttribute('data-popover-open');
  };
  HTMLElement.prototype.matches = function (this: HTMLElement, selectors: string): boolean {
    if (selectors === ':popover-open') return this.hasAttribute('data-popover-open');
    return originalMatches.call(this, selectors);
  };
}
function uninstallPopoverStubs(): void {
  HTMLElement.prototype.matches = originalMatches;
  delete (HTMLElement.prototype as Partial<HTMLElement & { showPopover: unknown }>).showPopover;
  delete (HTMLElement.prototype as Partial<HTMLElement & { hidePopover: unknown }>).hidePopover;
}

let dispose: (() => void) | null = null;
function mount(ui: () => any): void {
  installPopoverStubs();
  const host = document.createElement('div');
  document.body.appendChild(host);
  dispose = render(ui, host);
}
afterEach(() => {
  dispose?.();
  dispose = null;
  uninstallPopoverStubs();
  document.body.innerHTML = '';
});

const NOW = new Date(2026, 5, 13);
const LADDER = ['2026-06-19', '2026-06-26', '2026-07-02'];

const escape = (): KeyboardEvent => {
  const e = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  document.dispatchEvent(e);
  return e;
};
const click = (el: Element): boolean => el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
const pill = (): HTMLElement => document.body.querySelector('.cpdp-pill') as HTMLElement;
const ladders = (): HTMLElement[] => [
  ...document.body.querySelectorAll<HTMLElement>('.cpdp-popout'),
];
const popoverShown = (): boolean =>
  !!document.body.querySelector('.xpkg-body')?.closest('[data-popover-open]');

function Pair(props: { onPopoverDismiss: () => void }) {
  const [anchor, setAnchor] = createSignal<HTMLElement>();
  const [popoverOpen, setPopoverOpen] = createSignal(false);
  return (
    <>
      <button ref={setAnchor} type="button" class="xpkg-anchor" onClick={() => setPopoverOpen(true)}>
        anchor
      </button>
      <PillDatePicker items={LADDER} value={null} onChange={() => {}} now={NOW} />
      <AnchoredPopover
        open={popoverOpen}
        anchor={anchor}
        onDismiss={() => {
          props.onPopoverDismiss();
          setPopoverOpen(false);
        }}
      >
        <div class="xpkg-body">popover</div>
      </AnchoredPopover>
    </>
  );
}

describe('a date picker and an AnchoredPopover stacked together', () => {
  it('Escape dismisses only the popover when the popover opened last', () => {
    const popoverDismiss = vi.fn();
    mount(() => <Pair onPopoverDismiss={popoverDismiss} />);

    click(pill());
    click(document.body.querySelector('.xpkg-anchor')!);
    expect(ladders()).toHaveLength(1);
    expect(popoverShown()).toBe(true);
    expect(escapeStack(), 'the two packages kept separate stacks').toHaveLength(2);

    const e = escape();
    expect(e.defaultPrevented).toBe(true);
    expect(popoverDismiss).toHaveBeenCalledTimes(1);
    expect(popoverShown()).toBe(false);
    expect(ladders(), 'the picker underneath was dismissed by the same Escape').toHaveLength(1);

    // The picker is the top of the stack now, so the NEXT Escape takes it, and only it.
    expect(escape().defaultPrevented).toBe(true);
    expect(ladders()).toHaveLength(0);
    expect(popoverDismiss).toHaveBeenCalledTimes(1);
  });

  it('Escape dismisses only the picker when the picker opened last', () => {
    const popoverDismiss = vi.fn();
    mount(() => <Pair onPopoverDismiss={popoverDismiss} />);

    click(document.body.querySelector('.xpkg-anchor')!);
    click(pill());
    expect(popoverShown()).toBe(true);
    expect(ladders()).toHaveLength(1);

    const e = escape();
    expect(e.defaultPrevented).toBe(true);
    expect(ladders()).toHaveLength(0);
    expect(popoverDismiss, 'the popover underneath was dismissed too').not.toHaveBeenCalled();

    expect(escape().defaultPrevented).toBe(true);
    expect(popoverDismiss).toHaveBeenCalledTimes(1);
    expect(popoverShown()).toBe(false);
  });

  it('an Escape raised INSIDE the panel closes the picker without reaching an enclosing handler', () => {
    const outer = vi.fn();
    mount(() => (
      <div onKeyDown={outer}>
        <PillDatePicker items={LADDER} value={null} onChange={() => {}} now={NOW} />
      </div>
    ));

    click(pill());
    const e = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    ladders()[0].dispatchEvent(e);
    expect(ladders()).toHaveLength(0);
    expect(e.defaultPrevented).toBe(true);
    expect(outer, 'the enclosing handler also acted on a consumed Escape').not.toHaveBeenCalled();
  });
});

describe('a date picker with a tooltip shown after its ladder opened', () => {
  const rows = (): HTMLElement[] => [...document.body.querySelectorAll<HTMLElement>('.cpdp-row')];
  const arrowDown = (): boolean =>
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
    );

  it('keeps the ladder\'s navigation keys while the tooltip is showing', () => {
    mount(() => (
      <>
        <PillDatePicker items={LADDER} value={null} onChange={() => {}} now={NOW} />
        <KvTooltip entries={{ Bid: '1.00' }}>
          <span class="xpkg-neighbour">neighbour</span>
        </KvTooltip>
      </>
    ));

    click(pill());
    arrowDown(); // -> row 0
    // Hovering a neighbouring pill shows its tooltip above the open ladder.
    document.body
      .querySelector('.xpkg-neighbour')!
      .parentElement!.dispatchEvent(new MouseEvent('mouseenter'));
    expect(escapeStack(), 'the tooltip did not join the shared stack').toHaveLength(2);

    arrowDown(); // -> row 1
    expect(rows()[1].dataset.active, 'a shown tooltip killed the ladder\'s keys').toBe('true');

    // Escape still hides the tooltip alone.
    expect(escape().defaultPrevented).toBe(true);
    expect(escapeStack()).toHaveLength(1);
    expect(ladders()).toHaveLength(1);
  });
});
