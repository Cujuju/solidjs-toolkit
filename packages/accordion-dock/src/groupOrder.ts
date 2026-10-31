import { createMemo } from 'solid-js';
import type { AccordionGroupProps } from './AccordionGroup.types';
import { type AccordionOrientation } from './context';
import { createGroupState } from './groupState';
import { createLeafChain } from './leafChain';
import { orderVisualOpen, partitionAtRail } from './visualOrder';

export function createGroupOrder(deps: {
  orderIds: ReturnType<typeof createGroupState>['orderIds'];
  openList: ReturnType<typeof createGroupState>['openList'];
  metaMap: ReturnType<typeof createGroupState>['metaMap'];
  isLeaf: ReturnType<typeof createGroupState>['isLeaf'];
  metaOf: ReturnType<typeof createGroupState>['metaOf'];
  orientation: () => AccordionOrientation;
  props: AccordionGroupProps;
  pinned: ReturnType<typeof createGroupState>['pinned'];
}) {
  const { orderIds, openList, metaMap, isLeaf, metaOf, orientation, props, pinned } =
    deps;
  /**
   * Is this panel currently an auto-hide OVERLAY rather than a column? Late-bound with a
   * `false` default. See DESIGN_NOTES.md § src/AccordionGroup.tsx:378.
   */
  const flyoutState = { isFlyoutId: (_id: string): boolean => false };

  /** The group's leaf chain — `parentId` edges published by each `<AccordionLeaf>`. See DESIGN_NOTES.md § src/AccordionGroup.tsx:394. */
  const leafChain = createLeafChain();

  /** Open ids in USER order: the partition's input. The painted order differs under the divider — read `visualOpenIds` for that. */
  const userOrderOpenIds = createMemo<readonly string[]>(() =>
    orderVisualOpen({
      order: orderIds(),
      // Unmounted panels keep their remembered open state but paint nothing.
      open: openList().filter((id) => metaMap().has(id)),
      isLeaf,
      isFlyout: (id) => flyoutState.isFlyoutId(id),
      orderLeaves: leafChain.orderOpen,
    }),
  );

  /**
   * Does any OPEN member absorb the group's surplus? Derived over `userOrderOpenIds` so a
   * CLOSED grower cannot retire the trailing default and leave a dead strip.
   */
  /* Membership only, so the partition's input serves — the partition is not built yet. */
  const hasDeclaredGrower = createMemo<boolean>(() =>
    userOrderOpenIds().some((id) => metaOf(id)?.grow() === true),
  );

  /** Divider mode follows `autoHide` unless the consumer says otherwise — see the
   *  prop's JSDoc for why that is the default rather than a separate opt-in. */
  const railDivider = (): boolean =>
    orientation() === 'horizontal' && (props.railDivider ?? props.autoHide ?? false);

  /** Static columns follow pinned-set insertion order; repinning moves a panel to the end. See DESIGN_NOTES.md § src/AccordionGroup.tsx:436. */
  const railPartition = createMemo(() =>
    partitionAtRail({
      visualOpen: userOrderOpenIds(),
      pinOrder: [...pinned()],
      isLeaf,
      enabled: railDivider(),
    }),
  );
  const railOrder = (): number => railPartition().railOrder;

  /** Open panels in the sequence they are painted — what a splitter walks, the breadcrumb reads and flex `order` follows. See DESIGN_NOTES.md § src/AccordionGroup.tsx:455. */
  const visualOpenIds = createMemo<readonly string[]>(() => railPartition().sequence);

  return {
    flyoutState,
    leafChain,
    userOrderOpenIds,
    hasDeclaredGrower,
    railDivider,
    railPartition,
    railOrder,
    visualOpenIds,
  };
}
