import { ACCORDION_LAYOUT_VERSION, type AccordionGroupApi } from './context';
import type { GroupApiDependencies } from './groupApi.types';
import { createGroupRegistration } from './groupRegistration';
import { showsRailButton, survivesBulkClose } from './visualOrder';

export function createGroupApi(deps: GroupApiDependencies) {
  const {
    orientation,
    railSide,
    mode,
    policy,
    reorderable,
    resizable,
    depth,
    openList,
    orderIds,
    visualOpenIds,
    hasDeclaredGrower,
    panels,
    leaves,
    metaOf,
    pinned,
    railDivider,
    railPartition,
    railOrder,
    setOpen,
    commitPinned,
    commitOpen,
    isLeaf,
    sizes,
    commitOrder,
    commitSizes,
    hydration,
    moveTo,
    resize,
    metaMap,
    setMetaMap,
    setOrderIds,
    activators,
    railOverflowSlot,
    headerEls,
    railOverflow,
    railOverflowEl,
    controllers,
    EMPTY_IDS,
    flyoutState,
    props,
    panelElements,
    reorder,
    columnReorder,
  } = deps;
  const api: AccordionGroupApi = {
    orientation,
    railSide,
    mode,
    policy,
    reorderable,
    resizable,
    depth,

    openOrder: openList,
    order: orderIds,
    visualOpenIds,
    hasDeclaredGrower,
    panels,
    leaves,
    meta: metaOf,

    isOpen: (id) => openList().includes(id),
    isPinned: (id) => pinned().has(id),
    openIndex: (id) => visualOpenIds().indexOf(id),
    railDivider,
    columnOrder: (id) => railPartition().orderOf(id),
    isEdgeColumn: (id) => railPartition().isEdgeColumn(id),
    railOrder,
    isStaticColumn: (id) => railPartition().staticIds.includes(id),
    /** The last pinned column — the one whose trailing edge IS the rail. */
    isRailBoundary: (id) => {
      const s = railPartition().staticIds;
      return s.length > 0 && s[s.length - 1] === id;
    },
    showsRailButton: (id) =>
      showsRailButton(id, {
        isOpen: (v) => openList().includes(v),
        isPinned: (v) => pinned().has(v),
        enabled: railDivider(),
      }),
    /** Collapse a column but REMEMBER that it docks. See DESIGN_NOTES.md § src/AccordionGroup.tsx:817. */
    collapseKeepPin: (id) => setOpen(id, false),
    /**
     * Close a column AND drop its pin — the ×. Its rail button then reopens it as a flyout,
     * so nothing is left pinned-but-invisible.
     */
    closeAndUnpin: (id) => {
      const next = new Set(pinned());
      if (next.delete(id)) commitPinned(next);
      setOpen(id, false);
    },
    neighborOpenId: (id) => {
      const ids = visualOpenIds();
      const i = ids.indexOf(id);
      return i < 0 ? undefined : ids[i + 1];
    },

    setOpen,
    // The leaf reporting its own state, bypassing the request path above — see
    // `setLeafOpen` on the interface for why the two directions are separate.
    setLeafOpen: (id, open) => {
      const current = openList();
      if (open) {
        if (current.includes(id)) return;
        commitOpen([...current, id], id);
        return;
      }
      if (!current.includes(id)) return;
      commitOpen(current.filter((v) => v !== id));
    },
    toggle: (id) => setOpen(id, !openList().includes(id)),

    togglePin: (id) => {
      const next = new Set(pinned());
      if (next.has(id)) next.delete(id);
      else next.add(id);
      commitPinned(next);
    },

    expandAll: () => {
      // Deliberately a no-op under `single`: "expand all" is not a thing an accordion can do, and
      // switching policy for one click would be surprising.
      if (policy() === 'single') return;
      // Through `commitOpen`, which applies `maxOpen`. This used to open every panel
      // unconditionally, so a group capped at 2 ended up with six columns.
      const open = openList();
      commitOpen([
        ...open,
        ...panels()
          .map((m) => m.id)
          .filter((id) => !open.includes(id)),
      ]);
    },

    collapseAll: () => {
      commitOpen(
        openList().filter((id) =>
          survivesBulkClose(id, { isPinned: (pid) => pinned().has(pid), isLeaf }),
        ),
      );
    },

    getLayout: () => ({
      version: ACCORDION_LAYOUT_VERSION,
      open: [...openList()],
      pinned: [...pinned()],
      order: [...orderIds()],
      sizes: { ...sizes() },
    }),

    setLayout: (layout) => {
      // All-or-nothing. An older shape could be missing a field the group now depends on, and a
      // half-restored dock is harder to diagnose than one that visibly fell back to defaults.
      if (layout.version !== ACCORDION_LAYOUT_VERSION) return false;
      /** Restore through all four commit functions so change callbacks, including `onPinChange`, fire. See DESIGN_NOTES.md § src/AccordionGroup.tsx:897. */
      commitOrder([...layout.order]);
      commitPinned(new Set(layout.pinned));
      commitSizes({ ...layout.sizes });
      commitOpen([...layout.open]);
      hydration.value = true;
      return true;
    },

    moveTo,
    moveBy: (id, delta) => {
      const from = orderIds().indexOf(id);
      if (from < 0) return;
      moveTo(id, from + delta);
    },

    sizeOf: (id) => sizes()[id],
    setSize: (id, px) => commitSizes({ ...sizes(), [id]: px }),
    resetSizes: () => commitSizes({}),
    beginResize: resize.begin,
    nudgeResize: resize.nudge,
    resizeBoundsOf: resize.boundsOf,
    resizing: resize.resizing,
    collapseCandidate: resize.collapseCandidate,

    ...createGroupRegistration(deps),

    activators,

    railOverflowSlot,

    // The fallback is the whole point — a panel whose rail button collapsed into the `⋯` menu is
    // REPRESENTED by that trigger, so that is what a flyout anchors to.
    activatorElOf: (id) => {
      const own = headerEls().get(id);
      if (own !== undefined) return own;
      if (!railOverflow.overflowIds().includes(id)) return undefined;
      return railOverflowEl() ?? undefined;
    },
    tornOff: () => controllers.tearOffApi?.tornOff() ?? EMPTY_IDS,
    isTornOff: (id) => controllers.tearOffApi?.isTornOff(id) ?? false,
    tearOff: (id) => {
      const result = controllers.tearOffApi?.tearOff(id);
      return result === undefined ? { ok: false, reason: 'unavailable' } : result;
    },
    dock: (id) => controllers.tearOffApi?.dock(id),
    tearOffMountFor: (id) => controllers.tearOffApi?.mountFor(id),
    // Through the same late-bound reference `visualOpenIds` uses, so the panel's
    // `data-flyout` attribute and the painted sequence can never disagree about
    // which panels are overlays.
    isFlyout: (id) => flyoutState.isFlyoutId(id),
    flyoutMountFor: (id) => controllers.autoHideApi?.flyoutMountFor(id),
    /* The VERTICAL activator is the panel's own header bar, which the panel renders, so
           the hover-intent listeners reach it through the group. Same object either way. */
    activatorHoverProps: (id) => controllers.autoHideApi?.activatorHoverProps(id) ?? {},
    density: () => props.density ?? 'comfortable',

    panelElements,

    moveFocus: (fromId, delta) => {
      const order = panels();
      if (order.length === 0) return;
      const from = order.findIndex((m) => m.id === fromId);
      let target: number;
      if (delta === 'first') target = 0;
      else if (delta === 'last') target = order.length - 1;
      else {
        // Wraps. A roving group of 3 activators is faster to traverse by wrapping
        // than by making the user reverse direction at each end.
        target = (from + delta + order.length) % order.length;
      }
      // Through `activatorElOf`, so arrowing onto a panel whose button collapsed focuses that
      // trigger rather than focusing nothing — which is what a raw `headerEls` read did.
      api.activatorElOf(order[target].id)?.focus();
    },

    reorderItemProps: (id) =>
      reorderable() ? (reorder.itemProps(id) as Record<string, unknown>) : {},
    reorderColumnProps: (id) =>
      reorderable() && orientation() === 'horizontal'
        ? (columnReorder.itemProps(id) as Record<string, unknown>)
        : {},
    reorderActiveId: reorder.activeId,
  };

  return { api };
}
