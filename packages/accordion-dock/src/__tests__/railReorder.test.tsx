import { describe, expect, it, vi } from 'vitest';
import { render } from 'solid-js/web';
import { AccordionGroup } from '../AccordionGroup';
import { AccordionPanel } from '../AccordionPanel';
import type { AccordionGroupApi } from '../context';

/**
 * Rail drag-reorder measures only the buttons the rail actually renders. A panel with no
 * button (open+pinned under the divider, or collapsed into `⋯`) has no rect, and must not
 * count as overlapped.
 */

const BUTTON_HEIGHT_PX = 40;
const BUTTON_PITCH_PX = 50;
const RAIL_TOP_PX = 100;
/** Past the primitive's 5px activation distance, well short of any neighbour. */
const WIGGLE_PX = 6;

function stubRect(el: Element, top: number): void {
  el.getBoundingClientRect = () =>
    ({
      top,
      height: BUTTON_HEIGHT_PX,
      bottom: top + BUTTON_HEIGHT_PX,
      left: 0,
      width: BUTTON_HEIGHT_PX,
      right: BUTTON_HEIGHT_PX,
      x: 0,
      y: top,
      toJSON: () => ({}),
    }) as DOMRect;
}

function mount(ids: readonly string[], onOrderChange: (order: readonly string[]) => void) {
  let api!: AccordionGroupApi;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const dispose = render(
    () => (
      <AccordionGroup
        orientation="horizontal"
        mode="fill"
        policy="multi"
        railDivider
        onOrderChange={onOrderChange}
        apiRef={(a) => (api = a)}
      >
        {ids.map((id) => (
          <AccordionPanel id={id} title={id}>
            <div>{id} body</div>
          </AccordionPanel>
        ))}
      </AccordionGroup>
    ),
    container,
  );

  const buttons = (): HTMLElement[] => [...container.querySelectorAll<HTMLElement>('.acc-rail-btn')];

  return {
    api: () => api,
    buttons,
    /** Lays the rendered buttons out top-down, then drags the first one by `delta`. */
    dragFirst: (delta: number): void => {
      buttons().forEach((b, i) => stubRect(b, RAIL_TOP_PX + i * BUTTON_PITCH_PX));
      const y = RAIL_TOP_PX + BUTTON_HEIGHT_PX / 2;
      buttons()[0].dispatchEvent(
        new PointerEvent('pointerdown', { clientY: y, bubbles: true, button: 0 }),
      );
      const move = (at: number): void => {
        document.dispatchEvent(new PointerEvent('pointermove', { clientY: at, bubbles: true }));
      };
      move(y + WIGGLE_PX - 1);
      move(y + delta);
      document.dispatchEvent(new PointerEvent('pointerup', { clientY: y + delta, bubbles: true, button: 0 }));
    },
    dispose: () => {
      dispose();
      container.remove();
    },
  };
}

describe('rail drag-reorder counts only rendered buttons', () => {
  it('a small wiggle does not reorder when a panel has no rail button', () => {
    const onOrderChange = vi.fn();
    const m = mount(['a', 'b', 'c'], onOrderChange);
    m.api().setOpen('c', true);
    m.api().togglePin('c');
    onOrderChange.mockClear();
    expect(m.buttons().map((b) => b.textContent?.trim())).not.toContain('c');

    m.dragFirst(WIGGLE_PX);

    expect(onOrderChange).not.toHaveBeenCalled();
    m.dispose();
  });

  it('a small wiggle does not reorder when every panel is rendered', () => {
    const onOrderChange = vi.fn();
    const m = mount(['a', 'b', 'c'], onOrderChange);
    expect(m.buttons()).toHaveLength(3);

    m.dragFirst(WIGGLE_PX);

    expect(onOrderChange).not.toHaveBeenCalled();
    m.dispose();
  });

  it('a drag onto the next rendered button moves past it in the full order', () => {
    const onOrderChange = vi.fn();
    const m = mount(['a', 'b', 'c'], onOrderChange);
    m.api().setOpen('c', true);
    m.api().togglePin('c');
    onOrderChange.mockClear();

    m.dragFirst(BUTTON_PITCH_PX);

    expect(onOrderChange).toHaveBeenLastCalledWith(['b', 'a', 'c']);
    m.dispose();
  });
});
