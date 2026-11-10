import type { NoticePlacement, NoticePosition, NoticeStyle } from './types.js';
export interface Rect { x: number; y: number; width: number; height: number }
export interface DisplayArea { bounds: Rect; workArea: Rect }
export function resolvePlacement(style: NoticeStyle, position: NoticePosition, display?: DisplayArea): NoticePlacement {
  if (style === 'drip') return 'top-center';
  if (position !== 'auto') return position;
  if (!display) return 'bottom-right';
  const { bounds: b, workArea: a } = display;
  return `${a.y > b.y ? 'top' : 'bottom'}-${a.x > b.x ? 'left' : 'right'}`;
}
export function overlayBounds(placement: NoticePlacement, size: { width: number; height: number }, display: DisplayArea): Rect {
  const a = display.workArea;
  const width = Math.min(Math.round(size.width), a.width);
  const height = Math.min(Math.round(size.height), a.height);
  return {
    x: a.x + (placement.endsWith('center') ? Math.round((a.width - width) / 2) : placement.endsWith('left') ? 0 : a.width - width),
    y: a.y + (placement.startsWith('top') ? 0 : a.height - height), width, height,
  };
}
