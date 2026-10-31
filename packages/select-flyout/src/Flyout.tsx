/**
 * Author-rendered `<select>` alternative: UA `<option>` popups ignore `backdrop-filter`.
 * Single-select, no search, no virtualization, no form association (no hidden input; add `name` if needed).
 */
import AnchoredPopover from '@cujuju/solidjs-anchored-popover';
import { GlassMenu } from '@cujuju/solidjs-glass-menu';
import { For, type JSX } from 'solid-js';
import { ChevronDownIcon } from './ChevronDownIcon';
import { createFlyoutState } from './createFlyoutState';
import type { FlyoutProps } from './types';
export type { FlyoutOption, FlyoutProps } from './types';

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export function Flyout(props: FlyoutProps): JSX.Element {
  const state = createFlyoutState(props);
  return (
    <>
      <button
        ref={(el) => {
          state.triggerEl = el;
          state.setAnchor(el);
        }}
        type="button"
        id={props.id}
        class={cx(
          'cujuju-select-flyout-trigger',
          state.open() && 'cujuju-select-flyout-trigger-open',
          props.class,
        )}
        disabled={props.disabled}
        onClick={state.onTriggerClick}
        onKeyDown={state.onTriggerKeyDown}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={state.open()}
        aria-controls={state.panelId}
        aria-disabled={props.disabled}
        aria-label={props.ariaLabel}
      >
        <span
          class={cx(
            'cujuju-select-flyout-label',
            state.showPlaceholder() && 'cujuju-select-flyout-placeholder',
          )}
        >
          {state.showPlaceholder() ? (props.placeholder ?? '') : state.label()}
        </span>
        <span class="cujuju-select-flyout-chevron" aria-hidden="true">
          <ChevronDownIcon />
        </span>
      </button>

      {/* AnchoredPopover positions; GlassMenu paints the glass surface
          (headerless — no title/action/close). The inner <ul> is the
          listbox itself, so it carries `panelId`, the combobox's `aria-controls` target. */}
      <AnchoredPopover
        open={state.open}
        anchor={state.anchor}
        onDismiss={() => state.closePanel(true)}
        placement="below-start"
      >
        {/* Focusable panel root: a click on non-option chrome lands focus
            here, inside the keydown handler's reach, instead of on <body>. */}
        <GlassMenu
          class="cujuju-select-flyout-panel"
          tabIndex={-1}
          onKeyDown={state.onPanelKeyDown}
        >
          <ul
            ref={(el) => (state.listEl = el)}
            id={state.panelId}
            role="listbox"
            aria-label={props.ariaLabel}
            class="cujuju-select-flyout-list"
          >
          <For each={props.options}>
            {(opt, index) => {
              const isSelected = (): boolean => opt.value === props.value;
              const isFocused = (): boolean => state.focusedIndex() === index();
              return (
                <li>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected()}
                    aria-disabled={opt.disabled}
                    class={cx(
                      'cujuju-select-flyout-option',
                      isSelected() && 'cujuju-select-flyout-option-selected',
                      isFocused() && 'cujuju-select-flyout-option-focused',
                    )}
                    disabled={opt.disabled}
                    tabIndex={isFocused() ? 0 : -1}
                    onClick={() => state.selectOption(index())}
                    // Focus follows the highlight: Enter commits `focusedIndex`, so the two must agree.
                    onMouseEnter={() => {
                      if (opt.disabled) return;
                      state.setFocusedIndex(index());
                      state.focusOptionAt(index());
                    }}
                  >
                    {/* Selection is a CSS rail off `-option-selected`, not a marker element: no
                                            column reserved on every row. */}
                    <span>{opt.label}</span>
                  </button>
                </li>
              );
            }}
          </For>
          </ul>
        </GlassMenu>
      </AnchoredPopover>
    </>
  );
}
