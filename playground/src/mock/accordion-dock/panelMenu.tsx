import { createSignal, Show, type Accessor, type JSX } from 'solid-js';
import {
  ContextMenu,
  type ContextMenuEntry,
  type ContextMenuSurface,
} from '@cujuju/solidjs-context-menu';
import type { AccordionGroupApi } from './context';
import { bulkClosableIds as sharedBulkClosableIds } from './visualOrder';

/**
 * MOCK — same status as the rest of this directory. The right-click menu for a
 * panel's ACTIVATOR: the rail button in `horizontal`, the header bar in
 * `vertical`, and the column title bar in `horizontal`.
 *
 * Two deliberate non-goals, because they are the usual way a control like this
 * grows a second personality:
 *
 * 1. It renders NO menu chrome of its own. Positioning, top-layer promotion,
 *    outside-click and Escape dismissal, submenu flyouts and viewport clamping
 *    all belong to `@cujuju/solidjs-context-menu`, which already solves them and
 *    is already a dependency here. A hand-rolled menu inside the accordion would
 *    be a second implementation of dismissal semantics that drifts from the
 *    first one the moment either is touched.
 * 2. It holds NO state. Every row's label, enablement and action is derived from
 *    `AccordionGroupApi` at read time, so the menu cannot disagree with the dock
 *    it is describing. The only local state is the click point.
 */

/**
 * Row labels, exported so a test can assert on the built entry list without
 * duplicating the strings it is checking (a duplicated literal in a test asserts
 * that the test is self-consistent, not that the menu is correct).
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
 * Tooltips shown on a DISABLED row. Every disabled row gets one: a greyed-out
 * item with no explanation makes the user hunt for the state that would enable
 * it, which is exactly the information the menu is already holding.
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
 * `moveBy` offsets. Up is toward index 0 in BOTH orientations, because the
 * activators stack downward either way — headers go down the panel, rail buttons
 * go down the rail — so "up" never has to mean "left" here.
 */
const MOVE_UP_DELTA = -1;
const MOVE_DOWN_DELTA = 1;

/** First position in the user order — the index at which "Move Up" is a no-op. */
const FIRST_ORDER_INDEX = 0;

/** `Array.prototype.indexOf` miss. A panel that is not in the order is a leaf. */
const NOT_IN_ORDER = -1;

/**
 * Display-only shortcut hints, mirroring the real bindings in `keys.ts`
 * (`Alt+ArrowUp` / `Alt+ArrowDown` on a focused activator). They are shown ONLY
 * when the group is reorderable, because that is the same condition the key
 * handler gates on — advertising a keystroke that the handler will swallow is
 * worse than showing nothing.
 */
const MOVE_UP_SHORTCUT = 'Alt+↑';
const MOVE_DOWN_SHORTCUT = 'Alt+↓';

/**
 * Open panels that a BULK close is allowed to touch: open, not pinned, not a
 * leaf.
 *
 * Both exemptions are the group's own rules, not this menu's, and both are worth
 * stating out loud:
 *
 * - PINNED is the entire point of the pin in this control. `collapseAll` spares
 *   pinned panels, so "Close All" from the menu must spare exactly the same set
 *   or the pin would mean two different things depending on which affordance the
 *   user reached for.
 * - LEAVES have no activator and are the RESULT of a selection made in the
 *   columns (see `PanelMeta.isLeaf`). `setOpen` already exempts them from
 *   single-policy auto-collapse for that reason; a bulk close that swept them
 *   away would discard the thing the user's last click produced.
 */
function bulkClosableIds(group: AccordionGroupApi): readonly string[] {
  // Through the shared rule rather than a hand-written inverse. This function
  // used to spell out `!isPinned && !isLeaf` itself, and its own comment conceded
  // that it "only PREDICTS" what `collapseAll` would do — a prediction that could
  // drift from the thing it predicts, while being used to grey out a row. Both
  // now read the same predicate, so the row's enablement and the action's effect
  // cannot disagree.
  return sharedBulkClosableIds(group.openOrder(), {
    isPinned: (id) => group.isPinned(id),
    isLeaf: (id) => group.meta(id)?.isLeaf === true,
  });
}

/**
 * True when at least one panel or leaf carries an explicit size. Read through
 * `sizeOf` rather than a size map because that accessor is the API's only public
 * view of it — and it covers sizes seeded from `defaultSize`, not just ones the
 * user dragged, so "Reset Sizes" stays enabled when there IS something to reset
 * even in a group whose splitters are turned off.
 */
function hasExplicitSizes(group: AccordionGroupApi): boolean {
  return [...group.panels(), ...group.leaves()].some(
    (meta) => group.sizeOf(meta.id) !== undefined,
  );
}

/** Concatenate non-empty sections with a divider between each pair. Sections that
 *  build out empty (e.g. the pin section for a non-pinnable panel) contribute no
 *  divider, so the menu never opens with a rule against its own edge. */
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
 * Build the menu entries for one panel, from live group state.
 *
 * Pure and DOM-free on purpose: it takes an `AccordionGroupApi` and an id and
 * returns plain data, so the enable/disable matrix — which is where the real
 * behaviour lives — is unit-testable against a hand-built stub API with no
 * renderer, no menu package and no jsdom.
 *
 * The hide-vs-disable rule used throughout, stated once: a row is HIDDEN only
 * when the capability does not exist for this panel at all (a non-pinnable panel
 * can never be pinned), and DISABLED when the capability exists but the current
 * state makes it a no-op (an already-closed panel). Hiding a state-blocked row
 * would make the menu change shape between openings and would hide the
 * capability itself, which is how a user concludes a feature is missing.
 *
 * Every enabled row does something observable. There are no rows here that run
 * an action the group will silently drop.
 */
export function buildPanelMenuItems(
  group: AccordionGroupApi,
  id: string,
): ContextMenuEntry[] {
  const meta = group.meta(id);
  const isOpen = group.isOpen(id);
  const isPinned = group.isPinned(id);

  // ── Pin ────────────────────────────────────────────────────────────────────
  // Hidden entirely when the panel is not pinnable: unlike every other row here,
  // this is a capability the panel's author turned off, not a transient state,
  // so a permanently-dead row would be pure noise on every open.
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
      // Not `collapseAll()` minus a re-open: closing this panel and immediately
      // reopening it would fire two `onChange` callbacks for a panel that never
      // moved, and under `append` placement the reopen would also relocate it.
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
  // Disabled rather than hidden at the ends, and disabled rather than hidden
  // when the group is not reorderable: in both cases moving IS a thing this
  // control does, and the row is where the user learns the keyboard equivalent.
  const orderIndex = group.order().indexOf(id);
  const lastOrderIndex = group.order().length - 1;
  const reorderable = group.reorderable();
  // A leaf is not in the order at all — it is terminal by definition, so there
  // is no position for it to move to.
  const inOrder = orderIndex !== NOT_IN_ORDER;

  /** The reason THIS move is unavailable, most-fundamental first, or undefined
   *  when it is available (the package ignores the tooltip on an enabled row —
   *  leaving it unset keeps the entry data honest for a test reading it). */
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
  // Group-wide, not per-panel, because `resetSizes` is: it hands sizing back to
  // the mode for every panel at once. Enabled whenever ANY panel carries an
  // explicit size, including panels other than the one right-clicked.
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
   * Last chance to filter, reorder or extend the generated rows before they are
   * rendered — the seam a host uses to add its own "Rename…" without forking
   * this file. Runs on every open, so it sees current state.
   */
  transform?: (entries: ContextMenuEntry[], id: string) => ContextMenuEntry[];
}

export interface PanelMenu {
  /**
   * Spread onto the panel's activator (rail button / header / column title bar).
   * Deliberately just the one handler: anything else here would collide with the
   * reorder primitive's own `itemProps`, which is spread onto the same element.
   */
  triggerProps: { onContextMenu: (e: MouseEvent) => void };
  /**
   * Render once inside the same component. Placement in the tree is irrelevant —
   * `ContextMenu` Portals itself to `<body>` and promotes into the top layer —
   * so put it wherever it reads best.
   */
  element: JSX.Element;
  /** Open at an explicit point, for callers that already own an `onContextMenu`
   *  (e.g. one that must also select the panel first). */
  openAt: (e: MouseEvent) => void;
  /**
   * Open anchored to an ELEMENT rather than a pointer — the keyboard path.
   *
   * A context menu reachable only by right-click is a set of commands a keyboard
   * user cannot issue: on the rail button, "Pin", "Close Others" and both Move
   * commands exist nowhere else in the chrome. Shift+F10 and the ContextMenu key
   * are the platform bindings for exactly this, and they carry no coordinates —
   * hence an element instead of an event.
   */
  openAtElement: (el: HTMLElement) => void;
  close: () => void;
  isOpen: Accessor<boolean>;
}

/**
 * Attach the panel context menu to one activator.
 *
 * Call in a component body; spread `triggerProps` on the activator and render
 * `element`. The id is an ACCESSOR rather than a value because the rail button
 * renders from a `<For>` over reactive metadata — a snapshot would bind the menu
 * to whichever panel occupied that slot at mount time and quietly act on the
 * wrong one after a reorder.
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
   * Where a menu opened from an element should appear: its bottom-left corner.
   *
   * Matches what a right-click on that element's leading edge would produce, so
   * the two entry points put the menu in the same place rather than in two
   * conventions the user has to hold separately.
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
