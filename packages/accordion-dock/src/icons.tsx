import type { JSX } from 'solid-js';

/** Chevron. Rotated by CSS when open, so there is one glyph, not two. */
export function Chevron(): JSX.Element {
  return (
    <svg class="acc-chevron" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M4 2.5 L8 6 L4 9.5" fill="none" stroke="currentColor" stroke-width="1.6" />
    </svg>
  );
}

/*
 * Lucide `pin` / `pin-off` (v1.24.0, ISC), inlined to keep this package dependency-free.
 * Two glyphs, not one rotated. See DESIGN_NOTES.md § src/icons.tsx:12.
 */

/** Lucide `pin` — the PINNED state. */
export function Pin(): JSX.Element {
  return (
    <svg
      class="acc-pin-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M12 17v5" />
      <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
    </svg>
  );
}

/** Lucide `pin-off` — the UNPINNED state. */
export function PinOff(): JSX.Element {
  return (
    <svg
      class="acc-pin-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M12 17v5" />
      <path d="M15 9.34V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H7.89" />
      <path d="m2 2 20 20" />
      <path d="M9 9v1.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h11" />
    </svg>
  );
}

/** Close (×) for a horizontal column's title bar. */
export function Close(): JSX.Element {
  return (
    <svg class="acc-close-icon" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M3 3 L9 9 M9 3 L3 9" stroke="currentColor" stroke-width="1.4" fill="none" />
    </svg>
  );
}
