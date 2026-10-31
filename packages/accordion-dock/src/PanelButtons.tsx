import { Show, type JSX } from 'solid-js';
import { type AccordionGroupApi } from './context';
import { Close, Pin, PinOff } from './icons';

/** Shared so the vertical header and the horizontal column bar cannot drift. */
export function PanelPinButton(props: {
  group: AccordionGroupApi;
  id: string;
  shown: boolean;
  pinned: boolean;
}): JSX.Element {
  return (
    <Show when={props.shown}>
      <button
        type="button"
        class="acc-pin"
        /* Excluded from drag activation — see REORDER_SKIP_SELECTOR. Without this,
           pressing the pin inside a draggable header would start a reorder. */
        data-no-drag
        aria-pressed={props.pinned}
        title={
          props.pinned
            ? 'Pinned — stays open when another panel is opened'
            : 'Pin — keep open when another panel is opened'
        }
        onClick={() => props.group.togglePin(props.id)}
      >
        {/* The glyph shows the STATE, not the action: `aria-pressed` already names the
                    action, and an icon that flips to the verb makes "is it pinned?" unanswerable. */}
        <Show when={props.pinned} fallback={<PinOff />}>
          <Pin />
        </Show>
      </button>
    </Show>
  );
}

export function CloseButton(props: { onClick: () => void }): JSX.Element {
  return (
    <button
      type="button"
      class="acc-close"
      data-no-drag
      title="Close"
      onClick={props.onClick}
    >
      <Close />
    </button>
  );
}
