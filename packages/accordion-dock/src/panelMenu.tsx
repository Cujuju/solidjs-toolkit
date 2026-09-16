import { createSignal, Show, type Accessor, type JSX } from 'solid-js';
import {
  ContextMenu,
  type ContextMenuEntry,
  type ContextMenuSurface,
} from '@cujuju/solidjs-context-menu';
import type { AccordionGroupApi } from './context';
import { bulkClosableIds as sharedBulkClosableIds } from './visualOrder';

/**
 * The right-click menu for a panel's ACTIVATOR. Renders NO chrome of its own and holds NO
 * state. See DESIGN_NOTES.md § src/panelMenu.tsx:10.
 */

/**
 * Row labels, exported so a test can assert on the entry list without duplicating the
 * strings — a duplicated literal asserts the test is self-consistent, not that the menu is.
 */
export const PANEL_MENU_LABELS = {
  pin: 'Pin',
  unpin: 'Unpin',
  close: 'Close',
  closeOthers: 'Close Others',
  closeAll: 'Close All',
  moveUp: 'Move Up',
  moveDown: 'Move Down',
  resetSizes: 'Reset Sizes',
} as const;

/**
 * Tooltips shown on a DISABLED row. Every one gets a reason: a greyed-out item with no
 * explanation makes the user hunt for the state that would enable it.
 */
export const PANEL_MENU_DISABLED_TOOLTIPS = {
  alreadyClosed: 'This panel is already closed',
  nothingElseToClose: 'Every other open panel is pinned',
  nothingToClose: 'Every open panel is pinned',
  reorderDisabled: 'Reordering is turned off for this group',
  atStart: 'Already first',
  atEnd: 'Already last',
  notReorderable: 'This panel has no place in the order',
  noExplicitSizes: 'No panel has been resized',
} as const;

/**
 * `moveBy` offsets. Up is toward index 0 in BOTH orientations, because activators stack
 * downward either way, so "up" never has to mean "left".
 */
const MOVE_UP_DELTA = -1;
const MOVE_DOWN_DELTA = 1;

/** First position in the user order — the index at which "Move Up" is a no-op. */
const FIRST_ORDER_INDEX = 0;

/** `Array.prototype.indexOf` miss. A panel that is not in the order is a leaf. */
const NOT_IN_ORDER = -1;

/**
 * Display-only shortcut hints mirroring `keys.ts`. Shown ONLY when the group is reorderable,
 * the same condition the key handler gates on.
 */
const MOVE_UP_SHORTCUT = 'Alt+↑';
const MOVE_DOWN_SHORTCUT = 'Alt+↓';

/**
 * Open panels a BULK close may touch: open, not pinned, not a leaf. Both exemptions are the
 * group's own rules. See DESIGN_NOTES.md § src/panelMenu.tsx:85.
 */
function bulkClosableIds(group: AccordionGroupApi): readonly string[] {
  // Through the shared rule rather than a hand-written inverse. This used to spell out
  // `!isPinned && !isLeaf` and only PREDICT what `collapseAll` would do, while greying a row.
  return sharedBulkClosableIds(group.openOrder(), {
    isPinned: (id) => group.isPinned(id),
    isLeaf: (id) => group.meta(id)?.isLeaf === true,
  });
}

/**
 * True when any panel carries an explicit size. Read through `sizeOf`, the API's only public
 * view, which also covers sizes seeded from `defaultSize`.
 */
function hasExplicitSizes(group: AccordionGroupApi): boolean {
  return [...group.panels(), ...group.leaves()].some(
    (meta) => group.sizeOf(meta.id) !== undefined,
  );
}

/** Concatenate non-empty sections with a divider between each pair, so the menu never opens
 *  with a rule against its own edge. */
function joinSections(sections: readonly ContextMenuEntry[][]): ContextMenuEntry[] {
  const populated = sections.filter((section) => section.length > 0);
  const out: ContextMenuEntry[] = [];
  populated.forEach((section, i) => {
    if (i > 0) out.push({ divider: true });
    out.push(...section);
  });
  return out;
}

/**
 * Build the menu entries for one panel, from live group state. Pure and DOM-free.
 * See DESIGN_NOTES.md § src/panelMenu.tsx:140.
 */
export function buildPanelMenuItems(
  group: AccordionGroupApi,
  id: string,
): ContextMenuEntry[] {
  const meta = group.meta(id);
  const isOpen = group.isOpen(id);
  const isPinned = group.isPinned(id);

  // ── Pin ────────────────────────────────────────────────────────────────────
  // Hidden entirely when the panel is not pinnable: a capability its author turned off,
  // not a transient state, so a dead row would be noise on every open.
  const pinSection: ContextMenuEntry[] = [];
  if (meta?.pinnable() === true) {
    pinSection.push({
      label: isPinned ? PANEL_MENU_LABELS.unpin : PANEL_MENU_LABELS.pin,
      onClick: () => group.togglePin(id),
    });
  }

  // ── Close family ───────────────────────────────────────────────────────────
  const others = bulkClosableIds(group).filter((otherId) => otherId !== id);
  const closable = bulkClosableIds(group);

  const closeSection: ContextMenuEntry[] = [
    {
      label: PANEL_MENU_LABELS.close,
      disabled: !isOpen,
      disabledTooltip: PANEL_MENU_DISABLED_TOOLTIPS.alreadyClosed,
      onClick: () => group.setOpen(id, false),
    },
    {
      label: PANEL_MENU_LABELS.closeOthers,
      disabled: others.length === 0,
      disabledTooltip: PANEL_MENU_DISABLED_TOOLTIPS.nothingElseToClose,
      // Not `collapseAll()` minus a re-open: that fires two `onChange` callbacks for a panel
      // that never moved, and under `append` the reopen would relocate it.
      onClick: () => {
        for (const otherId of others) group.setOpen(otherId, false);
      },
    },
    {
      label: PANEL_MENU_LABELS.closeAll,
      disabled: closable.length === 0,
      disabledTooltip: PANEL_MENU_DISABLED_TOOLTIPS.nothingToClose,
      // The group's own bulk close, so the pin/leaf exemption has exactly one
      // implementation. `bulkClosableIds` above only PREDICTS what it will do,
      // for the disabled state.
      onClick: () => group.collapseAll(),
    },
  ];

  // ── Move ───────────────────────────────────────────────────────────────────
  // Disabled rather than hidden at the ends: moving IS a thing this control does, and the
  // row is where the keyboard equivalent is learned.
  const orderIndex = group.order().indexOf(id);
  const lastOrderIndex = group.order().length - 1;
  const reorderable = group.reorderable();
  // A leaf is not in the order at all — it is terminal by definition, so there
  // is no position for it to move to.
  const inOrder = orderIndex !== NOT_IN_ORDER;

  /** The reason THIS move is unavailable, most-fundamental first, or undefined when it is
   *  available — leaving it unset keeps the entry data honest for a test. */
  const moveDisabledTooltip = (atEdge: boolean, edgeTooltip: string): string | undefined =>
    !reorderable
      ? PANEL_MENU_DISABLED_TOOLTIPS.reorderDisabled
      : !inOrder
        ? PANEL_MENU_DISABLED_TOOLTIPS.notReorderable
        : atEdge
          ? edgeTooltip
          : undefined;

  const atStart = inOrder && orderIndex === FIRST_ORDER_INDEX;
  const atEnd = inOrder && orderIndex === lastOrderIndex;

  const moveSection: ContextMenuEntry[] = [
    {
      label: PANEL_MENU_LABELS.moveUp,
      disabled: !reorderable || !inOrder || atStart,
      disabledTooltip: moveDisabledTooltip(atStart, PANEL_MENU_DISABLED_TOOLTIPS.atStart),
      ...(reorderable ? { shortcut: MOVE_UP_SHORTCUT } : {}),
      onClick: () => group.moveBy(id, MOVE_UP_DELTA),
    },
    {
      label: PANEL_MENU_LABELS.moveDown,
      disabled: !reorderable || !inOrder || atEnd,
      disabledTooltip: moveDisabledTooltip(atEnd, PANEL_MENU_DISABLED_TOOLTIPS.atEnd),
      ...(reorderable ? { shortcut: MOVE_DOWN_SHORTCUT } : {}),
      onClick: () => group.moveBy(id, MOVE_DOWN_DELTA),
    },
  ];

  // ── Sizing ─────────────────────────────────────────────────────────────────
  // Group-wide, not per-panel, because `resetSizes` is. Enabled whenever ANY panel carries
  // an explicit size.
  const sizeSection: ContextMenuEntry[] = [
    {
      label: PANEL_MENU_LABELS.resetSizes,
      disabled: !hasExplicitSizes(group),
      disabledTooltip: PANEL_MENU_DISABLED_TOOLTIPS.noExplicitSizes,
      onClick: () => group.resetSizes(),
    },
  ];

  return joinSections([pinSection, closeSection, moveSection, sizeSection]);
}

export interface PanelMenuOptions {
  /** Menu surface treatment, forwarded verbatim to `ContextMenu`. Defaults to
   *  the package default (`'glass'`). */
  surface?: ContextMenuSurface;
  /**
   * Last chance to filter, reorder or extend the generated rows — the seam a host uses to add
   * its own row without forking this file. Runs on every open.
   */
  transform?: (entries: ContextMenuEntry[], id: string) => ContextMenuEntry[];
}

export interface PanelMenu {
  /**
   * Spread onto the panel's activator. Deliberately just the one handler: anything else would
   * collide with the reorder primitive's `itemProps` on the same element.
   */
  triggerProps: { onContextMenu: (e: MouseEvent) => void };
  /**
   * Render once inside the same component. Placement is irrelevant — `ContextMenu` Portals
   * itself to `<body>` and promotes into the top layer.
   */
  element: JSX.Element;
  /** Open at an explicit point, for callers that already own an `onContextMenu`
   *  (e.g. one that must also select the panel first). */
  openAt: (e: MouseEvent) => void;
  /**
   * Open anchored to an ELEMENT — the keyboard path. A menu reachable only by right-click
   * hides commands that exist nowhere else; Shift+F10 carries no coordinates.
   */
  openAtElement: (el: HTMLElement) => void;
  close: () => void;
  isOpen: Accessor<boolean>;
}

/**
 * Attach the panel context menu to one activator. The id is an ACCESSOR: the rail button
 * renders from a `<For>`, so a snapshot would act on the wrong panel.
 */
export function createPanelMenu(
  group: AccordionGroupApi,
  id: () => string,
  options?: PanelMenuOptions,
): PanelMenu {
  /** The click point, and the open state in one signal: `null` is closed. Two
   *  signals could disagree; a point without an open menu is meaningless. */
  const [at, setAt] = createSignal<{ x: number; y: number } | null>(null);

  const close = (): void => {
    setAt(null);
  };

  /**
   * Where a menu opened from an element should appear: its bottom-left corner, matching what
   * a right-click on that edge would produce.
   */
  const openAtElement = (el: HTMLElement): void => {
    const r = el.getBoundingClientRect();
    setAt({ x: r.left, y: r.bottom });
  };

  const openAt = (e: MouseEvent): void => {
    // Replace the browser's menu rather than stacking on top of it.
    e.preventDefault();
    // Stop here, or a right-click on a NESTED group's activator would also reach
    // the outer group's — two menus from one gesture, the lower one unreachable.
    e.stopPropagation();
    setAt({ x: e.clientX, y: e.clientY });
  };

  /** Rebuilt on every render pass while open, so a row that becomes a no-op
   *  after a `keepOpen` action greys out instead of lying. */
  const items = (): ContextMenuEntry[] => {
    const built = buildPanelMenuItems(group, id());
    return options?.transform === undefined ? built : options.transform(built, id());
  };

  const element = (
    <Show when={at()}>
      {(point) => (
        <ContextMenu
          items={items()}
          x={point().x}
          y={point().y}
          surface={options?.surface}
          onClose={close}
        />
      )}
    </Show>
  );

  return {
    triggerProps: { onContextMenu: openAt },
    element,
    openAt,
    openAtElement,
    close,
    isOpen: () => at() !== null,
  };
}
