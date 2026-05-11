import type { JSX } from 'solid-js';

/**
 * Inline SVG icons used by EditableListRow. Bundled to avoid an icon-library
 * dependency. Sized 12-14px to match the row's compact density.
 *
 * Paths are lifted from the Lucide icon set (MIT-licensed) — pencil, trash-2,
 * grip-vertical. Stroke-based, currentColor-inheriting, so consumers control
 * color via parent text-color.
 */

const STROKE_PROPS = {
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': '2',
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
} as const;

export function PencilIcon(props: { size?: number }): JSX.Element {
  const size = props.size ?? 12;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      {...STROKE_PROPS}
      aria-hidden="true"
    >
      <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
      <path d="m15 5 4 4" />
    </svg>
  );
}

export function Trash2Icon(props: { size?: number }): JSX.Element {
  const size = props.size ?? 12;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      {...STROKE_PROPS}
      aria-hidden="true"
    >
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

export function GripVerticalIcon(props: { size?: number }): JSX.Element {
  const size = props.size ?? 14;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      {...STROKE_PROPS}
      aria-hidden="true"
    >
      <circle cx="9" cy="5" r="1" />
      <circle cx="9" cy="12" r="1" />
      <circle cx="9" cy="19" r="1" />
      <circle cx="15" cy="5" r="1" />
      <circle cx="15" cy="12" r="1" />
      <circle cx="15" cy="19" r="1" />
    </svg>
  );
}
