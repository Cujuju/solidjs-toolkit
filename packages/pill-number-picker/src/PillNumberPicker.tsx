import { onMount, Show, type JSX } from 'solid-js';
import { Portal } from 'solid-js/web';
import type { PillNumberPickerProps } from './types';
import { createPickerSession } from './createPickerSession';
import { createPickerInteraction } from './createPickerInteraction';
import { createPickerElements } from './createPickerElements';

export type { PnpLayout, PnpSegmentApi, PnpSegment, PillNumberPickerProps } from './types';

export function PillNumberPicker(props: PillNumberPickerProps): JSX.Element {
  const s = createPickerSession(props);
  const i = createPickerInteraction(props, s);
  const elements = createPickerElements(props, s, i);
  // Re-place once the panel has actually been laid out: the first `place()` runs before
    // the portalled panel is sized, so its measured height can be 0.
  const PanelBody = (): JSX.Element => {
    onMount(() => i.place());
    return (
      <div class="cpnp-items" data-layout={s.layout()}>
        {elements.items()}
      </div>
    );
  };

  return (
    <Show
      when={s.collapsible()}
      fallback={
        <div
          ref={s.setRootEl}
          class={`cpnp-root cpnp-size-${s.size()} ${props.class ?? ''}`.trim()}
          role="group"
          aria-label={props.ariaLabel}
          aria-disabled={props.disabled ? true : undefined}
        >
          {/* Items live in their own flex subcontainer so :first-child /
              :last-child corner rounding works regardless of suffix/range. */}
          <div class="cpnp-items" data-layout={s.layout()}>
            {elements.items()}
          </div>
          {elements.suffixNode()}
        </div>
      }
    >
      <div
        ref={s.setRootEl}
        class={`cpnp-root cpnp-size-${s.size()} ${props.class ?? ''}`.trim()}
        role="group"
        aria-label={props.ariaLabel}
        aria-disabled={props.disabled ? true : undefined}
        data-collapsible="true"
        data-open={s.isOpen() ? 'true' : undefined}
        onFocusOut={s.onWidgetFocusOut}
      >
        {/* The anchor stays in flow whether open or shut, so expanding NEVER reflows
            the row it lives in — the panel is a separate layer. */}
        <div ref={s.anchorEl} class="cpnp-items cpnp-anchor" data-layout={s.layout()}>
          {s.isCollapsed() ? elements.valueNode('collapsed') : elements.anchorPlaceholder()}
        </div>
        {elements.suffixNode()}

        <Show when={s.isOpen()}>
          <Portal>
            <div
              ref={s.panelEl}
              class={`cpnp-root cpnp-size-${s.size()} cpnp-popout ${props.class ?? ''}`.trim()}
              role="group"
              aria-label={props.ariaLabel}
              data-placement={i.popout()?.placement}
              style={{
                position: 'fixed',
                top: `${i.popout()?.top ?? 0}px`,
                left: `${i.popout()?.left ?? 0}px`,
                // Until the first measurement lands, the panel would otherwise paint
                // at 0,0 for one frame — a flash in the top-left corner of the screen.
                visibility: i.popout() ? 'visible' : 'hidden',
              }}
            >
              <PanelBody />
            </div>
          </Portal>
        </Show>
      </div>
    </Show>
  );
}
