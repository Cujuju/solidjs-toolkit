import { Show, type JSX } from 'solid-js';
import { useAccordionGroup } from './context';

/**
 * The drag handle on a panel's TRAILING edge — the boundary between it and the next
 * open panel.
 *
 * It is rendered by the panel rather than as a standalone sibling because flex
 * `order` decides visual sequence here: a free-standing splitter element would have
 * to be given an order value interleaved with the columns', and every reorder or
 * open/close would have to re-thread them. Anchoring the handle to the panel it
 * resizes makes that bookkeeping disappear.
 *
 * Renders only when there IS a next open panel — a handle on the last column would
 * resize the group itself, which the group does not own.
 */
export function Splitter(props: { id: string }): JSX.Element {
  const group = useAccordionGroup();

  const shown = (): boolean =>
    group.resizable() && group.isOpen(props.id) && group.neighborOpenId(props.id) !== undefined;

  return (
    <Show when={shown()}>
      <div
        class="vsa-splitter"
        role="separator"
        aria-orientation={group.orientation() === 'horizontal' ? 'vertical' : 'horizontal'}
        aria-label="Resize panel"
        onPointerDown={(e) => group.beginResize(props.id, e)}
        /* Never a reorder gesture: the two drags share an axis in vertical
           orientation and would otherwise race. */
        data-no-drag
      />
    </Show>
  );
}
