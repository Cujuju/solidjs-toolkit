import { createSignal, createEffect, on, onCleanup, For, Show } from 'solid-js';
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

/** Surface shared by a menu and its submenus: `'glass'` (default) is the `GlassMenu` shell,
 *  `'solid'` a plain opaque card. Threaded through every level. */
export type ContextMenuSurface = 'glass' | 'solid';
import { computeSubmenuStyle } from './submenuPosition';
import { POPOVER_STACK_ATTR } from './_internal/popoverStack';

/** Typical unhurried pointer speed: top of the 60-200 px/s unhurried band (kv-tooltip `hoverIntent.ts`, citing Müller et al. 2017). */
const UNHURRIED_POINTER_PX_PER_S = 200;
const MS_PER_S = 1000;

/** Close grace after a hover elsewhere in the parent: diagonal path (the parent's measured width) ÷ pointer speed.
 *  Residual: slower pointers still lose it mid-path. */
export function submenuCloseDelayMs(parentWidthPx: number): number {
  return (parentWidthPx / UNHURRIED_POINTER_PX_PER_S) * MS_PER_S;
}

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
        onInput={(e) => props.item.onChange(e.currentTarget.valueAsNumber)}
        class="cujuju-context-menu-slider"
      />
    </div>
  );
}

/** Searchable text of an entry label — a JSX label contributes its rendered text. */
function labelText(label: unknown): string {
  if (typeof label === 'string') return label;
  if (typeof label === 'number') return String(label);
  // `<Show>` / dynamic fragments compile to accessors.
  if (typeof label === 'function') return labelText(label());
  if (Array.isArray(label)) return label.map(labelText).join('');
  return label instanceof Node ? label.textContent ?? '' : '';
}

function SubmenuItem(props: {
  item: ContextMenuSubmenu;
  onClose: () => void;
  index: number;
  activeSubmenu: () => number;
  setActiveSubmenu: (i: number) => void;
  parentMenuRef: () => HTMLElement | null;
  surface: ContextMenuSurface;
  /** Re-promotes every menu above `parentMenuRef`, nearest first (absent at the root). */
  promoteAncestors?: () => void;
}) {
  const [filter, setFilter] = createSignal('');
  const [flyoutStyle, setFlyoutStyle] = createSignal<Record<string, string>>({});
  let wrapperRef: HTMLDivElement | undefined;
  let flyoutRef: HTMLDivElement | undefined;
  let searchRef: HTMLInputElement | undefined;
  let resizeObserver: ResizeObserver | undefined;
  let closeTimer: ReturnType<typeof setTimeout> | undefined;
  let hoverScope: HTMLElement | null = null;

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

  function cancelClose() {
    clearTimeout(closeTimer);
    closeTimer = undefined;
  }

  // A hover anywhere in the parent menu outside this trigger starts the close
  // grace; re-entering the trigger or the flyout cancels it.
  function onParentMouseOver(e: MouseEvent) {
    if (wrapperRef?.contains(e.target as Node)) {
      cancelClose();
      return;
    }
    if (closeTimer !== undefined) return;
    const pathPx = hoverScope?.offsetWidth ?? 0;
    // Unmeasurable parent (no layout yet): no path, so no grace to derive — leave the submenu open.
    if (pathPx <= 0) return;
    closeTimer = setTimeout(() => {
      closeTimer = undefined;
      if (isOpen()) props.setActiveSubmenu(-1);
    }, submenuCloseDelayMs(pathPx));
  }

  // The flyout is placed once from the trigger rect; a scrolled parent would leave it detached.
  function onParentScroll() {
    props.setActiveSubmenu(-1);
  }

  function detachHoverScope() {
    hoverScope?.removeEventListener('mouseover', onParentMouseOver);
    hoverScope?.removeEventListener('scroll', onParentScroll, true);
    hoverScope = null;
    cancelClose();
  }
  onCleanup(detachHoverScope);

  // Top-layer order is document-wide LIFO, so lifting only the parent would put it
  // above the grandparent too; lift the whole chain, nearest first.
  function promoteParentChain() {
    const parent = props.parentMenuRef();
    if (parent && parent.matches(':popover-open')) {
      parent.hidePopover();
      parent.showPopover();
    }
    props.promoteAncestors?.();
  }

  // Positions the flyout, observes resizes, and drives top-layer membership.
  // LIFO would paint the submenu above its parent, so the parent re-promotes
  // after it opens (hide+show in one frame, no flicker).
  createEffect(() => {
    if (isOpen()) {
      afterPaint(() => {
        // A close before this frame leaves flyoutRef pointing at a detached flyout.
        if (!isOpen()) return;
        if (flyoutRef) {
          if (!flyoutRef.matches(':popover-open')) {
            flyoutRef.showPopover();
          }
          // Measure only once shown: the solid flyout is a closed [popover], display:none (0x0)
          // until open. GlassMenu's `display: flex` overrides that, so glass measured fine.
          positionFlyout();
          // Re-promote the parent ABOVE the just-shown submenu. The spec requires
          // hidePopover() before showPopover(), and the submenu must show FIRST.
          promoteParentChain();
          resizeObserver?.disconnect();
          // A ResizeObserver tick can queue after disconnect or after
          // the flyout closes; afterResize coalesces + cancels-on-
          // cleanup so a stale tick can't reposition a disposed flyout.
          resizeObserver = new ResizeObserver(() => afterResize(positionFlyout));
          resizeObserver.observe(flyoutRef);
          detachHoverScope();
          hoverScope = props.parentMenuRef();
          hoverScope?.addEventListener('mouseover', onParentMouseOver);
          // Capture: scroll doesn't bubble, and GlassMenu scrolls a body child, not the root.
          hoverScope?.addEventListener('scroll', onParentScroll, true);
        }
        if (props.item.scrollable) searchRef?.focus();
      });
    } else {
      resizeObserver?.disconnect();
      detachHoverScope();
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
      if ('label' in child) return labelText(child.label).toLowerCase().includes(q);
      return true;
    });
  };

  // Set `popover` via ref: Solid's JSX types lack the global attr. Manual mode — the menu's
  // own listeners and [data-popover-stack] own dismiss.
  const setFlyout = (el: HTMLDivElement) => {
    flyoutRef = el;
    el.setAttribute('popover', 'manual');
  };

  // Built lazily, so a closed submenu never mounts its children. A nested sub-submenu tucks
  // under THIS submenu and inherits our surface.
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
        promoteAncestors={promoteParentChain}
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
        {/* Portal out of the parent's DOM tree: sidesteps the `backdrop-filter`
            containing-block trap (a glass ancestor re-anchors fixed descendants).
            `data-popover-stack` keeps the menu's dismiss from firing inside it. */}
        <Portal>
          {props.surface === 'solid' ? (
            <div
              ref={setFlyout}
              class="cujuju-context-menu cujuju-context-menu-flyout cujuju-context-menu--solid"
              {...{ [POPOVER_STACK_ATTR]: '' }}
              style={flyoutStyle()}
              onMouseEnter={cancelClose}
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
              onMouseEnter={cancelClose}
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
  /** Re-promotes every menu above `parentMenuRef`, nearest first (absent at the root). */
  promoteAncestors?: () => void;
  /** Open submenus close when this changes — the menu moved, so their flyouts would detach. */
  anchor?: () => unknown;
}) {
  const [activeSubmenu, setActiveSubmenu] = createSignal(-1);
  createEffect(on(() => props.anchor?.(), () => setActiveSubmenu(-1), { defer: true }));

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
              promoteAncestors={props.promoteAncestors}
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
        const mi = item as ContextMenuItem;
        const resolveIcon = () => typeof mi.icon === 'function' ? mi.icon() : mi.icon;
        return (
          <Show when={!mi.when || mi.when()}>
          <button
            class={`cujuju-context-menu-item${mi.danger ? ' cujuju-context-menu-item-danger' : ''}`}
            disabled={mi.disabled}
            aria-pressed={mi.checked}
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
          </Show>
        );
      }}
    </For>
  );
}
