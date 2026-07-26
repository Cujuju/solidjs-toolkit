import { describe, expect, it } from 'vitest';
import { render } from 'solid-js/web';
import { AccordionGroup } from '../AccordionGroup';
import { AccordionPanel } from '../AccordionPanel';
import type { AccordionGroupApi } from '../context';

/**
 * `grow` AT THE GROUP LEVEL — the part `columnFlex`'s unit tests cannot reach.
 *
 * `columnFlex` is a pure function and is pinned directly in `columnFlex.test.ts`.
 * What it cannot answer is where its two group-scoped inputs come from, and that
 * plumbing is where this feature can silently do nothing:
 *
 *   • `groupHasDeclaredGrower` must be derived over the OPEN members, so a CLOSED
 *     grower falls back to the trailing default instead of promising the surplus
 *     to a panel nobody can see.
 *   • The flex must actually reach the panel ELEMENT, since a declaration that
 *     never becomes a style is a no-op that reads as implemented.
 */

/** Explicit sizes, so every open panel is fixed and the surplus is real — the
 *  situation that produced the dead strip in the first place. */
const SIZE_PX = 100;

function mount(options: {
  panels: readonly { id: string; grow?: boolean; defaultOpen?: boolean }[];
}) {
  let api!: AccordionGroupApi;
  const host = document.createElement('div');
  document.body.appendChild(host);

  const dispose = render(
    () => (
      <AccordionGroup mode="fill" policy="multi" apiRef={(a) => (api = a)}>
        {options.panels.map((p) => (
          <AccordionPanel
            id={p.id}
            title={p.id}
            grow={p.grow}
            defaultOpen={p.defaultOpen ?? true}
            defaultSize={SIZE_PX}
          >
            <div>{p.id} body</div>
          </AccordionPanel>
        ))}
      </AccordionGroup>
    ),
    host,
  );

  /** The rendered column element for a panel id, by the content element it owns. */
  const flexOf = (id: string): string => {
    const content = document.getElementById(api.meta(id)!.contentId);
    const panel = content?.closest('.acc-panel');
    return panel instanceof HTMLElement ? panel.style.flex : '';
  };

  return { api, flexOf, dispose: () => { dispose(); host.remove(); } };
}

describe('grow — the declaration reaches the element', () => {
  it('grows the declared panel and fixes the trailing one', () => {
    const { flexOf, dispose } = mount({
      panels: [{ id: 'a', grow: true }, { id: 'b' }],
    });

    expect(flexOf('a')).toBe(`1 1 ${SIZE_PX}px`);
    // Trailing, but someone declared — so it must NOT grow.
    expect(flexOf('b')).toBe(`0 0 ${SIZE_PX}px`);

    dispose();
  });

  it('lets two declared panels share, each from its own basis', () => {
    const { flexOf, dispose } = mount({
      panels: [{ id: 'a', grow: true }, { id: 'b', grow: true }],
    });

    expect(flexOf('a')).toBe(`1 1 ${SIZE_PX}px`);
    expect(flexOf('b')).toBe(`1 1 ${SIZE_PX}px`);

    dispose();
  });

  it('falls back to the trailing default when nothing declares', () => {
    const { flexOf, dispose } = mount({ panels: [{ id: 'a' }, { id: 'b' }] });

    expect(flexOf('a')).toBe(`0 0 ${SIZE_PX}px`);
    expect(flexOf('b')).toBe(`1 1 ${SIZE_PX}px`);

    dispose();
  });
});

describe('grow — a CLOSED grower does not hold the surplus hostage', () => {
  it('returns the surplus to the trailing member when the grower closes', () => {
    const { api, flexOf, dispose } = mount({
      panels: [{ id: 'a', grow: true }, { id: 'b' }],
    });

    expect(flexOf('b')).toBe(`0 0 ${SIZE_PX}px`);

    api.setOpen('a', false);

    /* With the only grower closed there is no declaration among the OPEN members,
       so the default applies again and `b` — now trailing and the only thing on
       screen — takes the room. Deriving over the whole registry instead would
       leave `b` fixed and reinstate the dead strip. */
    expect(flexOf('b')).toBe(`1 1 ${SIZE_PX}px`);

    dispose();
  });
});
