import type { AccordionGroupApi } from './context';
import type { GroupApiDependencies } from './groupApi.types';

export function createGroupRegistration(
  deps: GroupApiDependencies,
): Pick<AccordionGroupApi, 'register' | 'unregister'> {
  const {
    metaMap,
    setMetaMap,
    orderIds,
    setOrderIds,
    hydration,
    policy,
    openList,
    isLeaf,
    setOpen,
    metaOf,
    commitOpen,
  } = deps;
  return {
    register: (meta, defaultOpen) => {
      if (metaMap().has(meta.id)) {
        /*
         * Two panels sharing an id silently became ONE registration. Reported rather
         * than thrown. See DESIGN_NOTES.md § src/AccordionGroup.tsx:936.
         */
        // eslint-disable-next-line no-console -- see above
        console.error(
          `[accordion-dock] two panels registered the id "${meta.id}". Ids must be ` +
            'unique within a group: they key open/pinned/order/size state and ' +
            "persistence, so the second panel shares the first one's state and " +
            'loses its own chrome.',
        );
      }
      setMetaMap((prev) => {
        if (prev.has(meta.id)) return prev;
        const next = new Map(prev);
        next.set(meta.id, meta);
        return next;
      });
      // Leaves never enter the user order — they are terminal by definition, and dragging one into
      // the rail would put a button on a thing with no activator.
      if (!meta.isLeaf && !orderIds().includes(meta.id)) {
        setOrderIds((prev) => [...prev, meta.id]);
      }
      if (hydration.value || !defaultOpen) return;
      // First-wins under `single`: two panels declaring defaultOpen is an author bug, and honouring
      // the LAST would make the initial view depend on child order.
      if (policy() === 'single' && openList().some((id) => !isLeaf(id))) return;
      setOpen(meta.id, true);
    },

    unregister: (id) => {
      const wasLeaf = metaOf(id)?.isLeaf === true;
      setMetaMap((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      // No manual element purge: every reference is cleared by its slot's cleanup. The ORDER
      // entry survives a remount; a LEAF's open state does not. See DESIGN_NOTES.md
      // § src/AccordionGroup.tsx:984.
      if (wasLeaf && openList().includes(id)) {
        commitOpen(openList().filter((v) => v !== id));
      }
    },
  };
}
