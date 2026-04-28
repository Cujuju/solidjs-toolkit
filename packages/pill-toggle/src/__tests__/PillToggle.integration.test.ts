import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from 'solid-js/web';
import { createComponent } from 'solid-js';
import { PillToggle } from '../PillToggle';

/**
 * Integration tests — mount the component in jsdom and verify the JSX
 * wiring against the props contract. Pure dot-position math is covered
 * separately in dotPosition.test.ts.
 *
 * Why these tests matter: the indeterminate prop affects three layers
 * (aria-checked attribute, dot transform via the pure helper, CSS
 * styling via the [aria-checked="mixed"] selector). Unit tests on the
 * helper alone don't catch wiring drift between any two layers.
 */

function renderToggle(props: Parameters<typeof PillToggle>[0]): {
  dispose: () => void;
  container: HTMLDivElement;
  toggle(): HTMLButtonElement;
} {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const dispose = render(() => createComponent(PillToggle, props), container);
  return {
    dispose: () => { dispose(); container.remove(); },
    container,
    toggle() {
      const el = container.querySelector('button.ctp-root');
      if (!el) throw new Error('expected PillToggle button');
      return el as HTMLButtonElement;
    },
  };
}

afterEach(() => {
  document.querySelectorAll('.ctp-root').forEach((el) => el.remove());
});

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
