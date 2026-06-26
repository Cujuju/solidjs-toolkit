import { createSignal, createEffect, For, Show } from 'solid-js';
import { Portal } from 'solid-js/web';
import { createAfterPaint } from '@cujuju/solidjs-hooks';
import { GlassMenu } from '@cujuju/solidjs-glass-menu';
import {
  type ContextMenuEntry,
  type ContextMenuSlider,
  type ContextMenuSubmenu,
  type ContextMenuItem,
  isDivider,
  isSlider,
  isSubmenu,
  isButtonRow,
  isCustom,
} from './types';

/** Surface treatment shared by a menu and all its descendant submenus.
 *  `'glass'` (default) = the `GlassMenu` glassmorphism shell; `'solid'` = a
 *  plain opaque card (host-themed via `.cujuju-context-menu--solid`). Threaded
 *  through every level so submenu flyouts match their parent. */
export type ContextMenuSurface = 'glass' | 'solid';
import { computeSubmenuStyle } from './submenuPosition';
import { POPOVER_STACK_ATTR } from './_internal/popoverStack';

/** A labelled range-slider row. Focuses the input on hover so the
 *  arrow keys adjust it without a click. */
function SliderRow(props: { item: ContextMenuSlider }) {
  let inputRef: HTMLInputElement | undefined;
  return (
    <div
      class="cujuju-context-menu-slider-row"
      onMouseEnter={() => inputRef?.focus()}
      onMouseLeave={() => inputRef?.blur()}
    >
      <div class="cujuju-context-menu-slider-header">
        <span class="cujuju-context-menu-slider-label">{props.item.label}</span>
        <span class="cujuju-context-menu-slider-value">
          {props.item.value()}{props.item.unit ?? ''}
        </span>
      </div>
      <input
        ref={inputRef}
        type="range"
        min={props.item.min}
        max={props.item.max}
        step={props.item.step ?? 1}
        value={props.item.value()}
        onInput={(e) => props.item.onChange(parseInt(e.currentTarget.value, 10))}
        class="cujuju-context-menu-slider"
      />
    </div>
  );
}

function SubmenuItem(props: {
  item: ContextMenuSubmenu;
  onClose: () => void;
  index: number;
  activeSubmenu: () => number;
  setActiveSubmenu: (i: number) => void;
  parentMenuRef: () => HTMLElement | null;
  surface: ContextMenuSurface;
}) {
  const [filter, setFilter] = createSignal('');
  const [flyoutStyle, setFlyoutStyle] = createSignal<Record<string, string>>({});
  let wrapperRef: HTMLDivElement | undefined;
  let flyoutRef: HTMLDivElement | undefined;
  let searchRef: HTMLInputElement | undefined;
  let resizeObserver: ResizeObserver | undefined;

  const isOpen = () => props.activeSubmenu() === props.index;
  const afterPaint = createAfterPaint();
  const afterResize = createAfterPaint();

  function positionFlyout() {
    if (!flyoutRef || !wrapperRef) return;
    const triggerRect = wrapperRef.getBoundingClientRect();
    const flyoutRect = flyoutRef.getBoundingClientRect();
    // Anchor on the OUTER parent menu rect; fall back to the wrapper
    // rect when the parent ref is not wired yet (late ref population).
    const parentRect = props.parentMenuRef()?.getBoundingClientRect() ?? triggerRect;
    setFlyoutStyle(
      computeSubmenuStyle({
        triggerRect,
        parentRect,
        flyoutRect,
        viewportW: window.innerWidth,
        viewportH: window.innerHeight,
        scrollable: props.item.scrollable ?? false,
      }),
    );
  }

  function enter() {
    props.setActiveSubmenu(props.index);
  }

  // Lifecycle: position the flyout, manage a ResizeObserver, and drive
  // top-layer membership from open state. The submenu is itself a
  // popover='manual' element so it paints above every normal stacking
  // context. Top-layer order is LIFO of showPopover() calls, which
  // would naively place the submenu ABOVE the parent menu and break
  // the tuck-under — so after the submenu opens we re-promote the
  // parent (hidePopover() + showPopover() synchronously; the browser
  // only paints the final state, no flicker). Final layer order:
  //   top of LIFO (paints last)  parent
  //                              submenu
  //   bottom of LIFO             everything else
  createEffect(() => {
    if (isOpen()) {
      afterPaint(() => {
        positionFlyout();
        if (flyoutRef) {
          if (!flyoutRef.matches(':popover-open')) {
            flyoutRef.showPopover();
          }
          // Re-promote the parent ABOVE the just-shown submenu. The
          // WHATWG popover spec requires hidePopover() before
          // showPopover() on an open popover (else InvalidStateError).
          // Order matters: submenu showPopover() FIRST so it lands in
          // the top layer, THEN the parent re-promotes above it.
          const parent = props.parentMenuRef();
          if (parent && parent.matches(':popover-open')) {
            parent.hidePopover();
            parent.showPopover();
          }
          resizeObserver?.disconnect();
          // A ResizeObserver tick can queue after disconnect or after
          // the flyout closes; afterResize coalesces + cancels-on-
          // cleanup so a stale tick can't reposition a disposed flyout.
          resizeObserver = new ResizeObserver(() => afterResize(positionFlyout));
          resizeObserver.observe(flyoutRef);
        }
        if (props.item.scrollable) searchRef?.focus();
      });
    } else {
      resizeObserver?.disconnect();
      if (flyoutRef && flyoutRef.matches(':popover-open')) {
        flyoutRef.hidePopover();
      }
      setFilter('');
    }
  });

  const filteredChildren = () => {
    const q = filter().toLowerCase();
    if (!q) return props.item.children;
    return props.item.children.filter((child) => {
      if (isDivider(child)) return false;
      if ('label' in child) return (child as { label: string }).label.toLowerCase().includes(q);
      return true;
    });
  };

  // Set `popover` via ref, not a JSX attribute: Solid's JSX types do not yet
  // include the global `popover` attr. Manual mode — the UA does NOT
  // auto-dismiss; the menu's document mousedown/keydown listeners +
  // [data-popover-stack] own dismiss.
  const setFlyout = (el: HTMLDivElement) => {
    flyoutRef = el;
    el.setAttribute('popover', 'manual');
  };

  // Flyout body — built lazily (called only inside the open branch) so a closed
  // submenu never mounts its children. A nested sub-submenu tucks under THIS
  // submenu, not the grandparent (pass our own flyout as parentMenuRef), and
  // inherits our surface so glass/solid stays consistent all the way down.
  const renderFlyoutBody = () => (
    <>
      <Show when={props.item.scrollable}>
        <div class="cujuju-context-menu-flyout-search">
          <input
            ref={searchRef}
            type="text"
            placeholder="Search..."
            onInput={(e) => setFilter(e.currentTarget.value)}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          />
        </div>
      </Show>
      <MenuEntries
        items={filteredChildren()}
        onClose={props.onClose}
        parentMenuRef={() => flyoutRef ?? null}
        surface={props.surface}
      />
    </>
  );

  return (
    <div
      ref={wrapperRef}
      class="cujuju-context-menu-submenu-wrapper"
      onMouseEnter={enter}
    >
      <div class="cujuju-context-menu-item cujuju-context-menu-item-has-submenu">
        <Show when={props.item.icon}>
          <span class="cujuju-context-menu-icon">{props.item.icon}</span>
        </Show>
        <span class="cujuju-context-menu-label">{props.item.label}</span>
        {/* Arrow glyph differs by surface: solid mirrors the host's ▶
            right-pointing context-menu arrow; glass keeps the lighter › . */}
        <span class="cujuju-context-menu-chevron">
          {props.surface === 'solid' ? '▶' : '›'}
        </span>
      </div>
      <Show when={isOpen()}>
        {/* Portal the submenu out of the parent menu's DOM tree.
            Top-layer painting works regardless of DOM placement, but
            Portaling also (a) sidesteps the `backdrop-filter`
            containing-block trap (a glass ancestor re-anchors
            `position: fixed` descendants per spec), and (b) keeps each
            popover a self-contained body-level child.
            `data-popover-stack` marks it as part of the popover stack so
            the menu's own dismiss skips clicks inside it. */}
        <Portal>
          {props.surface === 'solid' ? (
            <div
              ref={setFlyout}
              class="cujuju-context-menu cujuju-context-menu-flyout cujuju-context-menu--solid"
              {...{ [POPOVER_STACK_ATTR]: '' }}
              style={flyoutStyle()}
            >
              {renderFlyoutBody()}
            </div>
          ) : (
            <GlassMenu
              overflow="visible"
              ref={setFlyout}
              class="cujuju-context-menu cujuju-context-menu-flyout"
              {...{ [POPOVER_STACK_ATTR]: '' }}
              style={flyoutStyle()}
            >
              {renderFlyoutBody()}
            </GlassMenu>
          )}
        </Portal>
      </Show>
    </div>
  );
}

/**
 * Renders a list of {@link ContextMenuEntry} into menu rows. Used both
 * for the top-level menu body and — recursively — for each submenu's
 * body.
 */
export function MenuEntries(props: {
  items: ContextMenuEntry[];
  onClose: () => void;
  parentMenuRef: () => HTMLElement | null;
  /** Surface treatment inherited from the owning menu (default `'glass'`). */
  surface?: ContextMenuSurface;
}) {
  const [activeSubmenu, setActiveSubmenu] = createSignal(-1);

  return (
    <For each={props.items}>
      {(item, index) => {
        if (isDivider(item)) return <hr class="cujuju-context-menu-divider" />;
        if (isSlider(item)) return <Show when={!item.when || item.when()}><SliderRow item={item} /></Show>;
        if (isCustom(item)) {
          // Host-supplied JSX row — no default padding/hover; the custom
          // content owns its layout + interactions.
          return <div class="cujuju-context-menu-custom">{item.custom()}</div>;
        }
        if (isSubmenu(item)) {
          return (
            <SubmenuItem
              item={item}
              onClose={props.onClose}
              index={index()}
              activeSubmenu={activeSubmenu}
              setActiveSubmenu={setActiveSubmenu}
              parentMenuRef={props.parentMenuRef}
              surface={props.surface ?? 'glass'}
            />
          );
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
                      <span class="cujuju-context-menu-icon">{btn.icon}</span>
                    </Show>
                    {btn.label}
                  </button>
                )}
              </For>
            </div>
          );
        }
        // Regular item
        const mi = item as ContextMenuItem;
        const resolveIcon = () => typeof mi.icon === 'function' ? mi.icon() : mi.icon;
        return (
          <Show when={!mi.when || mi.when()}>
          <button
            class={`cujuju-context-menu-item${mi.danger ? ' cujuju-context-menu-item-danger' : ''}`}
            disabled={mi.disabled}
            title={mi.disabled ? mi.disabledTooltip : undefined}
            onClick={() => { mi.onClick(); if (!mi.keepOpen) props.onClose(); }}
            type="button"
          >
            <Show when={resolveIcon()}>
              <span class="cujuju-context-menu-icon">{resolveIcon()}</span>
            </Show>
            <span class="cujuju-context-menu-label">{mi.label}</span>
            {/* Right-aligned shortcut hint (display-only). */}
            <Show when={mi.shortcut}>
              <span class="cujuju-context-menu-shortcut">{mi.shortcut}</span>
            </Show>
            {/* Checkbox-style state indicator. Rendered when `checked`
                is explicitly defined (true or false). `false` still
                reserves the slot so adjacent toggle items align
                vertically; `true` fills the slot with a Check glyph. */}
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
          </Show>
        );
      }}
    </For>
  );
}
