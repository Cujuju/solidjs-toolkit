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
 * ── The pin, and why it is TWO glyphs rather than one rotated ───────────────
 *
 * Path data is Lucide's `pin` and `pin-off` (lucide-solid v1.24.0, ISC —
 * https://lucide.dev), inlined verbatim rather than imported: this package ships
 * dependency-free chrome, and pulling an icon set in for two glyphs would put a
 * dependency in every consumer's tree for 6 path strings.
 *
 * The previous glyph was hand-plotted and did not read as a pushpin at 13px. It
 * expressed "unpinned" by CSS-rotating itself 45°, which was a reasonable trick
 * for a shape with no unpinned variant, and is the wrong one here for two
 * reasons: Lucide's pin has a straight vertical shaft (`M12 17v5`) whose whole
 * legibility comes from being vertical, so rotating it reads as an icon knocked
 * askew rather than as a state; and Lucide already ships the negated glyph, where
 * the slash is its established idiom for "not this". Two glyphs also make the
 * state legible while the control is at rest, which a rotation only manages if
 * you know what the un-rotated one looks like.
 *
 * Kept at Lucide's own geometry — 24 viewBox, `stroke-width: 2`, round caps and
 * joins — because that is what makes it look like the rest of the icon set at
 * any size; the dock scales it with `--acc-pin-size`.
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
