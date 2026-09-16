import { describe, it, expect } from 'vitest';
import { orderVisualOpen, survivesBulkClose, bulkClosableIds } from '../visualOrder';

/**
 * CONTRACT tests, not callsite tests: before the extraction each rule was copied into three
 * places. See DESIGN_NOTES.md § src/__tests__/visualOrder.test.ts:4.
 */

/** Membership predicate from a list. Reads at the callsite like the state it
 *  stands for, which keeps each test's precondition on one line. */
const oneOf =
  (...ids: string[]) =>
  (id: string): boolean =>
    ids.includes(id);

const NONE = (): boolean => false;

describe('orderVisualOpen — sequence', () => {
  it('paints non-leaf panels in USER order, not in the order they were opened', () => {
    // The single-order contract: one sequence read twice, by the rail and by the columns.
        // Open order deciding column order would make them disagree.
    const out = orderVisualOpen({
      order: ['a', 'b', 'c'],
      open: ['c', 'a'],
      isLeaf: NONE,
    });
    expect(out).toEqual(['a', 'c']);
  });

  it('omits closed panels', () => {
    const out = orderVisualOpen({ order: ['a', 'b', 'c'], open: ['b'], isLeaf: NONE });
    expect(out).toEqual(['b']);
  });

  it('ignores an open id that is not in the order', () => {
    // A panel can unregister while its id stays in the open list. Until it remounts it is
        // not in `order`, and must not paint.
    const out = orderVisualOpen({ order: ['a'], open: ['a', 'ghost'], isLeaf: NONE });
    expect(out).toEqual(['a']);
  });

  it('appends leaves after every panel — terminal means terminal', () => {
    // Declared with the leaf first on purpose: a leaf sorting into the middle
    // would put a file's detail view between two folders.
    const out = orderVisualOpen({
      order: ['files'],
      open: ['detail', 'files'],
      isLeaf: oneOf('detail'),
    });
    expect(out).toEqual(['files', 'detail']);
  });

  it('keeps leaves in open order when no chain sorter is supplied', () => {
    const out = orderVisualOpen({
      order: [],
      open: ['l2', 'l1'],
      isLeaf: oneOf('l1', 'l2'),
    });
    expect(out).toEqual(['l2', 'l1']);
  });

  it('sorts leaves through orderLeaves when one is supplied', () => {
    // This is the wiring that was missing entirely: nothing called
    // `bindLeafChain`, so `orderOpen` had zero callers and chained leaves painted
    // in whatever order they happened to open.
    const out = orderVisualOpen({
      order: ['files'],
      open: ['files', 'symbol', 'file'],
      isLeaf: oneOf('symbol', 'file'),
      orderLeaves: (ids) => [...ids].reverse(),
    });
    expect(out).toEqual(['files', 'file', 'symbol']);
  });

  it('hands orderLeaves ONLY the open leaves', () => {
    const seen: string[][] = [];
    orderVisualOpen({
      order: ['a', 'b'],
      open: ['a', 'leaf'],
      isLeaf: oneOf('leaf'),
      orderLeaves: (ids) => {
        seen.push([...ids]);
        return ids;
      },
    });
    expect(seen).toEqual([['leaf']]);
  });
});

describe('orderVisualOpen — flyout exclusion', () => {
  it('drops a flying-out panel from the painted sequence', () => {
    // An auto-hide flyout is an overlay the columns do not reflow around, so it
    // is not in the painted sequence — the definition, not a special case.
    const out = orderVisualOpen({
      order: ['a', 'b', 'c'],
      open: ['a', 'b', 'c'],
      isLeaf: NONE,
      isFlyout: oneOf('b'),
    });
    expect(out).toEqual(['a', 'c']);
  });

  it('makes the panel AFTER a flyout the splitter neighbour of the one before it', () => {
    // The concrete defect: `neighborOpenId` walks this sequence, so leaving the flyout in
        // handed a splitter a `display: none` neighbour — start size 0, jumping by the min-size clamp.
    const out = orderVisualOpen({
      order: ['a', 'b', 'c'],
      open: ['a', 'b', 'c'],
      isLeaf: NONE,
      isFlyout: oneOf('b'),
    });
    expect(out.indexOf('c')).toBe(out.indexOf('a') + 1);
  });

  it('moves the first-column marker to the first DOCKED column', () => {
    // `data-col-first` is `openIndex === 0`. With the flyout included it landed
    // on the overlay, so the column against the rail kept a separator that
    // doubled its edge.
    const out = orderVisualOpen({
      order: ['a', 'b'],
      open: ['a', 'b'],
      isLeaf: NONE,
      isFlyout: oneOf('a'),
    });
    expect(out[0]).toBe('b');
  });

  it('excludes a flying-out LEAF too', () => {
    const out = orderVisualOpen({
      order: [],
      open: ['l1', 'l2'],
      isLeaf: oneOf('l1', 'l2'),
      isFlyout: oneOf('l1'),
    });
    expect(out).toEqual(['l2']);
  });

  it('defaults to excluding nothing, so a dock without auto-hide is unaffected', () => {
    const out = orderVisualOpen({ order: ['a', 'b'], open: ['a', 'b'], isLeaf: NONE });
    expect(out).toEqual(['a', 'b']);
  });

  it('returns empty for an empty open list', () => {
    expect(orderVisualOpen({ order: ['a'], open: [], isLeaf: NONE })).toEqual([]);
  });
});

describe('survivesBulkClose', () => {
  const p = { isPinned: oneOf('pinned'), isLeaf: oneOf('leaf') };

  it('spares a pinned panel — that is what the pin is for', () => {
    expect(survivesBulkClose('pinned', p)).toBe(true);
  });

  it('spares a leaf — it is the result of the user’s last selection', () => {
    expect(survivesBulkClose('leaf', p)).toBe(true);
  });

  it('takes an ordinary open panel', () => {
    expect(survivesBulkClose('plain', p)).toBe(false);
  });
});

describe('bulkClosableIds', () => {
  it('is exactly the complement, in the order given', () => {
    const p = { isPinned: oneOf('b'), isLeaf: oneOf('d') };
    const open = ['a', 'b', 'c', 'd'];
    expect(bulkClosableIds(open, p)).toEqual(['a', 'c']);
    // The property that matters: the taken and the survivors must together be the whole
        // list, with nothing counted twice — the invariant a hand-written inverse broke.
    const survivors = open.filter((id) => survivesBulkClose(id, p));
    expect([...bulkClosableIds(open, p), ...survivors].sort()).toEqual(open);
  });

  it('is empty when everything open is pinned or a leaf', () => {
    // The state that disables Close All.
    const p = { isPinned: oneOf('a', 'b'), isLeaf: oneOf('c') };
    expect(bulkClosableIds(['a', 'b', 'c'], p)).toEqual([]);
  });
});
