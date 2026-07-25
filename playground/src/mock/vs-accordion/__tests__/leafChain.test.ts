import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRoot } from 'solid-js';
import { createLeafChain, bindLeafChain, leafChainFor } from '../leafChain';
import { createStubGroup } from './stubGroup';

/**
 * The leaf chain's whole job is `orderOpen` — turning "who is whose parent" into
 * the left-to-right column sequence. Everything worth testing is a case where the
 * open-list order and the chain order DISAGREE, because in the common case they
 * coincide and any implementation passes.
 */

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createLeafChain — links', () => {
  it('re-linking to a different parent replaces the edge', () => {
    const chain = createLeafChain();
    chain.link('c', 'a');
    expect(chain.parentOf('c')).toBe('a');
    chain.link('c', 'b');
    expect(chain.parentOf('c')).toBe('b');
    expect(chain.links().size).toBe(1);
  });

  it('unlink removes the edge; unlinking an absent child is a no-op', () => {
    const chain = createLeafChain();
    chain.link('c', 'a');
    chain.unlink('c');
    expect(chain.parentOf('c')).toBeUndefined();
    expect(() => chain.unlink('nobody')).not.toThrow();
  });

  it('link is identity-stable — re-linking to the SAME parent keeps the map', () => {
    // Matters because the leaf declares its link in an effect that re-runs on any
    // prop read; emitting a new Map each time would invalidate `visualOpenIds`
    // (a memo over `links()`) on every unrelated re-render.
    const chain = createLeafChain();
    chain.link('c', 'a');
    const first = chain.links();
    chain.link('c', 'a');
    expect(chain.links()).toBe(first);
  });
});

describe('createLeafChain — depthOf', () => {
  it('counts hops, 0 for an unchained leaf', () => {
    const chain = createLeafChain();
    chain.link('b', 'a');
    chain.link('c', 'b');
    expect(chain.depthOf('a')).toBe(0);
    expect(chain.depthOf('b')).toBe(1);
    expect(chain.depthOf('c')).toBe(2);
  });

  it('terminates on a cycle instead of looping', () => {
    // A typo'd parentId is the realistic source. The structural guarantee (a
    // visited set) is what makes a depth cap unnecessary — this test is what
    // holds that claim honest.
    const chain = createLeafChain();
    chain.link('a', 'b');
    chain.link('b', 'a');
    expect(chain.depthOf('a')).toBe(1);
    expect(chain.depthOf('b')).toBe(1);
  });
});

describe('createLeafChain — orderOpen', () => {
  it('sorts a chain that the open list holds BACKWARDS', () => {
    // The case the module comment is about: reopening a parent while its child is
    // still open leaves the open list reading [child, parent]. Without the chain
    // the columns paint in that order and the browser reads inside-out.
    const chain = createLeafChain();
    chain.link('symbol', 'file');
    expect(chain.orderOpen(['symbol', 'file'])).toEqual(['file', 'symbol']);
  });

  it('keeps two independent chains CONTIGUOUS rather than interleaving by depth', () => {
    // A depth sort would give [x0, y0, x1] — X's columns split around Y's.
    const chain = createLeafChain();
    chain.link('x1', 'x0');
    expect(chain.orderOpen(['x0', 'y0', 'x1'])).toEqual(['x0', 'x1', 'y0']);
  });

  it('emits a fork’s children in open order', () => {
    const chain = createLeafChain();
    chain.link('c1', 'root');
    chain.link('c2', 'root');
    expect(chain.orderOpen(['root', 'c2', 'c1'])).toEqual(['root', 'c2', 'c1']);
  });

  it('treats a leaf whose parent is a PANEL as a root', () => {
    // A panel parent is legal and useful ("this detail pane belongs to the folder
    // column"), and it is never in the open LEAF list — so the leaf must still be
    // entered, not stranded.
    const chain = createLeafChain();
    chain.link('detail', 'files-panel');
    expect(chain.orderOpen(['detail'])).toEqual(['detail']);
  });

  it('treats a leaf whose parent is CLOSED as a root', () => {
    const chain = createLeafChain();
    chain.link('symbol', 'file');
    expect(chain.orderOpen(['symbol'])).toEqual(['symbol']);
  });

  it('appends a cycle rather than dropping its columns', () => {
    // Degrading to the old open-list order is acceptable; a missing column is not.
    const chain = createLeafChain();
    chain.link('a', 'b');
    chain.link('b', 'a');
    expect(chain.orderOpen(['a', 'b'])).toEqual(['a', 'b']);
  });

  it('a cycle hanging off a real root still emits every id exactly once', () => {
    const chain = createLeafChain();
    chain.link('b', 'a');
    chain.link('c', 'b');
    chain.link('b2', 'c2');
    chain.link('c2', 'b2');
    const out = chain.orderOpen(['a', 'b', 'c', 'b2', 'c2']);
    expect(out.slice(0, 3)).toEqual(['a', 'b', 'c']);
    expect([...out].sort()).toEqual(['a', 'b', 'b2', 'c', 'c2']);
  });
});

describe('leafChainFor — the unbound fallback', () => {
  it('returns the bound chain once bindLeafChain has run', () => {
    createRoot((dispose) => {
      const { group } = createStubGroup({ panels: [{ id: 'a' }] });
      const chain = createLeafChain();
      bindLeafChain(group, chain);
      expect(leafChainFor(group)).toBe(chain);
      dispose();
    });
  });

  it('warns ONCE, on the first link, when the group was never wired', () => {
    createRoot((dispose) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { group } = createStubGroup({ panels: [{ id: 'a' }] });

      const chain = leafChainFor(group);
      // Deferred: reading the chain for an UNCHAINED leaf must stay silent, or
      // every existing dock warns and the message stops meaning anything.
      expect(warn).not.toHaveBeenCalled();

      chain.link('child', 'parent');
      chain.link('child2', 'parent');
      expect(warn).toHaveBeenCalledTimes(1);

      // Degrades, does not throw: the link is still recorded.
      expect(chain.parentOf('child')).toBe('parent');
      dispose();
    });
  });
});
