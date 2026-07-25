import { describe, expect, it, vi } from 'vitest';
import { createSignal, Show } from 'solid-js';
import { render } from 'solid-js/web';
import { AccordionGroup } from '../AccordionGroup';
import { AccordionLeaf } from '../AccordionLeaf';
import { AccordionPanel } from '../AccordionPanel';
import { ACCORDION_LAYOUT_VERSION, type AccordionGroupApi } from '../context';

/**
 * The group's INVARIANTS, tested at the level they are enforced.
 *
 * Each of these was violated by exactly one writer while three others honoured
 * it, which is the signature of a rule enforced at callsites instead of at the
 * one place the state is written. So these tests drive the API rather than the
 * UI: the question is not "does clicking work" but "can any entry point produce
 * a state the group says is impossible".
 */

/**
 * Mounts a group and hands back its api plus the callback spies.
 *
 * Solid's own `render` rather than a testing-library: the only thing these tests
 * need from a renderer is a live component and a `dispose`, and `solid-js/web`
 * already provides both without adding a dependency.
 */
function mountGroup(options: {
  maxOpen?: number;
  panels: readonly { id: string; defaultOpen?: boolean }[];
  storageKey?: string;
}) {
  const onChange = vi.fn();
  const onPinChange = vi.fn();
  const onSizeChange = vi.fn();
  const onOrderChange = vi.fn();
  let api!: AccordionGroupApi;

  const container = document.createElement('div');
  document.body.appendChild(container);
  const dispose = render(
    () => (
      <AccordionGroup
        policy="multi"
        maxOpen={options.maxOpen}
        storageKey={options.storageKey}
        apiRef={(a) => (api = a)}
        onChange={onChange}
        onPinChange={onPinChange}
        onSizeChange={onSizeChange}
        onOrderChange={onOrderChange}
      >
        {options.panels.map((p) => (
          <AccordionPanel id={p.id} title={p.id} defaultOpen={p.defaultOpen}>
            <div>{p.id} body</div>
          </AccordionPanel>
        ))}
      </AccordionGroup>
    ),
    container,
  );

  return {
    api: () => api,
    onChange,
    onPinChange,
    onSizeChange,
    onOrderChange,
    unmount: () => {
      dispose();
      container.remove();
    },
  };
}

const FOUR_PANELS = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];

describe('maxOpen is enforced by the writer, not by one caller', () => {
  it('holds when panels are opened one at a time', () => {
    const g = mountGroup({ maxOpen: 2, panels: FOUR_PANELS });
    for (const id of ['a', 'b', 'c', 'd']) g.api().setOpen(id, true);
    expect(g.api().openOrder()).toHaveLength(2);
    // The two most recent survive: eviction is least-recently-opened first.
    expect([...g.api().openOrder()]).toEqual(['c', 'd']);
  });

  it('holds through expandAll', () => {
    // The defect: `expandAll` called the raw writer, so a cap of 2 produced four
    // open panels — a state no sequence of user actions could have reached.
    const g = mountGroup({ maxOpen: 2, panels: FOUR_PANELS });
    g.api().expandAll();
    expect(g.api().openOrder()).toHaveLength(2);
  });

  it('holds through setLayout', () => {
    // Same defect, second entry point: a stored layout can name more open panels
    // than the cap allows, and restoring it must not install a state the group
    // would refuse to create.
    const g = mountGroup({ maxOpen: 2, panels: FOUR_PANELS });
    const applied = g.api().setLayout({
      version: ACCORDION_LAYOUT_VERSION,
      open: ['a', 'b', 'c', 'd'],
      pinned: [],
      order: ['a', 'b', 'c', 'd'],
      sizes: {},
    });
    expect(applied).toBe(true);
    expect(g.api().openOrder()).toHaveLength(2);
  });

  it('reports the eviction it performed, so a mirror cannot go stale', () => {
    const g = mountGroup({ maxOpen: 1, panels: FOUR_PANELS });
    g.api().setOpen('a', true);
    g.onChange.mockClear();
    g.api().setOpen('b', true);
    // Both halves: 'b' opened AND 'a' was closed by the cap. A consumer that only
    // heard the open would show two panels for a dock that has one.
    expect(g.onChange.mock.calls).toContainEqual(['b', true]);
    expect(g.onChange.mock.calls).toContainEqual(['a', false]);
  });

  it('does not bind when every open panel is exempt', () => {
    // Documented behaviour, pinned so the cap work above cannot quietly change it:
    // refusing the open would make the user's click appear to do nothing.
    const g = mountGroup({ maxOpen: 1, panels: FOUR_PANELS });
    g.api().setOpen('a', true);
    g.api().togglePin('a');
    g.api().setOpen('b', true);
    expect([...g.api().openOrder()]).toEqual(['a', 'b']);
  });
});

describe('every writer notifies', () => {
  it('setLayout reports pin changes', () => {
    // THE defect: setLayout fired onChange, onOrderChange and onSizeChange, and
    // silently skipped onPinChange — so a restore changed the pinned set and told
    // nobody.
    const g = mountGroup({ panels: FOUR_PANELS });
    g.onPinChange.mockClear();
    g.api().setLayout({
      version: ACCORDION_LAYOUT_VERSION,
      open: ['a'],
      pinned: ['a', 'b'],
      order: ['a', 'b', 'c', 'd'],
      sizes: {},
    });
    expect(g.onPinChange.mock.calls).toContainEqual(['a', true]);
    expect(g.onPinChange.mock.calls).toContainEqual(['b', true]);
  });

  it('setLayout reports pins it REMOVED, not just ones it added', () => {
    const g = mountGroup({ panels: FOUR_PANELS });
    g.api().togglePin('c');
    g.onPinChange.mockClear();
    g.api().setLayout({
      version: ACCORDION_LAYOUT_VERSION,
      open: [],
      pinned: [],
      order: ['a', 'b', 'c', 'd'],
      sizes: {},
    });
    expect(g.onPinChange.mock.calls).toContainEqual(['c', false]);
  });

  it('setLayout still reports order and sizes', () => {
    // Guarding the rewrite: routing through the shared writers must not drop the
    // notifications that already worked.
    const g = mountGroup({ panels: FOUR_PANELS });
    g.onOrderChange.mockClear();
    g.onSizeChange.mockClear();
    g.api().setLayout({
      version: ACCORDION_LAYOUT_VERSION,
      open: [],
      pinned: [],
      order: ['d', 'c', 'b', 'a'],
      sizes: { a: 300 },
    });
    expect(g.onOrderChange).toHaveBeenCalled();
    expect(g.onSizeChange).toHaveBeenCalled();
  });
});

describe('persistence is version-gated like an explicit layout', () => {
  const KEY = 'accTest:versioning';

  it('writes a version', () => {
    localStorage.clear();
    const g = mountGroup({ panels: FOUR_PANELS, storageKey: KEY });
    g.api().setOpen('a', true);
    const raw = localStorage.getItem(KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!).version).toBe(ACCORDION_LAYOUT_VERSION);
  });

  it('ignores stored state from an unrecognised shape', () => {
    // The asymmetry this closes: `setLayout` refused a mismatched version, while
    // the localStorage path — which runs on every page load — accepted anything.
    localStorage.clear();
    localStorage.setItem(
      KEY,
      JSON.stringify({ version: ACCORDION_LAYOUT_VERSION + 1, open: ['a', 'b'], pinned: [], order: [], sizes: {} }),
    );
    const g = mountGroup({ panels: FOUR_PANELS, storageKey: KEY });
    expect(g.api().openOrder()).toHaveLength(0);
  });

  it('ignores UNVERSIONED stored state, which is what pre-gate storage looks like', () => {
    localStorage.clear();
    localStorage.setItem(KEY, JSON.stringify({ open: ['a', 'b'], pinned: [], order: [], sizes: {} }));
    const g = mountGroup({ panels: FOUR_PANELS, storageKey: KEY });
    expect(g.api().openOrder()).toHaveLength(0);
  });

  it('restores state it wrote itself', () => {
    // The round trip, so "gate everything" cannot be satisfied by rejecting
    // everything — which is the failure mode a version check invites.
    localStorage.clear();
    const first = mountGroup({ panels: FOUR_PANELS, storageKey: KEY });
    first.api().setOpen('b', true);
    first.unmount();
    const second = mountGroup({ panels: FOUR_PANELS, storageKey: KEY });
    expect([...second.api().openOrder()]).toEqual(['b']);
  });
});

describe('a leaf is controlled — the group asks, it does not command', () => {
  /**
   * Mounts a group holding one panel and one leaf whose `open` prop the TEST owns,
   * the way a consumer does.
   */
  function mountWithLeaf() {
    const onClose = vi.fn();
    const [leafOpen, setLeafOpen] = createSignal(true);
    // Separate from `leafOpen`: one models the consumer closing the pane, the other
    // models the component going away entirely (a route change, a `<Show>`).
    const [leafMounted, setLeafMounted] = createSignal(true);
    let api!: AccordionGroupApi;

    const container = document.createElement('div');
    document.body.appendChild(container);
    const dispose = render(
      () => (
        <AccordionGroup orientation="horizontal" policy="multi" apiRef={(a) => (api = a)}>
          <AccordionPanel id="files" title="Files" defaultOpen>
            <div>files</div>
          </AccordionPanel>
          <Show when={leafMounted()}>
            <AccordionLeaf id="detail" title="Detail" open={leafOpen()} onClose={onClose}>
              <div>detail</div>
            </AccordionLeaf>
          </Show>
        </AccordionGroup>
      ),
      container,
    );

    return {
      api: () => api,
      onClose,
      setLeafOpen,
      setLeafMounted,
      unmount: () => {
        dispose();
        container.remove();
      },
    };
  }

  it('setOpen(leaf, false) asks the owner instead of editing the open list', () => {
    /*
     * THE defect. Editing the list directly left the leaf painting — its own
     * `<Show>` reads `props.open`, which nothing had changed — while the group
     * believed it closed: a pane on screen with a broken flex `order` and a
     * splitter that could not find its neighbour.
     *
     * It used to be prevented by the CALLER: `breadcrumbPath` skipped leaves and a
     * comment explained why. Every other caller was one `setOpen` away from the
     * desync.
     */
    const g = mountWithLeaf();
    expect(g.api().isOpen('detail')).toBe(true);

    g.api().setOpen('detail', false);

    expect(g.onClose).toHaveBeenCalledTimes(1);
    // Still open, because the owner has not flipped the prop yet. That is the
    // point: the group does not get to decide.
    expect(g.api().isOpen('detail')).toBe(true);
    g.unmount();
  });

  it('follows once the owner actually flips the prop', () => {
    const g = mountWithLeaf();
    g.api().setOpen('detail', false);
    g.setLeafOpen(false);
    expect(g.api().isOpen('detail')).toBe(false);
    g.unmount();
  });

  it('still closes a PANEL directly — only leaves are controlled', () => {
    // Guards the over-broad version of the fix.
    const g = mountWithLeaf();
    g.api().setOpen('files', false);
    expect(g.api().isOpen('files')).toBe(false);
    g.unmount();
  });

  it('drops a leaf from the open list when it unmounts', () => {
    // A leaf's open state is a mirror of a prop the consumer owns, so an entry that
    // outlives the component is not a memory — it is a claim about something that
    // no longer exists. It used to keep `isOpen` true forever, and get persisted.
    const g = mountWithLeaf();
    expect(g.api().openOrder()).toContain('detail');

    g.setLeafMounted(false);
    expect(g.api().openOrder()).not.toContain('detail');
    g.unmount();
  });

  it('keeps a PANEL\'s open state across an unmount', () => {
    // The deliberate asymmetry, pinned so the purge above cannot be widened into
    // it: a panel's open state is the group's own, and remembering it across a
    // remount is the same courtesy as remembering its position in the rail.
    const g = mountWithLeaf();
    expect(g.api().openOrder()).toContain('files');
    g.setLeafMounted(false);
    expect(g.api().openOrder()).toContain('files');
    g.unmount();
  });
});
