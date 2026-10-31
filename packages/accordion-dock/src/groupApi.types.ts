import { createReorderList } from '@cujuju/solid-reorder-list';
import type { AccordionGroupProps } from './AccordionGroup.types';
import { type AutoHideApi } from './autoHide';
import {
  type AccordionMode,
  type AccordionOrientation,
  type AccordionPolicy,
  type AccordionRailSide,
} from './context';
import { createGroupActions } from './groupActions';
import { createGroupOrder } from './groupOrder';
import { createGroupState } from './groupState';
import { createRailOverflow } from './railOverflow';
import { createResize } from './resize';
import { type TearOffController } from './tearOff';

export interface GroupApiDependencies {
  orientation: () => AccordionOrientation;
  railSide: () => AccordionRailSide;
  mode: () => AccordionMode;
  policy: () => AccordionPolicy;
  reorderable: () => boolean;
  resizable: () => boolean;
  depth: number;
  openList: ReturnType<typeof createGroupState>['openList'];
  orderIds: ReturnType<typeof createGroupState>['orderIds'];
  visualOpenIds: ReturnType<typeof createGroupOrder>['visualOpenIds'];
  hasDeclaredGrower: ReturnType<typeof createGroupOrder>['hasDeclaredGrower'];
  panels: ReturnType<typeof createGroupState>['panels'];
  leaves: ReturnType<typeof createGroupState>['leaves'];
  metaOf: ReturnType<typeof createGroupState>['metaOf'];
  pinned: ReturnType<typeof createGroupState>['pinned'];
  railDivider: ReturnType<typeof createGroupOrder>['railDivider'];
  railPartition: ReturnType<typeof createGroupOrder>['railPartition'];
  railOrder: ReturnType<typeof createGroupOrder>['railOrder'];
  setOpen: ReturnType<typeof createGroupActions>['setOpen'];
  commitPinned: ReturnType<typeof createGroupActions>['commitPinned'];
  commitOpen: ReturnType<typeof createGroupActions>['commitOpen'];
  isLeaf: ReturnType<typeof createGroupState>['isLeaf'];
  sizes: ReturnType<typeof createGroupState>['sizes'];
  commitOrder: ReturnType<typeof createGroupActions>['commitOrder'];
  commitSizes: ReturnType<typeof createGroupActions>['commitSizes'];
  hydration: ReturnType<typeof createGroupState>['hydration'];
  moveTo: ReturnType<typeof createGroupActions>['moveTo'];
  resize: ReturnType<typeof createResize>;
  metaMap: ReturnType<typeof createGroupState>['metaMap'];
  setMetaMap: ReturnType<typeof createGroupState>['setMetaMap'];
  setOrderIds: ReturnType<typeof createGroupState>['setOrderIds'];
  activators: ReturnType<typeof createGroupState>['activators'];
  railOverflowSlot: ReturnType<typeof createGroupState>['railOverflowSlot'];
  headerEls: ReturnType<typeof createGroupState>['headerEls'];
  railOverflow: ReturnType<typeof createRailOverflow>;
  railOverflowEl: ReturnType<typeof createGroupState>['railOverflowEl'];
  controllers: {
    autoHideApi?: AutoHideApi | undefined;
    tearOffApi?: TearOffController | undefined;
  };
  EMPTY_IDS: readonly string[];
  flyoutState: ReturnType<typeof createGroupOrder>['flyoutState'];
  props: AccordionGroupProps;
  panelElements: ReturnType<typeof createGroupState>['panelElements'];
  reorder: ReturnType<typeof createReorderList>;
  columnReorder: ReturnType<typeof createReorderList>;
}
