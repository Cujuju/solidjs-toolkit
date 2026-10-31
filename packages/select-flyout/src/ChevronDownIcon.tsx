import type { JSX } from 'solid-js';

/** Inline `chevron-down` glyph (lucide geometry) — avoids an icon-lib
 *  dependency for a single 14px icon. */
export function ChevronDownIcon(): JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

