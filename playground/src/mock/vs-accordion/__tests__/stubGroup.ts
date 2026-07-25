import type { AccordionGroupApi, PanelBadge, PanelMeta } from '../context';
import { ACCORDION_LAYOUT_VERSION } from '../context';

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
 * The cost is real and worth naming: this stub can DRIFT from the real group. It
 * is mitigated in one specific place — `visualOpenIds` below reimplements the
 * group's ordering rule, and that reimplementation is the thing most likely to go
 * stale. See the note there.
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

  /**
   * MIRRORS `AccordionGroup.visualOpenIds`: order-filtered-to-open, then open
   * leaves appended.
   *
   * This is the one piece of real logic duplicated into the stub, and it is
   * duplicated because `visualOpenIds` is an INPUT to everything being tested
   * here rather than a thing under test. If the group's rule changes, this must
   * change with it — the breadcrumb tests would otherwise keep passing against a
   * sequence the dock no longer paints.
   */
  const visualOpenIds = (): readonly string[] => {
    const leafIds = openIds.filter((id) => byId.get(id)?.isLeaf === true);
    const normal = order().filter((id) => openIds.includes(id));
    return [...normal, ...leafIds];
  };

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
      // The real rule: unpinned, non-leaf. Reproduced so a test can assert the
      // resulting state and not just the call count.
      openIds = openIds.filter((id) => pinned.has(id) || byId.get(id)?.isLeaf === true);
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
    headerElOf: () => undefined,
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
