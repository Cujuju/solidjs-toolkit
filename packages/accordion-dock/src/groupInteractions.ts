import { createReorderList } from '@cujuju/solid-reorder-list';
import { type AccordionOrientation, type AccordionRailSide } from './context';
import { createGroupActions } from './groupActions';
import { createGroupOrder } from './groupOrder';
import { createGroupState } from './groupState';
import { createRailOverflow } from './railOverflow';
import { createResize, DEFAULT_MIN_SIZE_PX } from './resize';
import { repinToVisualOrder } from './visualOrder';

export function createGroupInteractions(deps: {
  getRailOverflow: () => ReturnType<typeof createRailOverflow>;
  orientation: () => AccordionOrientation;
  railSide: () => AccordionRailSide;
  visualOpenIds: ReturnType<typeof createGroupOrder>['visualOpenIds'];
  panelEls: ReturnType<typeof createGroupState>['panelEls'];
  metaOf: ReturnType<typeof createGroupState>['metaOf'];
  sizes: ReturnType<typeof createGroupState>['sizes'];
  setSizesRaw: ReturnType<typeof createGroupState>['setSizesRaw'];
  commitSizes: ReturnType<typeof createGroupActions>['commitSizes'];
  isLeaf: ReturnType<typeof createGroupState>['isLeaf'];
  setOpen: ReturnType<typeof createGroupActions>['setOpen'];
  panels: ReturnType<typeof createGroupState>['panels'];
  REORDER_SKIP_SELECTOR: '[data-no-drag]';
  moveTo: ReturnType<typeof createGroupActions>['moveTo'];
  orderIds: ReturnType<typeof createGroupState>['orderIds'];
  commitOrder: ReturnType<typeof createGroupActions>['commitOrder'];
  railDivider: ReturnType<typeof createGroupOrder>['railDivider'];
  commitPinned: ReturnType<typeof createGroupActions>['commitPinned'];
  pinned: ReturnType<typeof createGroupState>['pinned'];
}): {
  resize: ReturnType<typeof createResize>;
  reorderIds: () => readonly string[];
  reorder: ReturnType<typeof createReorderList>;
  draggableColumnIds: () => string[];
  moveOpenTo: (fromIndex: number, toIndex: number) => void;
  columnReorder: ReturnType<typeof createReorderList>;
} {
  const {
    getRailOverflow,
    orientation,
    railSide,
    visualOpenIds,
    panelEls,
    metaOf,
    sizes,
    setSizesRaw,
    commitSizes,
    isLeaf,
    setOpen,
    panels,
    REORDER_SKIP_SELECTOR,
    moveTo,
    orderIds,
    commitOrder,
    railDivider,
    commitPinned,
    pinned,
  } = deps;
  const resize = createResize({
    axis: () => (orientation() === 'horizontal' ? 'x' : 'y'),
    // Rail on the right mirrors the main axis, so pointer-right SHRINKS the panel
    // whose trailing edge is being dragged. One sign flip, no second code path.
    direction: () => (orientation() === 'horizontal' && railSide() === 'right' ? -1 : 1),
    visualOpenIds,
    elementOf: (id) => panelEls.get(id),
    minSizeOf: (id) => metaOf(id)?.minSize() ?? DEFAULT_MIN_SIZE_PX,
    sizes,
    // Two writers, because a drag has intermediate states and a commit does not — see PREVIEW vs
    // COMMIT in `resize.ts`. `previewSizes` moves the signal only; persisted changes go through
    // `commitSizes`.
    previewSizes: setSizesRaw,
    commitSizes,
    // A leaf's visibility belongs to the consumer, so the dock must not close one
    // behind its back; it clamps at the minimum instead.
    canCollapse: (id) => !isLeaf(id),
    collapse: (id) => {
      if (isLeaf(id)) return false;
      setOpen(id, false);
      return true;
    },
  });

  /**
   * The ids that have a draggable node. The rail renders only `visibleIds`; an id with no
   * node measures as a zero rect, which the primitive counts as overlapped when it follows the source.
   */
  const reorderIds = (): readonly string[] =>
    orientation() === 'horizontal'
      ? getRailOverflow().visibleIds()
      : panels().map((m) => m.id);

  /**
   * Drag-reorder through the project's own vendored primitive, rather than a third hand-rolled
   * pointer drag. Both orientations stack activators vertically, so the axis is 'y' either way.
   */
  const reorder = createReorderList({
    ids: () => [...reorderIds()],
    axis: 'y',
    skipSelector: REORDER_SKIP_SELECTOR,
    stopPropagation: false,
    onReorder: (fromIndex, toIndex) => {
      const ids = reorderIds();
      const moved = ids[fromIndex];
      const target = ids[toIndex];
      if (moved !== undefined && target !== undefined)
        moveTo(moved, orderIds().indexOf(target));
    },
  });

  /** Dragging a COLUMN rather than a rail button. See DESIGN_NOTES.md § src/AccordionGroup.tsx:664. */
  const draggableColumnIds = (): string[] => visualOpenIds().filter((id) => !isLeaf(id));

  /** Apply a move made in the OPEN subsequence back onto the full order. See DESIGN_NOTES.md § src/AccordionGroup.tsx:677. */
  const moveOpenTo = (fromIndex: number, toIndex: number): void => {
    const visual = draggableColumnIds();
    const moved = visual[fromIndex];
    if (moved === undefined) return;
    const nextVisual = [...visual];
    nextVisual.splice(fromIndex, 1);
    nextVisual.splice(Math.max(0, Math.min(toIndex, nextVisual.length)), 0, moved);

    const openSlots = new Set(visual);
    let cursor = 0;
    const nextOrder = orderIds().map((id) =>
      openSlots.has(id) ? nextVisual[cursor++] : id,
    );
    commitOrder(nextOrder);

    /* The static region is ordered by PIN order, so writing only the panel order would paint nothing for a pinned column. See DESIGN_NOTES.md § src/AccordionGroup.tsx:699. */
    if (railDivider()) {
      commitPinned(new Set(repinToVisualOrder({ pinOrder: [...pinned()], nextVisual })));
    }
  };

  const columnReorder = createReorderList({
    ids: draggableColumnIds,
    // Columns lie along the group's main axis. `row-reverse` for a right-docked rail needs no
    // special case: the primitive measures real rects, reading positions not declaration order.
    axis: 'x',
    skipSelector: REORDER_SKIP_SELECTOR,
    stopPropagation: false,
    onReorder: moveOpenTo,
  });

  return { resize, reorderIds, reorder, draggableColumnIds, moveOpenTo, columnReorder };
}
