import { describe, expect, it, vi } from 'vitest';
import { render } from 'solid-js/web';
import { AccordionGroup } from '../AccordionGroup';
import { AccordionPanel } from '../AccordionPanel';
import type { AccordionGroupApi, AccordionOrientation } from '../context';

/**
 * AUTO-HIDE IN `vertical` — the parity contract.
 *
 * Auto-hide was horizontal-only, on the stated reasoning that a flyout anchored
 * to a full-width header "would cover its own siblings". Covering siblings is
 * what an overlay is; the claim that would have justified the exclusion is that
 * it covers its own ACTIVATOR, and a bottom-anchored flyout does not.
 *
 * These assert the behaviour that makes the two orientations the same feature,
 * plus the ONE structural difference between them (whether the docked shell is
 * removed from the layout). They are DOM-level rather than pixel-level: jsdom has
 * no layout, so "overlays rather than reflows" is asserted as "the panel does not
 * take a docked slot and its content is not in flow" — the mechanism that
 * produces the overlay — rather than by measuring boxes that jsdom would invent.
 */
function mountGroup(options: {
  orientation: AccordionOrientation;
  autoHide?: boolean;
  panels: readonly { id: string; defaultOpen?: boolean }[];
}) {
  const onPinChange = vi.fn();
  let api!: AccordionGroupApi;

  const container = document.createElement('div');
  document.body.appendChild(container);
  const dispose = render(
    () => (
      <AccordionGroup
        orientation={options.orientation}
        policy="multi"
        autoHide={options.autoHide ?? true}
        apiRef={(a) => (api = a)}
        onPinChange={onPinChange}
      >
        {options.panels.map((p) => (
          <AccordionPanel id={p.id} title={p.id} defaultOpen={p.defaultOpen}>
            <div data-testid={`${p.id}-body`}>{p.id} body</div>
          </AccordionPanel>
        ))}
      </AccordionGroup>
    ),
    container,
  );

  const panelEl = (id: string): HTMLElement | null =>
    container.querySelector(`.acc-panel[data-panel-id="${id}"]`) ??
    // The panel does not carry its id as an attribute in every build; fall back to
    // position, which is stable for these fixtures.
    (container.querySelectorAll('.acc-panel')[
      options.panels.findIndex((p) => p.id === id)
    ] as HTMLElement | undefined) ??
    null;

  return {
    api: () => api,
    container,
    panelEl,
    onPinChange,
    unmount: () => {
      dispose();
      container.remove();
    },
  };
}

const TWO = [{ id: 'a' }, { id: 'b' }];

describe('vertical auto-hide — a flyout is possible at all', () => {
  it('an open UNPINNED panel is a flyout', () => {
    // The bug this replaces: `isFlyout` returned false for vertical outright, so
    // the `autoHide` prop was silently inert and the panel just docked.
    const g = mountGroup({ orientation: 'vertical', panels: TWO });
    g.api().setOpen('a', true);

    expect(g.api().isFlyout('a')).toBe(true);
    g.unmount();
  });

  it('an open PINNED panel is NOT a flyout — it takes real space', () => {
    const g = mountGroup({ orientation: 'vertical', panels: TWO });
    g.api().setOpen('a', true);
    g.api().togglePin('a');

    expect(g.api().isPinned('a')).toBe(true);
    expect(g.api().isFlyout('a')).toBe(false);
    g.unmount();
  });

  it('pinning a flyout promotes it in place, with no transition code', () => {
    // The derivation contract: `isFlyout` is a predicate over open × pinned, so
    // promotion is a state change, never a move.
    const g = mountGroup({ orientation: 'vertical', panels: TWO });
    g.api().setOpen('a', true);
    expect(g.api().isFlyout('a')).toBe(true);

    g.api().togglePin('a');
    expect(g.api().isFlyout('a')).toBe(false);

    g.api().togglePin('a');
    expect(g.api().isFlyout('a')).toBe(true);
    g.unmount();
  });

  it('a CLOSED panel is never a flyout, pinned or not', () => {
    const g = mountGroup({ orientation: 'vertical', panels: TWO });
    expect(g.api().isFlyout('a')).toBe(false);
    g.api().togglePin('a');
    expect(g.api().isFlyout('a')).toBe(false);
    g.unmount();
  });

  it('autoHide off → an open unpinned panel docks, as before', () => {
    const g = mountGroup({ orientation: 'vertical', autoHide: false, panels: TWO });
    g.api().setOpen('a', true);
    expect(g.api().isFlyout('a')).toBe(false);
    g.unmount();
  });
});

describe('vertical auto-hide — the activator survives', () => {
  it('the header bar stays in the DOM while its panel is flying out', () => {
    // THE invariant the whole feature rests on: the flyout is anchored to this
    // element and dismissed through it. Horizontal removes the docked shell
    // wholesale (`display: none`), which in vertical would take the header with
    // it and leave the flyout anchored to a box that no longer exists.
    const g = mountGroup({ orientation: 'vertical', panels: TWO });
    g.api().setOpen('a', true);

    const el = g.panelEl('a');
    expect(el).not.toBeNull();
    expect(el!.querySelector('.acc-header-row')).not.toBeNull();
    g.unmount();
  });

  it('the flying-out panel is marked, so CSS can size it as collapsed', () => {
    const g = mountGroup({ orientation: 'vertical', panels: TWO });
    g.api().setOpen('a', true);

    expect(g.panelEl('a')!.getAttribute('data-flyout')).toBe('true');
    g.unmount();
  });

  it("the panel's inline content host is hidden, so the content is not in flow twice", () => {
    // The subtree is portalled into the flyout; the inline host must not also
    // render it, or the panel would reflow exactly as a docked one does — which
    // is the thing an overlay exists not to do.
    const g = mountGroup({ orientation: 'vertical', panels: TWO });
    g.api().setOpen('a', true);

    const host = g.panelEl('a')!.querySelector('.acc-content') as HTMLElement | null;
    expect(host).not.toBeNull();
    expect(host!.hasAttribute('hidden')).toBe(true);
    g.unmount();
  });

  it('a PINNED panel keeps its content in flow — that is what pinning means', () => {
    const g = mountGroup({ orientation: 'vertical', panels: TWO });
    g.api().setOpen('a', true);
    g.api().togglePin('a');

    const host = g.panelEl('a')!.querySelector('.acc-content') as HTMLElement | null;
    expect(host!.hasAttribute('hidden')).toBe(false);
    expect(g.panelEl('a')!.getAttribute('data-flyout')).toBe('false');
    g.unmount();
  });
});

describe('the orientation-neutral parts did not fork', () => {
  it('collapseKeepPin and closeAndUnpin behave identically in vertical', () => {
    const g = mountGroup({ orientation: 'vertical', panels: TWO });
    g.api().setOpen('a', true);
    g.api().togglePin('a');

    g.api().collapseKeepPin('a');
    expect(g.api().isOpen('a')).toBe(false);
    expect(g.api().isPinned('a')).toBe(true); // the pin SURVIVES

    g.api().setOpen('a', true);
    g.api().closeAndUnpin('a');
    expect(g.api().isOpen('a')).toBe(false);
    expect(g.api().isPinned('a')).toBe(false); // the pin is DROPPED
    g.unmount();
  });

  it('showsRailButton collapses to "always" in vertical, with no special case', () => {
    // A vertical panel's activator is its own header, which is always rendered —
    // so the rail-button question has one answer and it is not orientation-specific
    // logic, it is the rule returning the same value for every input.
    const g = mountGroup({ orientation: 'vertical', panels: TWO });
    expect(g.api().showsRailButton('a')).toBe(true);
    g.api().setOpen('a', true);
    g.api().togglePin('a');
    expect(g.api().showsRailButton('a')).toBe(true);
    g.unmount();
  });

  it('partitionAtRail is INERT in vertical — the rail is a horizontal concept', () => {
    // Confirmed rather than assumed, per the parity brief: `railDivider` gates on
    // orientation, so a pinned vertical panel is not dragged into a "static
    // region" that has no meaning on this axis.
    const g = mountGroup({ orientation: 'vertical', panels: TWO });
    g.api().setOpen('a', true);
    g.api().togglePin('a');

    expect(g.api().railDivider()).toBe(false);
    expect(g.api().isStaticColumn('a')).toBe(false);
    expect(g.api().isRailBoundary('a')).toBe(false);
    g.unmount();
  });
});

describe('horizontal is unchanged', () => {
  it('still flies out when open and unpinned', () => {
    const g = mountGroup({ orientation: 'horizontal', panels: TWO });
    g.api().setOpen('a', true);
    expect(g.api().isFlyout('a')).toBe(true);
    g.unmount();
  });

  it('still removes the docked shell from the layout while flying out', () => {
    // The horizontal-only rule: the rail button is the activator, so the column
    // can go entirely.
    const g = mountGroup({ orientation: 'horizontal', panels: TWO });
    g.api().setOpen('a', true);
    expect(g.panelEl('a')!.getAttribute('data-flyout')).toBe('true');
    g.unmount();
  });

  it('still puts a pinned open column in the static region', () => {
    const g = mountGroup({ orientation: 'horizontal', panels: TWO });
    g.api().setOpen('a', true);
    g.api().togglePin('a');

    expect(g.api().railDivider()).toBe(true);
    expect(g.api().isStaticColumn('a')).toBe(true);
    g.unmount();
  });
});
