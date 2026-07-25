import { describe, it, expect } from 'vitest';
import type { ContextMenuEntry } from '@cujuju/solidjs-context-menu';
import {
  buildPanelMenuItems,
  PANEL_MENU_LABELS,
  PANEL_MENU_DISABLED_TOOLTIPS,
} from '../panelMenu';
import { createStubGroup, type StubGroupSpec } from './stubGroup';

/**
 * The menu's real behaviour is its ENABLE/DISABLE MATRIX — which rows exist, and
 * which are dead in a given state. That is data, so it is asserted as data.
 *
 * The hide-vs-disable rule under test throughout: a row is HIDDEN only when the
 * capability does not exist for this panel at all, DISABLED when the capability
 * exists but the current state makes it a no-op. A menu that changes SHAPE
 * between openings hides the capability itself.
 */

interface Row {
  label: string;
  disabled?: boolean;
  disabledTooltip?: string;
  shortcut?: string;
  onClick?: () => void;
}

/** Labelled rows only — dividers are structure, asserted separately. */
function rows(entries: ContextMenuEntry[]): Row[] {
  return entries.filter((e): e is ContextMenuEntry & Row => 'label' in e);
}

function labels(entries: ContextMenuEntry[]): string[] {
  return rows(entries).map((r) => r.label);
}

function row(entries: ContextMenuEntry[], label: string): Row {
  const found = rows(entries).find((r) => r.label === label);
  if (found === undefined) throw new Error(`no menu row labelled "${label}"`);
  return found;
}

function menuFor(spec: StubGroupSpec, id: string) {
  const stub = createStubGroup(spec);
  return { ...stub, items: buildPanelMenuItems(stub.group, id) };
}

const THREE: StubGroupSpec = {
  panels: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
  open: ['a', 'b', 'c'],
};

describe('buildPanelMenuItems — shape', () => {
  it('builds the full row set for an ordinary middle panel', () => {
    const { items } = menuFor(THREE, 'b');
    expect(labels(items)).toEqual([
      PANEL_MENU_LABELS.pin,
      PANEL_MENU_LABELS.close,
      PANEL_MENU_LABELS.closeOthers,
      PANEL_MENU_LABELS.closeAll,
      PANEL_MENU_LABELS.moveUp,
      PANEL_MENU_LABELS.moveDown,
      PANEL_MENU_LABELS.resetSizes,
    ]);
  });

  it('separates the four sections with dividers — and never opens with one', () => {
    const { items } = menuFor(THREE, 'b');
    expect(items[0]).not.toHaveProperty('divider');
    expect(items[items.length - 1]).not.toHaveProperty('divider');
    expect(items.filter((e) => 'divider' in e)).toHaveLength(3);
  });

  it('drops the divider with the section — a non-pinnable panel gets 2, not a leading rule', () => {
    const { items } = menuFor(
      { panels: [{ id: 'a', pinnable: false }, { id: 'b' }], open: ['a', 'b'] },
      'a',
    );
    expect(items[0]).not.toHaveProperty('divider');
    expect(items.filter((e) => 'divider' in e)).toHaveLength(2);
  });
});

describe('buildPanelMenuItems — pin', () => {
  it('is HIDDEN for a non-pinnable panel (a capability its author turned off)', () => {
    const { items } = menuFor({ panels: [{ id: 'a', pinnable: false }], open: ['a'] }, 'a');
    expect(labels(items)).not.toContain(PANEL_MENU_LABELS.pin);
    expect(labels(items)).not.toContain(PANEL_MENU_LABELS.unpin);
  });

  it('reads Unpin when pinned', () => {
    const { items } = menuFor({ panels: [{ id: 'a' }], open: ['a'], pinned: ['a'] }, 'a');
    expect(labels(items)).toContain(PANEL_MENU_LABELS.unpin);
    expect(labels(items)).not.toContain(PANEL_MENU_LABELS.pin);
  });

  it('toggles the pin', () => {
    const { items, calls, group } = menuFor({ panels: [{ id: 'a' }], open: ['a'] }, 'a');
    row(items, PANEL_MENU_LABELS.pin).onClick?.();
    expect(calls.togglePin).toEqual(['a']);
    expect(group.isPinned('a')).toBe(true);
  });
});

describe('buildPanelMenuItems — close family', () => {
  it('Close is DISABLED (not hidden) for a closed panel, with a reason', () => {
    const { items } = menuFor({ panels: [{ id: 'a' }, { id: 'b' }], open: ['b'] }, 'a');
    const r = row(items, PANEL_MENU_LABELS.close);
    expect(r.disabled).toBe(true);
    expect(r.disabledTooltip).toBe(PANEL_MENU_DISABLED_TOOLTIPS.alreadyClosed);
  });

  it('Close Others closes the others and leaves this one alone', () => {
    const { items, calls } = menuFor(THREE, 'b');
    row(items, PANEL_MENU_LABELS.closeOthers).onClick?.();
    expect(calls.setOpen).toEqual([
      { id: 'a', open: false },
      { id: 'c', open: false },
    ]);
  });

  it('Close Others is disabled when every OTHER open panel is pinned', () => {
    const { items } = menuFor({ ...THREE, pinned: ['a', 'c'] }, 'b');
    const r = row(items, PANEL_MENU_LABELS.closeOthers);
    expect(r.disabled).toBe(true);
    expect(r.disabledTooltip).toBe(PANEL_MENU_DISABLED_TOOLTIPS.nothingElseToClose);
  });

  it('Close Others ignores LEAVES — they are the result of the user’s last click', () => {
    const { items, calls } = menuFor(
      {
        panels: [{ id: 'a' }, { id: 'b' }, { id: 'detail', isLeaf: true }],
        open: ['a', 'b', 'detail'],
      },
      'b',
    );
    row(items, PANEL_MENU_LABELS.closeOthers).onClick?.();
    expect(calls.setOpen).toEqual([{ id: 'a', open: false }]);
  });

  it('Close All delegates to the group, so the pin/leaf exemption has ONE implementation', () => {
    const { items, calls, group } = menuFor({ ...THREE, pinned: ['c'] }, 'b');
    row(items, PANEL_MENU_LABELS.closeAll).onClick?.();
    expect(calls.collapseAll).toBe(1);
    // Not re-derived by the menu: the row only PREDICTS this for its disabled state.
    expect(calls.setOpen).toEqual([]);
    expect(group.openOrder()).toEqual(['c']);
  });

  it('Close All is disabled when every open panel is pinned', () => {
    const { items } = menuFor({ ...THREE, pinned: ['a', 'b', 'c'] }, 'b');
    const r = row(items, PANEL_MENU_LABELS.closeAll);
    expect(r.disabled).toBe(true);
    expect(r.disabledTooltip).toBe(PANEL_MENU_DISABLED_TOOLTIPS.nothingToClose);
  });

  it('a pinned panel can still close ITSELF — Close is an explicit action', () => {
    const { items } = menuFor({ ...THREE, pinned: ['b'] }, 'b');
    expect(row(items, PANEL_MENU_LABELS.close).disabled).toBe(false);
  });
});

describe('buildPanelMenuItems — move', () => {
  it('disables Move Up at the start and Move Down at the end, with edge reasons', () => {
    const first = menuFor(THREE, 'a').items;
    expect(row(first, PANEL_MENU_LABELS.moveUp).disabled).toBe(true);
    expect(row(first, PANEL_MENU_LABELS.moveUp).disabledTooltip).toBe(
      PANEL_MENU_DISABLED_TOOLTIPS.atStart,
    );
    expect(row(first, PANEL_MENU_LABELS.moveDown).disabled).toBe(false);

    const last = menuFor(THREE, 'c').items;
    expect(last && row(last, PANEL_MENU_LABELS.moveDown).disabled).toBe(true);
    expect(row(last, PANEL_MENU_LABELS.moveDown).disabledTooltip).toBe(
      PANEL_MENU_DISABLED_TOOLTIPS.atEnd,
    );
  });

  it('moves by ∓1 — up is toward index 0 in both orientations', () => {
    const { items, calls } = menuFor(THREE, 'b');
    row(items, PANEL_MENU_LABELS.moveUp).onClick?.();
    row(items, PANEL_MENU_LABELS.moveDown).onClick?.();
    expect(calls.moveBy).toEqual([
      { id: 'b', delta: -1 },
      { id: 'b', delta: 1 },
    ]);
  });

  it('a LEAF is not in the order at all — disabled with the structural reason', () => {
    const { items } = menuFor(
      { panels: [{ id: 'a' }, { id: 'detail', isLeaf: true }], open: ['a', 'detail'] },
      'detail',
    );
    const up = row(items, PANEL_MENU_LABELS.moveUp);
    expect(up.disabled).toBe(true);
    expect(up.disabledTooltip).toBe(PANEL_MENU_DISABLED_TOOLTIPS.notReorderable);
  });

  it('a non-reorderable group reports THAT reason, ahead of any edge reason', () => {
    // Most-fundamental first: telling a user at index 0 "Already first" when
    // reordering is off entirely would send them looking for the wrong fix.
    const { items } = menuFor({ ...THREE, reorderable: false }, 'a');
    expect(row(items, PANEL_MENU_LABELS.moveUp).disabledTooltip).toBe(
      PANEL_MENU_DISABLED_TOOLTIPS.reorderDisabled,
    );
  });

  it('advertises the keyboard shortcut only when the key handler would honour it', () => {
    const on = menuFor(THREE, 'b').items;
    expect(row(on, PANEL_MENU_LABELS.moveUp).shortcut).toBeDefined();
    expect(row(on, PANEL_MENU_LABELS.moveDown).shortcut).toBeDefined();

    const off = menuFor({ ...THREE, reorderable: false }, 'b').items;
    expect(row(off, PANEL_MENU_LABELS.moveUp).shortcut).toBeUndefined();
    expect(row(off, PANEL_MENU_LABELS.moveDown).shortcut).toBeUndefined();
  });

  it('leaves the tooltip UNSET on an enabled row', () => {
    // The package ignores it, but an entry carrying a reason it does not have
    // would lie to anything else reading the data.
    const { items } = menuFor(THREE, 'b');
    expect(row(items, PANEL_MENU_LABELS.moveUp).disabledTooltip).toBeUndefined();
  });
});

describe('buildPanelMenuItems — Reset Sizes', () => {
  it('is disabled when nothing carries an explicit size', () => {
    const { items } = menuFor(THREE, 'b');
    const r = row(items, PANEL_MENU_LABELS.resetSizes);
    expect(r.disabled).toBe(true);
    expect(r.disabledTooltip).toBe(PANEL_MENU_DISABLED_TOOLTIPS.noExplicitSizes);
  });

  it('is group-wide: enabled by ANOTHER panel’s size', () => {
    const { items } = menuFor({ ...THREE, sizes: { a: 240 } }, 'b');
    expect(row(items, PANEL_MENU_LABELS.resetSizes).disabled).toBe(false);
  });

  it('counts a LEAF’s size too', () => {
    const { items } = menuFor(
      {
        panels: [{ id: 'a' }, { id: 'detail', isLeaf: true }],
        open: ['a', 'detail'],
        sizes: { detail: 320 },
      },
      'a',
    );
    expect(row(items, PANEL_MENU_LABELS.resetSizes).disabled).toBe(false);
  });

  it('resets', () => {
    const { items, calls, group } = menuFor({ ...THREE, sizes: { a: 240 } }, 'b');
    row(items, PANEL_MENU_LABELS.resetSizes).onClick?.();
    expect(calls.resetSizes).toBe(1);
    expect(group.sizeOf('a')).toBeUndefined();
  });
});

describe('buildPanelMenuItems — an unregistered id', () => {
  it('still builds a menu, without a pin row', () => {
    // The rail can outlive a panel by one frame; a throw here would take the
    // whole right-click down.
    const { items } = menuFor(THREE, 'ghost');
    expect(labels(items)).not.toContain(PANEL_MENU_LABELS.pin);
    expect(labels(items)).toContain(PANEL_MENU_LABELS.close);
  });
});
