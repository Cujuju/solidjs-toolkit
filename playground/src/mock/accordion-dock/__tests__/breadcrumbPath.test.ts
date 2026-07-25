import { describe, it, expect, vi } from 'vitest';
import {
  buildCrumbPath,
  elideCrumbs,
  CRUMB_ELISION_THRESHOLD,
  CRUMB_HEAD_COUNT,
  CRUMB_TAIL_COUNT,
  type CrumbData,
} from '../breadcrumbPath';
import { createStubGroup } from './stubGroup';

/** A path of `n` open panels named p0…p(n-1), all open, in order. */
function pathOf(n: number) {
  const ids = Array.from({ length: n }, (_, i) => `p${i}`);
  return createStubGroup({
    panels: ids.map((id) => ({ id, title: id.toUpperCase() })),
    open: ids,
  });
}

describe('buildCrumbPath — derivation', () => {
  it('follows the PAINTED sequence, so the leaf ends the path', () => {
    // Declared with the leaf first on purpose: a breadcrumb built from
    // registration order would read `detail › files`, which is backwards.
    const { group } = createStubGroup({
      panels: [
        { id: 'detail', title: 'Detail', isLeaf: true },
        { id: 'files', title: 'Files' },
      ],
      open: ['detail', 'files'],
    });
    expect(buildCrumbPath(group).map((c) => c.id)).toEqual(['files', 'detail']);
  });

  it('marks only the last crumb current', () => {
    const { group } = pathOf(3);
    const path = buildCrumbPath(group);
    expect(path.map((c) => c.isCurrent)).toEqual([false, false, true]);
  });

  it('skips an id that is open but no longer registered', () => {
    // `unregister` deliberately keeps the order entry so the panel returns where
    // the user put it. Until it remounts there is no label and no click target,
    // so it must contribute NO crumb rather than a blank one.
    const { group } = createStubGroup({
      panels: [{ id: 'a', title: 'A' }, { id: 'c', title: 'C' }],
      open: ['a', 'ghost', 'c'],
    });
    expect(buildCrumbPath(group).map((c) => c.id)).toEqual(['a', 'c']);
  });

  it('re-indexes around a skip, so index tracks POSITION IN THE PATH', () => {
    const { group } = createStubGroup({
      panels: [{ id: 'a', title: 'A' }, { id: 'c', title: 'C' }],
      open: ['a', 'ghost', 'c'],
    });
    expect(buildCrumbPath(group).map((c) => c.index)).toEqual([0, 1]);
  });

  it('carries isLeaf and isPinned through', () => {
    const { group } = createStubGroup({
      panels: [{ id: 'a', title: 'A' }, { id: 'z', title: 'Z', isLeaf: true }],
      open: ['a', 'z'],
      pinned: ['a'],
    });
    const path = buildCrumbPath(group);
    expect(path.map((c) => [c.isLeaf, c.isPinned])).toEqual([
      [false, true],
      [true, false],
    ]);
  });
});

describe('buildCrumbPath — labels', () => {
  it('prefers title, falls back to railLabel, then to the id', () => {
    const { group } = createStubGroup({
      panels: [
        { id: 'a', title: 'Alpha', railLabel: 'A' },
        { id: 'b', title: '', railLabel: 'Bee' },
        { id: 'c', title: '' },
      ],
      open: ['a', 'b', 'c'],
    });
    expect(buildCrumbPath(group).map((c) => c.label)).toEqual(['Alpha', 'Bee', 'c']);
  });

  it('text falls back to the panel tooltip when there is no string label', () => {
    const { group } = createStubGroup({
      panels: [{ id: 'a', title: '', tooltip: 'The alpha panel' }],
      open: ['a'],
    });
    const [crumb] = buildCrumbPath(group);
    // label is the id (renderable, never blank); text is the tooltip (for
    // attributes, which cannot carry a node).
    expect(crumb.label).toBe('a');
    expect(crumb.text).toBe('The alpha panel');
  });
});

describe('buildCrumbPath — select() truncation', () => {
  it('closes every panel AFTER the clicked crumb, and none before it', () => {
    const { group, calls } = pathOf(4);
    buildCrumbPath(group)[1].select();
    expect(calls.setOpen).toEqual([
      { id: 'p2', open: false },
      { id: 'p3', open: false },
    ]);
  });

  it('is a no-op on the current crumb', () => {
    const { group, calls } = pathOf(3);
    buildCrumbPath(group)[2].select();
    expect(calls.setOpen).toEqual([]);
  });

  it('closes a PINNED panel — the pin exempts from automatic collapse, not from an explicit close', () => {
    const { group, calls } = createStubGroup({
      panels: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      open: ['a', 'b', 'c'],
      pinned: ['c'],
    });
    buildCrumbPath(group)[0].select();
    expect(calls.setOpen).toEqual([
      { id: 'b', open: false },
      { id: 'c', open: false },
    ]);
  });

  it('never calls setOpen on a LEAF — a controlled pane closes only through onTruncate', () => {
    // Calling setOpen on a leaf would drop it from the group's open list while
    // its own <Show when={props.open}> keeps painting it: a visible pane the
    // group believes is closed, with a broken flex order and an orphaned
    // splitter.
    const { group, calls } = createStubGroup({
      panels: [{ id: 'files' }, { id: 'detail', isLeaf: true }],
      open: ['files', 'detail'],
    });
    const onTruncate = vi.fn();
    buildCrumbPath(group, { onTruncate })[0].select();

    expect(calls.setOpen).toEqual([]);
    expect(onTruncate).toHaveBeenCalledTimes(1);
    expect(onTruncate.mock.calls[0][0]).toEqual(['detail']);
  });

  it('fires onTruncate BEFORE the group edits, with every closed id and the clicked crumb', () => {
    const { group, calls } = pathOf(3);
    const seen: string[][] = [];
    const clicked: string[] = [];
    const onTruncate = vi.fn((ids: readonly string[], crumb: CrumbData) => {
      // Snapshot of what the group had done by the time the consumer ran.
      seen.push(calls.setOpen.map((c) => c.id));
      clicked.push(crumb.id);
      expect(ids).toEqual(['p1', 'p2']);
    });
    const path = buildCrumbPath(group, { onTruncate });
    path[0].select();

    expect(onTruncate).toHaveBeenCalledTimes(1);
    // Empty: the consumer ran BEFORE the group edited anything, so a controlled
    // leaf's `open` and the group's own list land in one synchronous pass.
    expect(seen).toEqual([[]]);
    expect(clicked).toEqual(['p0']);
  });

  it('resolves the clicked crumb’s position at CLICK time, not build time', () => {
    // A crumb handler captured during render must still truncate from where the
    // crumb now sits if the path shifted underneath it.
    const { group, calls, setOpenIds } = pathOf(4);
    const path = buildCrumbPath(group);
    const p2 = path[2];

    // p0 closes elsewhere; every later crumb shifts one slot toward the front.
    // (The path array is mutated by nothing here — select() re-finds by id.)
    setOpenIds(['p1', 'p2', 'p3']);
    p2.select();

    expect(calls.setOpen).toEqual([{ id: 'p3', open: false }]);
  });
});

describe('elideCrumbs', () => {
  it('leaves a path below the threshold untouched', () => {
    const path = buildCrumbPath(pathOf(CRUMB_ELISION_THRESHOLD - 1).group);
    const out = elideCrumbs(path);
    expect(out).toHaveLength(path.length);
    expect(out.every((e) => e.kind === 'crumb')).toBe(true);
  });

  it('collapses the middle at exactly the threshold', () => {
    const path = buildCrumbPath(pathOf(CRUMB_ELISION_THRESHOLD).group);
    const out = elideCrumbs(path);
    expect(out.map((e) => e.kind)).toEqual(['crumb', 'ellipsis', 'crumb', 'crumb']);
  });

  it('keeps head + tail and hands the ellipsis the ids it stands for', () => {
    const path = buildCrumbPath(pathOf(7).group);
    const out = elideCrumbs(path);
    const ellipsis = out.find((e) => e.kind === 'ellipsis');
    if (ellipsis?.kind !== 'ellipsis') throw new Error('expected an ellipsis entry');

    // The elision is not a crumb with a funny label — a renderer needs to know
    // WHICH crumbs it replaced, for a tooltip or an expand-in-place.
    expect(ellipsis.hidden.map((c) => c.id)).toEqual(['p1', 'p2', 'p3', 'p4']);

    const first = out[0];
    const last = out[out.length - 1];
    if (first.kind !== 'crumb' || last.kind !== 'crumb') {
      throw new Error('head and tail must survive elision as real crumbs');
    }
    expect(first.crumb.id).toBe('p0');
    expect(last.crumb.id).toBe('p6');
  });

  it('preserves total coverage: visible crumbs + hidden crumbs == the path', () => {
    const path = buildCrumbPath(pathOf(9).group);
    const out = elideCrumbs(path);
    const covered = out.flatMap((e) => (e.kind === 'crumb' ? [e.crumb.id] : e.hidden.map((c) => c.id)));
    expect(covered).toEqual(path.map((c) => c.id));
    expect(out.filter((e) => e.kind === 'crumb')).toHaveLength(CRUMB_HEAD_COUNT + CRUMB_TAIL_COUNT);
  });

  it('handles an empty path', () => {
    expect(elideCrumbs([])).toEqual([]);
  });
});
