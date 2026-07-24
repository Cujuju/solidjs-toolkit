import type { JSX } from 'solid-js';

/** Chevron. Rotated by CSS when open, so there is one glyph, not two. */
export function Chevron(): JSX.Element {
  return (
    <svg class="vsa-chevron" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M4 2.5 L8 6 L4 9.5" fill="none" stroke="currentColor" stroke-width="1.6" />
    </svg>
  );
}

/** Pushpin. Upright = pinned, tilted 45° by CSS = unpinned, matching VS. */
export function Pin(): JSX.Element {
  return (
    <svg class="vsa-pin-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M9.5 1.5 L14.5 6.5 L12.6 7.2 L11.8 9.6 L6.4 4.2 L8.8 3.4 Z" fill="currentColor" />
      <path d="M6.4 4.2 L11.8 9.6 L8.6 10.6 L5.4 7.4 Z" fill="currentColor" opacity="0.55" />
      <path d="M6 10 L1.5 14.5" stroke="currentColor" stroke-width="1.4" fill="none" />
    </svg>
  );
}

/** Close (×) for a horizontal column's title bar. */
export function Close(): JSX.Element {
  return (
    <svg class="vsa-close-icon" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M3 3 L9 9 M9 3 L3 9" stroke="currentColor" stroke-width="1.4" fill="none" />
    </svg>
  );
}
