import type { NoticeStyle } from './types';

export interface Rect { x: number; y: number; width: number; height: number }
export interface DisplayArea { bounds: Rect; workArea: Rect }

/**
 * Bounds flush with the work area: drip at top centre, other styles nearest the tray.
 */
export function overlayBounds(style: NoticeStyle, size: { width: number; height: number }, display: DisplayArea): Rect {
  const { bounds: b, workArea: a } = display;
  const width = Math.min(Math.round(size.width), a.width);
  const height = Math.min(Math.round(size.height), a.height);
  if (style === 'drip') return { x: a.x + Math.round((a.width - width) / 2), y: a.y, width, height };
  const barOnLeft = a.x > b.x;
  const barOnTop = a.y > b.y;
  return {
    x: barOnLeft ? a.x : a.x + a.width - width,
    y: barOnTop ? a.y : a.y + a.height - height,
    width,
    height,
  };
}
