import { describe, it, expect } from 'vitest';
import { orderVisualOpen, partitionAtRail, showsRailButton } from '../visualOrder';
import { createStubGroup } from './stubGroup';

/**
 * THE RAIL AS THE STATIC/DYNAMIC DIVIDER — contract tests.
 *
 * The rule under test is a STATE MODEL, not a layout detail: `pinned` means "opens
 * as a docked column rather than a flyout", open/closed is an independent axis,
 * and everything else — where a column paints, whether it has a rail button,
 * whether its splitter exists — is derived from that pair. So these tests assert
 * the derivation directly, over all four combinations of open × pinned, rather
 * than through a rendered group where each precondition would take a gesture to
 * arrange and could fail for reasons unrelated to the rule.
 *
 * The panel and the leaf inherit this behaviour by CALLING these functions (and
 * the test stub calls them too), which is what makes a contract test here worth
 * more than the same assertion repeated at three callsites.
 */

const NEVER = (): boolean => false;
const isLeaf = (id: string): boolean => id.startsWith('leaf');

/** The painted-open sequence, so the partition's input is the real thing rather
 *  than a hand-ordered list that could disagree with what the group paints. */
const painted = (order: readonly string[], open: readonly string[]): readonly string[] =>
  orderVisualOpen({ order, open, isLeaf, isFlyout: NEVER });

describe('partitionAtRail — where the columns paint', () => {
  it('puts pinned columns BEFORE the rail and everything else after it', () => {
    const visualOpen = painted(['a', 'b', 'c'], ['a', 'b', 'c']);
    const p = partitionAtRail({ visualOpen, pinOrder: ['b'], isLeaf, enabled: true });

    expect(p.staticIds).toEqual(['b']);
    expect(p.dynamicIds).toEqual(['a', 'c']);
    // One static column → the rail takes slot 2, and the dynamic run starts at 3.
    expect(p.orderOf('b')).toBe(1);
    expect(p.railOrder).toBe(2);
    expect(p.orderOf('a')).toBe(3);
    expect(p.orderOf('c')).toBe(4);
    // Every column sits on its own side of the rail — the property the numbers exist for.
    expect(p.orderOf('b')).toBeLessThan(p.railOrder);
    expect(p.orderOf('a')).toBeGreaterThan(p.railOrder);
  });

  it('orders the static region by PIN order, not by panel order', () => {
    // Panel order is a,b,c; the user pinned c first, then a.
    const visualOpen = painted(['a', 'b', 'c'], ['a', 'b', 'c']);
    const p = partitionAtRail({ visualOpen, pinOrder: ['c', 'a'], isLeaf, enabled: true });

    expect(p.staticIds).toEqual(['c', 'a']);
    expect(p.orderOf('c')).toBeLessThan(p.orderOf('a'));
    // ...and the unpinned panel is still dynamic despite sitting between them in
    // panel order — the two sequences are genuinely independent.
    expect(p.dynamicIds).toEqual(['b']);
  });

  it('re-pinning moves a column to the END of the static run', () => {
    // What a Set does on delete+add, which is how `togglePin` re-pins — asserted
    // here because the static sequence DEPENDS on that being true.
    const pinned = new Set(['a', 'b']);
    pinned.delete('a');
    pinned.add('a');

    const visualOpen = painted(['a', 'b'], ['a', 'b']);
    const p = partitionAtRail({ visualOpen, pinOrder: [...pinned], isLeaf, enabled: true });
    expect(p.staticIds).toEqual(['b', 'a']);
  });

  it('never counts a leaf as static, even if something pinned it', () => {
    // A leaf has no rail button and no pin affordance; a stray pin must not drag
    // it in front of the rail, where its whole "terminal detail pane" meaning
    // would invert.
    const visualOpen = painted(['a'], ['a', 'leaf1']);
    const p = partitionAtRail({ visualOpen, pinOrder: ['leaf1', 'a'], isLeaf, enabled: true });

    expect(p.staticIds).toEqual(['a']);
    expect(p.dynamicIds).toContain('leaf1');
  });

  it('disabled → nothing is static and the rail keeps the leading slot', () => {
    const visualOpen = painted(['a', 'b'], ['a', 'b']);
    const p = partitionAtRail({ visualOpen, pinOrder: ['a'], isLeaf, enabled: false });

    expect(p.staticIds).toEqual([]);
    expect(p.railOrder).toBe(1);
    // Which is the stylesheet's welded `order: -1` behaviour: rail first, columns after.
    expect(p.orderOf('a')).toBeGreaterThan(p.railOrder);
  });

  it('leaves flex slot 0 free for the consumer\'s own children', () => {
    // An element with no `order` sits at 0; the group deliberately hosts arbitrary
    // consumer children, and they must keep their authored position rather than
    // being promoted ahead of the first column.
    const visualOpen = painted(['a'], ['a']);
    const p = partitionAtRail({ visualOpen, pinOrder: ['a'], isLeaf, enabled: true });
    expect(Math.min(p.orderOf('a'), p.railOrder)).toBeGreaterThan(0);
  });
});

describe('the separator-dropping edge columns', () => {
  it('is BOTH the leading static column and the first one after the rail', () => {
    const visualOpen = painted(['a', 'b', 'c'], ['a', 'b', 'c']);
    const p = partitionAtRail({ visualOpen, pinOrder: ['b'], isLeaf, enabled: true });

    // b is against the group's outer edge (where the rail used to be)...
    expect(p.isEdgeColumn('b')).toBe(true);
    // ...and a is the first column after the rail, so it abuts the rail's border.
    expect(p.isEdgeColumn('a')).toBe(true);
    // c abuts another column and keeps its separator.
    expect(p.isEdgeColumn('c')).toBe(false);
  });

  it('with nothing pinned, the first column still qualifies', () => {
    // The regression this guards: keying the attribute off "flex slot 1" alone
    // left NO column marked when the static run was empty, so the first column
    // drew a border a pixel from the rail's own.
    const visualOpen = painted(['a', 'b'], ['a', 'b']);
    const p = partitionAtRail({ visualOpen, pinOrder: [], isLeaf, enabled: true });

    expect(p.isEdgeColumn('a')).toBe(true);
    expect(p.isEdgeColumn('b')).toBe(false);
  });

  it('divider off → the column next to the rail, exactly as before', () => {
    const visualOpen = painted(['a', 'b'], ['a', 'b']);
    const p = partitionAtRail({ visualOpen, pinOrder: ['a'], isLeaf, enabled: false });
    expect(p.isEdgeColumn('a')).toBe(true);
    expect(p.isEdgeColumn('b')).toBe(false);
  });
});

describe('showsRailButton — all four combinations of open × pinned', () => {
  const cases: { open: boolean; pinned: boolean; shown: boolean; why: string }[] = [
    { open: true, pinned: true, shown: false, why: 'the column IS the panel’s presence' },
    { open: false, pinned: true, shown: true, why: 'collapsed-but-pinned reopens AS a column' },
    { open: true, pinned: false, shown: true, why: 'a flyout anchors to its button' },
    { open: false, pinned: false, shown: true, why: 'the ordinary closed panel' },
  ];

  for (const c of cases) {
    it(`open=${c.open} pinned=${c.pinned} → ${c.shown ? 'button' : 'no button'} (${c.why})`, () => {
      expect(
        showsRailButton('p', {
          isOpen: () => c.open,
          isPinned: () => c.pinned,
          enabled: true,
        }),
      ).toBe(c.shown);
    });
  }

  it('NOTHING can be stranded: every state without a button has a visible column', () => {
    // The safety property the model rests on, stated as itself rather than as four
    // separate assertions: the only buttonless state is the one where the panel is
    // on screen as a column.
    for (const open of [true, false]) {
      for (const pinned of [true, false]) {
        const hasButton = showsRailButton('p', {
          isOpen: () => open,
          isPinned: () => pinned,
          enabled: true,
        });
        const isVisibleColumn = open && pinned;
        expect(hasButton || isVisibleColumn).toBe(true);
      }
    }
  });

  it('divider off → every panel keeps its button, pinned or not', () => {
    expect(
      showsRailButton('p', { isOpen: () => true, isPinned: () => true, enabled: false }),
    ).toBe(true);
  });
});

describe('the three controls on a pinned column', () => {
  const pinnedColumn = () =>
    createStubGroup({
      panels: [{ id: 'a' }, { id: 'b' }],
      open: ['a', 'b'],
      pinned: ['a'],
    });

  it('the title bar COLLAPSES and keeps the pin — its button returns to the rail', () => {
    const stub = pinnedColumn();
    expect(stub.group.showsRailButton('a')).toBe(false);
    expect(stub.group.isStaticColumn('a')).toBe(true);

    stub.group.collapseKeepPin('a');

    expect(stub.group.isOpen('a')).toBe(false);
    // The point of the whole model: the pin SURVIVES the collapse...
    expect(stub.group.isPinned('a')).toBe(true);
    // ...so the panel is reachable again from the rail...
    expect(stub.group.showsRailButton('a')).toBe(true);
    // ...and it is no longer occupying the static region.
    expect(stub.group.isStaticColumn('a')).toBe(false);
  });

  it('reopening a collapsed-but-pinned panel restores a COLUMN, not a flyout', () => {
    const stub = pinnedColumn();
    stub.group.collapseKeepPin('a');
    stub.group.setOpen('a', true);

    // Still pinned + open ⇒ static column ⇒ no rail button. `isFlyout` in the real
    // group is `autoHide ∧ open ∧ ¬pinned ∧ ¬leaf`, so a pinned panel cannot be one.
    expect(stub.group.isPinned('a')).toBe(true);
    expect(stub.group.isStaticColumn('a')).toBe(true);
    expect(stub.group.showsRailButton('a')).toBe(false);
  });

  it('the × closes AND clears the pin, so the panel reopens as a flyout', () => {
    const stub = pinnedColumn();
    stub.group.closeAndUnpin('a');

    expect(stub.group.isOpen('a')).toBe(false);
    expect(stub.group.isPinned('a')).toBe(false);
    expect(stub.group.showsRailButton('a')).toBe(true);
  });

  it('collapse and close are DIFFERENT paths — the recorded calls do not alias', () => {
    // Guards the one refactor most likely to be attempted on this code: folding
    // two handlers that both "close the panel" into one.
    const stub = pinnedColumn();
    stub.group.collapseKeepPin('a');
    stub.group.closeAndUnpin('b');

    expect(stub.calls.collapseKeepPin).toEqual(['a']);
    expect(stub.calls.closeAndUnpin).toEqual(['b']);
  });
});

describe('the rail boundary', () => {
  it('is the LAST pinned column, and only that one', () => {
    const stub = createStubGroup({
      panels: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      open: ['a', 'b', 'c'],
      pinned: ['a', 'b'],
    });

    expect(stub.group.isRailBoundary('a')).toBe(false);
    // b is the last static column: its trailing edge is the rail, so its splitter
    // is suppressed (Splitter reads exactly this).
    expect(stub.group.isRailBoundary('b')).toBe(true);
    expect(stub.group.isRailBoundary('c')).toBe(false);
  });

  it('does not exist when nothing is pinned', () => {
    const stub = createStubGroup({
      panels: [{ id: 'a' }, { id: 'b' }],
      open: ['a', 'b'],
    });
    expect(stub.group.isRailBoundary('a')).toBe(false);
    expect(stub.group.isRailBoundary('b')).toBe(false);
  });
});

describe('the rail empties when everything is pinned', () => {
  it('serves no panels once every panel is an open pinned column', () => {
    const stub = createStubGroup({
      panels: [{ id: 'a' }, { id: 'b' }],
      open: ['a', 'b'],
      pinned: ['a', 'b'],
    });

    // The group renders a button per panel that `showsRailButton` admits; none do,
    // which is what drives the rail's zero-width collapse.
    const served = ['a', 'b'].filter((id) => stub.group.showsRailButton(id));
    expect(served).toEqual([]);
    // And both columns are static, so the rail has nothing on its dynamic side either.
    expect(stub.group.isStaticColumn('a')).toBe(true);
    expect(stub.group.isStaticColumn('b')).toBe(true);
  });

  it('refills the moment one column collapses', () => {
    const stub = createStubGroup({
      panels: [{ id: 'a' }, { id: 'b' }],
      open: ['a', 'b'],
      pinned: ['a', 'b'],
    });
    stub.group.collapseKeepPin('a');

    expect(['a', 'b'].filter((id) => stub.group.showsRailButton(id))).toEqual(['a']);
  });
});
