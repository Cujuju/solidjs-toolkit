import { onCleanup } from 'solid-js';

export const isBrowser = (): boolean => typeof window !== 'undefined';

/** SSR-safe listener removed with the reactive scope (duplicated from @cujuju/solidjs-hooks, CONTRIBUTING §1). */
export function safeAddEventListener(
  target: EventTarget | null | undefined,
  event: string,
  listener: EventListenerOrEventListenerObject,
  options?: boolean | AddEventListenerOptions,
): void {
  if (!isBrowser() || !target) return;
  target.addEventListener(event, listener, options);
  onCleanup(() => target.removeEventListener(event, listener, options));
}

/** A ResizeObserver, or null where there is none (SSR, old engines); disconnected with the reactive scope. */
export function safeResizeObserver(cb: ResizeObserverCallback): ResizeObserver | null {
  if (!isBrowser() || typeof ResizeObserver === 'undefined') return null;
  const ro = new ResizeObserver(cb);
  onCleanup(() => ro.disconnect());
  return ro;
}

export const nextFrame = (fn: () => void): void => void requestAnimationFrame(() => fn());

/** Rounds CSS px to the device pixel grid, so rows never straddle a pixel and blur or shimmer. */
export const toDevicePx = (px: number): number => {
  const dpr = (isBrowser() && window.devicePixelRatio) || 1;
  return Math.round(px * dpr) / dpr;
};

/** A row's layout height: border box, untouched by its translate. */
export const blockSize = (entry: ResizeObserverEntry): number => entry.borderBoxSize?.[0]?.blockSize ?? (entry.target as HTMLElement).offsetHeight;
