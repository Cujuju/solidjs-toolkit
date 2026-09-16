import type { AccordionGroupApi, PanelBadge, PanelMeta } from '../context';
import { ACCORDION_LAYOUT_VERSION } from '../context';
import {
  orderVisualOpen,
  partitionAtRail,
  showsRailButton,
  survivesBulkClose,
} from '../visualOrder';

/**
 * A hand-built `AccordionGroupApi`: the modules under test are pure functions of group STATE.
 * Annotated, so shape drift fails the build. See DESIGN_NOTES.md § src/__tests__/stubGroup.ts:10.
 */

export interface StubPanelSpec {
  id: string;
  title?: string;
  railLabel?: string;
  tooltip?: string;
  pinnable?: boolean;
  closable?: boolean;
  minSize?: number;
  /** Declares this panel the absorber of the group's leftover extent. */
  grow?: boolean;
  badge?: PanelBadge;
  isLeaf?: boolean;
}

export interface StubGroupSpec {
  /** Every panel, in RAIL order. Leaves may appear anywhere — they are filtered
   *  out of `order` exactly as the real group filters them. */
  panels: readonly StubPanelSpec[];
  /** Open ids in OPEN order (the membership sequence, not the painted one). */
  open?: readonly string[];
  pinned?: readonly string[];
  sizes?: Readonly<Record<string, number>>;
  reorderable?: boolean;
  resizable?: boolean;
  /** Rail-as-divider. Defaults ON, matching an `autoHide` group — the layout the
   *  divider tests are about. Set false for the welded-rail behaviour. */
  railDivider?: boolean;
}

/** Every mutating call the module under test made, in order. Assertions read this
 *  instead of re-deriving what "should" have happened. */
export interface StubCalls {
  setOpen: { id: string; open: boolean }[];
  togglePin: string[];
  /** The column title bar's activator — collapse, keep the pin. */
  collapseKeepPin: string[];
  /** The column × — close AND drop the pin. */
  closeAndUnpin: string[];
  collapseAll: number;
  resetSizes: number;
  moveBy: { id: string; delta: number }[];
  moveTo: { id: string; toIndex: number }[];
}

export interface StubGroup {
  group: AccordionGroupApi;
  calls: StubCalls;
  /** Mutate open membership from a test, for the rare case that needs a second
   *  state without building a second group. */
  setOpenIds: (ids: readonly string[]) => void;
}

function metaFor(spec: StubPanelSpec): PanelMeta {
  return {
    id: spec.id,
    title: () => spec.title ?? '',
    railLabel: () => spec.railLabel,
    count: () => undefined,
    badge: () => spec.badge,
    icon: () => undefined,
    tooltip: () => spec.tooltip,
    accent: () => undefined,
    pinnable: () => spec.pinnable ?? true,
    closable: () => spec.closable ?? true,
    minSize: () => spec.minSize,
    grow: () => spec.grow ?? false,
    railClass: () => undefined,
    contentId: `stub-${spec.id}-content`,
    isLeaf: spec.isLeaf ?? false,
  };
}

export function createStubGroup(spec: StubGroupSpec): StubGroup {
  const metas = spec.panels.map(metaFor);
  const byId = new Map(metas.map((m) => [m.id, m]));

  let openIds: string[] = [...(spec.open ?? [])];
  const pinned = new Set(spec.pinned ?? []);
  const sizes: Record<string, number> = { ...(spec.sizes ?? {}) };

  const calls: StubCalls = {
    setOpen: [],
    togglePin: [],
    collapseKeepPin: [],
    closeAndUnpin: [],
    collapseAll: 0,
    resetSizes: 0,
    moveBy: [],
    moveTo: [],
  };

  /** Leaves are excluded from the order — the real group's rule, restated here
   *  because the stub owns the order outright. */
  const order = (): readonly string[] => metas.filter((m) => !m.isLeaf).map((m) => m.id);

  const isLeafId = (id: string): boolean => byId.get(id)?.isLeaf === true;
  const isPinnedId = (id: string): boolean => pinned.has(id);

  /**
   * The REAL rule, called — not a copy. This used to reimplement `visualOpenIds` and did
   * drift: the rule gained a flying-out exclusion and nothing here would have noticed.
   */
  const userOrderOpenIds = (): readonly string[] =>
    orderVisualOpen({ order: order(), open: openIds, isLeaf: isLeafId });

  /** The same partition the real group computes, from the same function. Pin ORDER
   *  is the `pinned` Set's insertion order here exactly as it is there. */
  const railDivider = (): boolean => spec.railDivider ?? true;
  const partition = () =>
    partitionAtRail({
      visualOpen: userOrderOpenIds(),
      pinOrder: [...pinned],
      isLeaf: isLeafId,
      enabled: railDivider(),
    });

  const visualOpenIds = (): readonly string[] => partition().sequence;

  const setOpen = (id: string, open: boolean): void => {
    calls.setOpen.push({ id, open });
    if (open) {
      if (!openIds.includes(id)) openIds.push(id);
    } else {
      openIds = openIds.filter((x) => x !== id);
    }
  };

  const notImplemented = (name: string) => (): never => {
    throw new Error(`stubGroup: ${name}() is not implemented — no test needs it yet.`);
  };

  const group: AccordionGroupApi = {
    orientation: () => 'horizontal',
    railSide: () => 'left',
    mode: () => 'fill',
    policy: () => 'multi',
    reorderable: () => spec.reorderable ?? true,
    resizable: () => spec.resizable ?? true,
    depth: 0,

    openOrder: () => openIds,
    order,
    visualOpenIds,
    /* Same derivation the real group uses — over the OPEN members, so a closed grower
           cannot retire the trailing default. */
    hasDeclaredGrower: () => visualOpenIds().some((id) => byId.get(id)?.grow() === true),
    panels: () => metas.filter((m) => !m.isLeaf),
    leaves: () => metas.filter((m) => m.isLeaf),
    meta: (id) => byId.get(id),

    isOpen: (id) => openIds.includes(id),
    isPinned: (id) => pinned.has(id),
    openIndex: (id) => visualOpenIds().indexOf(id),

    railDivider,
    columnOrder: (id) => partition().orderOf(id),
    isEdgeColumn: (id) => partition().isEdgeColumn(id),
    railOrder: () => partition().railOrder,
    isStaticColumn: (id) => partition().staticIds.includes(id),
    isRailBoundary: (id) => {
      const s = partition().staticIds;
      return s.length > 0 && s[s.length - 1] === id;
    },
    showsRailButton: (id) =>
      showsRailButton(id, {
        isOpen: (v) => openIds.includes(v),
        isPinned: isPinnedId,
        enabled: railDivider(),
      }),
    collapseKeepPin: (id) => {
      calls.collapseKeepPin.push(id);
      setOpen(id, false);
    },
    closeAndUnpin: (id) => {
      calls.closeAndUnpin.push(id);
      pinned.delete(id);
      setOpen(id, false);
    },
    neighborOpenId: (id) => {
      const v = visualOpenIds();
      const i = v.indexOf(id);
      return i >= 0 ? v[i + 1] : undefined;
    },

    toggle: (id) => setOpen(id, !openIds.includes(id)),
    setOpen,
    // The leaf reporting its own state. Writes membership directly, exactly as the
    // real group does — the REQUEST path is what `setOpen` models.
    setLeafOpen: (id, open) => {
      if (open) {
        if (!openIds.includes(id)) openIds.push(id);
      } else {
        openIds = openIds.filter((x) => x !== id);
      }
    },
    togglePin: (id) => {
      calls.togglePin.push(id);
      if (pinned.has(id)) pinned.delete(id);
      else pinned.add(id);
    },

    expandAll: notImplemented('expandAll'),
    collapseAll: () => {
      calls.collapseAll += 1;
      // Same shared predicate the group's `collapseAll` uses, so a test can assert the
            // resulting STATE without that assertion being a claim about a copy.
      openIds = openIds.filter((id) =>
        survivesBulkClose(id, { isPinned: isPinnedId, isLeaf: isLeafId }),
      );
    },

    moveTo: (id, toIndex) => {
      calls.moveTo.push({ id, toIndex });
    },
    moveBy: (id, delta) => {
      calls.moveBy.push({ id, delta });
    },

    sizeOf: (id) => sizes[id],
    setSize: (id, px) => {
      sizes[id] = px;
    },
    resetSizes: () => {
      calls.resetSizes += 1;
      for (const k of Object.keys(sizes)) delete sizes[k];
    },
    beginResize: () => {},
    nudgeResize: () => {},
    resizeBoundsOf: () => undefined,
    resizing: () => false,
    collapseCandidate: () => null,

    getLayout: () => ({
      version: ACCORDION_LAYOUT_VERSION,
      open: [...openIds],
      pinned: [...pinned],
      order: [...order()],
      sizes: { ...sizes },
    }),
    setLayout: () => false,

    register: () => {},
    unregister: () => {},
    // Inert slots: no test here renders. They exist to satisfy the interface, which is
        // what makes this stub fail the build when the real api changes shape.
    activators: { set: () => {}, clear: () => {} },
    railOverflowSlot: { set: () => {}, clear: () => {} },
    panelElements: { set: () => {}, clear: () => {} },
    tornOff: () => [],
    isTornOff: () => false,
    tearOff: () => ({ ok: false, reason: 'stub' }),
    dock: () => {},
    tearOffMountFor: () => undefined,
    isFlyout: () => false,
    // Hover-to-open is a live-DOM behaviour; the stub's consumers are pure rules.
    activatorHoverProps: () => ({}),
    flyoutMountFor: () => undefined,
    activatorElOf: () => undefined,
    density: () => 'comfortable',
    moveFocus: () => {},

    reorderItemProps: () => ({}),
    reorderColumnProps: () => ({}),
    reorderActiveId: () => null,
  };

  return {
    group,
    calls,
    setOpenIds: (ids) => {
      openIds = [...ids];
    },
  };
}
