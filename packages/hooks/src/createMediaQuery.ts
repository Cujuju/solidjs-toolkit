import { createSignal, type Accessor } from 'solid-js';
import { safeAddEventListener } from './_internal/safeEvent';

/**
 * Reactive media query matcher.
 *
 * @example
 *   const isWide = createMediaQuery('(min-width: 768px)');
 *   <Show when={isWide()}>Wide layout</Show>
 */
export function createMediaQuery(query: string): Accessor<boolean> {
  // SSR / non-browser guard — `matchMedia` is not on the standard SSR globals.
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    const [value] = createSignal(false);
    return value;
  }

  const mql = window.matchMedia(query);
  const [matches, setMatches] = createSignal(mql.matches);

  const listener = (e: Event): void => {
    setMatches((e as MediaQueryListEvent).matches);
  };

  safeAddEventListener(mql, 'change', listener);

  return matches;
}
