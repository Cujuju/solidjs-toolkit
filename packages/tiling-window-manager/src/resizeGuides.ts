import { computeTileLayout, type LayoutHandle, type LayoutRect, type TileLayoutOptions, type TileSize } from './layout';
import type { TileNode } from './tileTree';

/**
 * Pointer distance at which a divider locks onto another layout's divider.
 * About one 0.5% step of a 1280px split, so a guide never hides more than one step.
 */
export const GUIDE_SNAP_PX = 6;

/** Another layout whose dividers a drag lines up with, such as a sibling workspace. */
export interface AlignLayout { name: string; layout: TileNode | undefined }
export interface ResizeGuide { positionPx: number; name: string }

/** Centre of a handle along the axis it moves on. */
export function handleCentre(handle: Pick<LayoutHandle, 'rect' | 'split'>): number {
  const { rect } = handle;
  return handle.split.dir === 'row' ? rect.x + rect.width / 2 : rect.y + rect.height / 2;
}

function crossOverlaps(a: LayoutRect, b: LayoutRect, dir: 'row' | 'column'): boolean {
  return dir === 'row' ? a.y < b.y + b.height && b.y < a.y + a.height : a.x < b.x + b.width && b.x < a.x + a.width;
}

/** Same-axis dividers of the other layouts, laid out at this workspace's size, that span the dragged one. */
export function resizeGuides(
  others: readonly AlignLayout[], handle: LayoutHandle, size: TileSize, options: (layout: TileNode) => TileLayoutOptions,
): ResizeGuide[] {
  const dir = handle.split.dir;
  return others.flatMap((other) => {
    if (!other.layout) return [];
    return computeTileLayout(other.layout, size, options(other.layout)).handles
      .filter((entry) => entry.split.dir === dir && crossOverlaps(entry.rect, handle.rect, dir))
      .map((entry) => ({ positionPx: handleCentre(entry), name: other.name }));
  });
}

/** The guide closest to `positionPx` within the snap distance. */
export function nearestGuide(guides: readonly ResizeGuide[], positionPx: number): ResizeGuide | undefined {
  let best: ResizeGuide | undefined;
  for (const guide of guides) {
    const distance = Math.abs(guide.positionPx - positionPx);
    if (distance <= GUIDE_SNAP_PX && (!best || distance < Math.abs(best.positionPx - positionPx))) best = guide;
  }
  return best;
}
