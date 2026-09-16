import { render } from 'solid-js/web';
import { createComponent } from 'solid-js';
import { PillToggle } from '../PillToggle';

/** Shared mount helper for the pill-toggle test files (not a test file itself). */
export function renderToggle(props: Parameters<typeof PillToggle>[0]): {
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

/** Sweep any toggle a failing test left mounted. Use as `afterEach(cleanupToggles)`. */
export function cleanupToggles(): void {
  document.querySelectorAll('.ctp-root').forEach((el) => el.remove());
}

export const dotOf = (toggle: HTMLButtonElement): HTMLElement =>
  toggle.querySelector('.ctp-dot') as HTMLElement;

/** Inline value of the custom property the stylesheet feeds into translateX(). */
export const dotX = (toggle: HTMLButtonElement): string =>
  dotOf(toggle).style.getPropertyValue('--tp-dot-x');
