import type { AccordionGroupApi, PanelBadge, PanelMeta } from '../context';
import { ACCORDION_LAYOUT_VERSION } from '../context';
import { orderVisualOpen, survivesBulkClose } from '../visualOrder';

/**
 * A hand-built `AccordionGroupApi` for tests.
 *
 * WHY A STUB RATHER THAN A REAL `<AccordionGroup>`
 *
 * The modules under test — the breadcrumb path, the menu's enable/disable matrix,
 * the leaf chain — are pure functions of group STATE. Rendering a real group to
 * produce that state would mean driving it through the UI (click this, drag that)
 * to reach the case being tested, so a test for "Close Others is disabled when
 * every other open panel is pinned" would spend most of its length arranging
 * pins through a renderer and would fail for reasons that have nothing to do with
 * the assertion. Stating the state directly makes each test's precondition
 * readable in one line.
 *
 * WHAT STOPS IT DRIFTING
 *
 * Two different mechanisms, for two different kinds of drift:
 *
 *   - SHAPE. `group` below is annotated `AccordionGroupApi`, so a member added,
 *     removed, renamed or re-signatured on that interface fails the build here
 *     exactly as it does in `AccordionGroup`. No discipline required.
 *   - BEHAVIOUR. This is the kind a type checker cannot see, and the answer is
 *     not to test for it but to remove it: the rules that used to be copied here
 *     (the painted order, the bulk-close exemption) now live in `visualOrder.ts`
 *     and are CALLED, so there is no second implementation to go stale.
 *
 * What remains is deliberately inert — state held in local variables, and call
 * recording. Those cannot disagree with the real group because they make no claim
 * about it.
 */

export interface StubPanelSpec {
  id: string;
  title?: string;
  railLabel?: string;
  tooltip?: string;
  pinnable?: boolean;
  closable?: boolean;
  minSize?: number;
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
}

/** Every mutating call the module under test made, in order. Assertions read this
 *  instead of re-deriving what "should" have happened. */
export interface StubCalls {
  setOpen: { id: string; open: boolean }[];
  togglePin: string[];
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
    railClass: () => undefined,
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
   * The REAL rule, called — not a copy of it.
   *
   * This used to reimplement `AccordionGroup.visualOpenIds`, with a comment
   * admitting it was the one place the stub could silently drift. It could, and
   * it did: the rule gained a flying-out-panel exclusion, and nothing about a
   * stub-side copy would have failed to notice. Sharing the function removes the
   * drift as a possibility rather than as a thing to remember, which is the only
   * version of that guarantee worth having.
   */
  const visualOpenIds = (): readonly string[] =>
    orderVisualOpen({ order: order(), open: openIds, isLeaf: isLeafId });

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
    panels: () => metas.filter((m) => !m.isLeaf),
    leaves: () => metas.filter((m) => m.isLeaf),
    meta: (id) => byId.get(id),

    isOpen: (id) => openIds.includes(id),
    isPinned: (id) => pinned.has(id),
    openIndex: (id) => visualOpenIds().indexOf(id),
    neighborOpenId: (id) => {
      const v = visualOpenIds();
      const i = v.indexOf(id);
      return i >= 0 ? v[i + 1] : undefined;
    },

    toggle: (id) => setOpen(id, !openIds.includes(id)),
    setOpen,
    togglePin: (id) => {
      calls.togglePin.push(id);
      if (pinned.has(id)) pinned.delete(id);
      else pinned.add(id);
    },

    expandAll: notImplemented('expandAll'),
    collapseAll: () => {
      calls.collapseAll += 1;
      // Same shared predicate the group's own `collapseAll` uses, so a test can
      // assert the resulting STATE (not just the call count) without that
      // assertion being a claim about a copy of the rule.
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
    setHeaderEl: () => {},
    tornOff: () => [],
    isTornOff: () => false,
    tearOff: () => ({ ok: false, reason: 'stub' }),
    dock: () => {},
    tearOffMountFor: () => undefined,
    isFlyout: () => false,
    flyoutMountFor: () => undefined,
    setRailOverflowEl: () => {},
    activatorElOf: () => undefined,
    density: () => 'comfortable',
    setPanelEl: () => {},
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
