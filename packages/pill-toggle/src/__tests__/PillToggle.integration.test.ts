import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanupToggles, dotOf, dotX, renderToggle } from './_helpers';

/**
 * Integration tests: mount in jsdom and check the JSX wiring against the props contract.
 * `indeterminate` spans three layers (aria-checked, --tp-dot-x, the CSS selector), so helper
 * unit tests miss wiring drift.
 */

afterEach(cleanupToggles);

describe('PillToggle aria-checked contract', () => {
  it('aria-checked="false" when enabled=false (and not indeterminate)', () => {
    const { dispose, toggle } = renderToggle({ enabled: false, onToggle: () => {} });
    expect(toggle().getAttribute('aria-checked')).toBe('false');
    dispose();
  });

  it('aria-checked="true" when enabled=true (and not indeterminate)', () => {
    const { dispose, toggle } = renderToggle({ enabled: true, onToggle: () => {} });
    expect(toggle().getAttribute('aria-checked')).toBe('true');
    dispose();
  });

  it('aria-checked="mixed" when indeterminate=true (regardless of enabled)', () => {
    const { dispose, toggle } = renderToggle({ enabled: false, indeterminate: true, onToggle: () => {} });
    expect(toggle().getAttribute('aria-checked')).toBe('mixed');
    dispose();

    const r2 = renderToggle({ enabled: true, indeterminate: true, onToggle: () => {} });
    expect(r2.toggle().getAttribute('aria-checked')).toBe('mixed');
    r2.dispose();
  });
});

describe('PillToggle indeterminate behavior', () => {
  it('onToggle still fires on click when indeterminate (consumer decides target state)', () => {
    const onToggle = vi.fn();
    const { dispose, toggle } = renderToggle({ enabled: false, indeterminate: true, onToggle });
    toggle().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onToggle).toHaveBeenCalledTimes(1);
    dispose();
  });

  it('disabled suppresses onToggle even when indeterminate', () => {
    const onToggle = vi.fn();
    const { dispose, toggle } = renderToggle({
      enabled: false, indeterminate: true, disabled: true, onToggle,
    });
    toggle().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onToggle).not.toHaveBeenCalled();
    dispose();
  });

  it('Space key still triggers onToggle when indeterminate (matches role=switch spec)', () => {
    const onToggle = vi.fn();
    const { dispose, toggle } = renderToggle({ enabled: false, indeterminate: true, onToggle });
    toggle().dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(onToggle).toHaveBeenCalledTimes(1);
    dispose();
  });
});

describe('PillToggle dot geometry', () => {
  // Custom properties are stored unparsed, so --tp-dot-x reads back verbatim;
  // jsdom normalizes real properties' calc() (`calc(18px - 10px)` → `calc(8px)`).
  const dot = dotOf;

  it('numeric props keep pixel geometry (md preset)', () => {
    const { dispose, toggle } = renderToggle({ enabled: true, onToggle: () => {} });
    expect(dot(toggle()).style.top).toBe('2px');
    expect(dotX(toggle())).toBe('16px');
    dispose();
  });

  it('the default dot carries no inline size — the stylesheet sizes it', () => {
    const { dispose, toggle } = renderToggle({ enabled: false, height: '40px', onToggle: () => {} });
    expect(dot(toggle()).style.width).toBe('');
    expect(dot(toggle()).style.height).toBe('');
    dispose();
  });

  it('percentage height: dot size and both stops stay relative to the pill', () => {
    // F098: embedding the raw '50%' in the dot's width resolved it against the
    // pill's parent. The dot now sizes itself, so '100%' means the dot's own width.
    const off = renderToggle({ enabled: false, height: '50%', onToggle: () => {} });
    expect(dot(off.toggle()).style.width).toBe('');
    expect(dot(off.toggle()).style.top).toBe('2px');
    expect(dotX(off.toggle())).toBe('2px');
    off.dispose();

    const on = renderToggle({ enabled: true, height: '50%', onToggle: () => {} });
    expect(dotX(on.toggle())).toBe('calc(32px - 100% - 2px)');
    on.dispose();

    const mixed = renderToggle({ enabled: false, indeterminate: true, height: '50%', onToggle: () => {} });
    expect(dotX(mixed.toggle())).toBe('calc((32px - 100%) / 2)');
    mixed.dispose();
  });

  it('string width positions the ON dot against the given pill width, not the preset', () => {
    const { dispose, toggle } = renderToggle({ enabled: true, width: '64px', onToggle: () => {} });
    expect(dotX(toggle())).toBe('calc(64px - 14px - 2px)');
    dispose();
  });

  it('string dotSize is subtracted from the ON position', () => {
    const { dispose, toggle } = renderToggle({ enabled: true, dotSize: '24px', onToggle: () => {} });
    expect(dotX(toggle())).toBe('calc(32px - 24px - calc((18px - 24px) / 2))');
    dispose();
  });

  it('explicit dotSize is inset equally on both axes (stadium tangent)', () => {
    // F073: the vertical centering and the horizontal stops share one inset.
    const { dispose, toggle } = renderToggle({ enabled: false, size: 'md', dotSize: 10, onToggle: () => {} });
    expect(dot(toggle()).style.top).toBe('4px');
    expect(dotX(toggle())).toBe('4px');
    dispose();
  });

  it('the dot slides via transform, never via left (compositor-only animation)', () => {
    const { dispose, toggle } = renderToggle({ enabled: true, onToggle: () => {} });
    expect(dot(toggle()).style.left).toBe('');
    expect(dot(toggle()).style.transform).toBe('');
    dispose();
  });
});

describe('PillToggle keyboard contract', () => {
  // jsdom does not synthesize a button's native Enter → click activation, so
  // the contract is asserted as "keydown default cancelled, onToggle not called".
  it('Enter does not toggle and cancels the native button activation', () => {
    const onToggle = vi.fn();
    const { dispose, toggle } = renderToggle({ enabled: false, onToggle });
    const ev = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    toggle().dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(onToggle).not.toHaveBeenCalled();
    dispose();
  });
});

describe('PillToggle visual state precedence', () => {
  it('loading takes precedence over indeterminate (spinner shows, indeterminate icon does not)', () => {
    const { dispose, toggle } = renderToggle({
      enabled: false, indeterminate: true, loading: true, onToggle: () => {},
    });
    // loading shows the spinner; the indeterminate visual is the centered dim dot,
    // but loading's spinner appears INSIDE the dot — they coexist visually but
    // aria-busy=true signals the loading takeover.
    expect(toggle().getAttribute('aria-busy')).toBe('true');
    expect(toggle().getAttribute('aria-checked')).toBe('mixed');
    expect(toggle().querySelector('.ctp-spinner')).not.toBeNull();
    dispose();
  });
});
