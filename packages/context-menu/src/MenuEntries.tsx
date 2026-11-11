import { createEffect, createMemo, createSignal, For, on, Show } from 'solid-js';
import { CustomSubmenuScope, type SubmenuMenuOptions, type SubmenuScope } from './_internal/submenuScope.js';
import { SliderRow } from './SliderRow.js';
import { SubmenuItem } from './SubmenuItem.js';
import {
  type ContextMenuEntry,
  type ContextMenuItem,
  isButtonRow,
  isCustom,
  isDivider,
  isSlider,
  isSubmenu,
} from './types.js';
export { submenuCloseDelayMs } from './submenuTiming.js';
export type { ContextMenuSurface } from './_internal/submenuScope.js';

/**
 * Renders a list of {@link ContextMenuEntry} into menu rows. Used both
 * for the top-level menu body and — recursively — for each submenu's
 * body.
 */
export function MenuEntries(props: SubmenuMenuOptions & {
  items: ContextMenuEntry[];
  /** Open submenus close when this changes — the menu moved, so their flyouts would detach. */
  anchor?: () => unknown;
}) {
  const [activeSubmenu, setActiveSubmenu] = createSignal<symbol>();
  const scope: SubmenuScope = { menu: props, activeSubmenu, setActiveSubmenu };
  createEffect(on(() => props.anchor?.(), () => setActiveSubmenu(undefined), { defer: true }));

  return (
    <For each={props.items}>
      {(item) => {
        if (isDivider(item)) return <hr class="cujuju-context-menu-divider" />;
        if (isSlider(item)) return <Show when={!item.when || item.when()}><SliderRow item={item} /></Show>;
        if (isCustom(item)) {
          // Host-supplied JSX row — no default padding/hover; the custom
          // content owns its layout + interactions.
          return (
            <CustomSubmenuScope.Provider value={scope}>
              <div class="cujuju-context-menu-custom">{item.custom()}</div>
            </CustomSubmenuScope.Provider>
          );
        }
        if (isSubmenu(item)) {
          return <SubmenuItem submenu={item} scope={scope} builtin />;
        }
        if (isButtonRow(item)) {
          return (
            <div class="cujuju-context-menu-button-row">
              <For each={item.buttons}>
                {(btn) => (
                  <button
                    class="cujuju-context-menu-row-btn"
                    disabled={btn.disabled}
                    onClick={() => { btn.onClick(); props.onClose(); }}
                    type="button"
                  >
                    <Show when={btn.icon}>
                      {(icon) => <span class="cujuju-context-menu-icon">{icon()}</span>}
                    </Show>
                    {btn.label}
                  </button>
                )}
              </For>
            </div>
          );
        }
        const mi = item as ContextMenuItem;
        return (
          <Show when={!mi.when || mi.when()}>
            {(_visible) => {
              // Inside the `when` gate: a hidden row's icon may read state `when` guards.
              // Memoized: each factory call builds a new tree; check and render share one.
              const icon = createMemo(() => (typeof mi.icon === 'function' ? mi.icon() : mi.icon));
              return (
                <button
                  class={`cujuju-context-menu-item${mi.danger ? ' cujuju-context-menu-item-danger' : ''}`}
                  disabled={mi.disabled}
                  aria-pressed={mi.checked}
                  title={mi.disabled ? mi.disabledTooltip : undefined}
                  onClick={() => { mi.onClick(); if (!mi.keepOpen) props.onClose(); }}
                  type="button"
                >
                  <Show when={icon()}>
                    {(resolved) => <span class="cujuju-context-menu-icon">{resolved()}</span>}
                  </Show>
                  <span class="cujuju-context-menu-label">{mi.label}</span>
                  {/* Right-aligned shortcut hint (display-only). */}
                  <Show when={mi.shortcut}>
                    <span class="cujuju-context-menu-shortcut">{mi.shortcut}</span>
                  </Show>
                  {/* Rendered when `checked` is defined: `false` reserves the slot so
                      adjacent toggles align; `true` fills it with a Check glyph. */}
                  <Show when={mi.checked !== undefined}>
                    <span
                      class="cujuju-context-menu-check"
                      data-checked={mi.checked ? 'true' : 'false'}
                      aria-hidden="true"
                    >
                      <Show when={mi.checked}>
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      </Show>
                    </span>
                  </Show>
                </button>
              );
            }}
          </Show>
        );
      }}
    </For>
  );
}
