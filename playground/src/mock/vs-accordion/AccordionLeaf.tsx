import { Show, createEffect, createUniqueId, onCleanup, onMount, type JSX } from 'solid-js';
import { useAccordionGroup } from './context';
import { Close } from './icons';
import { Splitter } from './Splitter';

export interface AccordionLeafProps {
  /** Stable identity — the key for size persistence. */
  id: string;
  children: JSX.Element;

  /**
   * CONTROLLED visibility. A leaf has no activator of its own, so its open state is
   * always the consumer's: it is the answer to a selection made in the columns
   * before it ("a file is selected → show the detail pane"), never a thing the user
   * toggles directly.
   */
  open: boolean;

  title?: string | JSX.Element;
  icon?: JSX.Element;
  actions?: JSX.Element;
  /** Show a close (×). Fires `onClose` — the consumer still owns `open`. */
  closable?: boolean;
  onClose?: () => void;

  accent?: string;
  minSize?: number;
  defaultSize?: number;

  class?: string;
  contentClass?: string;
}

/**
 * A terminal detail pane at the end of the dock.
 *
 * This is the piece that turns the accordion into a MILLER-COLUMN browser: each
 * panel is a folder whose selection opens the next column, and the leaf is the file
 * at the end of the chain — a detail view, not another folder. It differs from a
 * panel in exactly four ways, all of which follow from "it has no activator":
 *
 *   1. No rail button and no clickable header (nothing to activate).
 *   2. Not reorderable — it is terminal by definition, so it is kept out of the
 *      user order entirely rather than being draggable into the middle.
 *   3. Exempt from `single`-policy auto-collapse. The leaf is the RESULT of the
 *      selection the user just made; collapsing it on the next click would destroy
 *      the thing that click produced.
 *   4. Controlled `open` — see the prop.
 *
 * It IS a first-class member for sizing: it resizes with a splitter and persists its
 * width like any column.
 */
export function AccordionLeaf(props: AccordionLeafProps): JSX.Element {
  const group = useAccordionGroup();

  const baseId = createUniqueId();
  const contentId = `${baseId}-content`;
  const horizontal = (): boolean => group.orientation() === 'horizontal';

  onMount(() => {
    group.register(
      {
        id: props.id,
        title: () => props.title ?? '',
        railLabel: () => undefined,
        count: () => undefined,
        icon: () => props.icon,
        tooltip: () => undefined,
        accent: () => props.accent,
        pinnable: () => false,
        closable: () => props.closable ?? true,
        minSize: () => props.minSize,
        railClass: () => undefined,
        isLeaf: true,
      },
      false,
    );
    if (props.defaultSize !== undefined && group.sizeOf(props.id) === undefined) {
      group.setSize(props.id, props.defaultSize);
    }
  });
  onCleanup(() => {
    group.unregister(props.id);
  });

  /** Mirror the controlled prop into the group's open list, which is what drives
   *  ordering, sizing and the splitter's neighbour lookup. */
  createEffect(() => {
    group.setOpen(props.id, props.open);
  });

  const sizeStyle = (): JSX.CSSProperties => {
    const px = group.sizeOf(props.id);
    if (px === undefined || !props.open) return {};
    return { flex: `0 0 ${px}px` };
  };

  return (
    <Show when={props.open}>
      <div
        ref={(el) => group.setPanelEl(props.id, el)}
        class={`vsa-panel vsa-leaf ${props.class ?? ''}`.trim()}
        data-open="true"
        data-leaf="true"
        style={{
          ...(props.accent !== undefined ? { '--vsa-accent': props.accent } : {}),
          ...(horizontal() ? { order: Math.max(group.openIndex(props.id), 0) + 1 } : {}),
          ...sizeStyle(),
        }}
      >
        <Show when={props.title !== undefined}>
          <div class="vsa-col-bar">
            <Show when={props.icon}>
              <span class="vsa-icon">{props.icon}</span>
            </Show>
            <span class="vsa-title">{props.title}</span>
            <div class="vsa-header-tail">
              <Show when={props.actions}>
                <div class="vsa-actions">{props.actions}</div>
              </Show>
              <Show when={props.closable ?? true}>
                <button
                  type="button"
                  class="vsa-close"
                  data-no-drag
                  title="Close"
                  onClick={() => props.onClose?.()}
                >
                  <Close />
                </button>
              </Show>
            </div>
          </div>
        </Show>

        <div id={contentId} class={`vsa-content ${props.contentClass ?? ''}`.trim()}>
          {props.children}
        </div>

        <Splitter id={props.id} />
      </div>
    </Show>
  );
}
