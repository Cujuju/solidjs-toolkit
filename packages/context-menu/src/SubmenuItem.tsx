import { GlassMenu } from '@cujuju/solidjs-glass-menu';
import { createAfterPaint } from '@cujuju/solidjs-hooks';
import { createEffect, createSignal, onCleanup, Show } from 'solid-js';
import { Portal } from 'solid-js/web';
import { POPOVER_STACK_ATTR } from './_internal/popoverStack';
import { MenuEntries, type ContextMenuSurface } from './MenuEntries';
import { computeSubmenuStyle } from './submenuPosition';
import { submenuCloseDelayMs } from './submenuTiming';
import { isDivider, type ContextMenuSubmenu } from './types';

/** First control a keyboard-opened submenu focuses: an enabled row button or slider. */
const FLYOUT_FOCUS_SELECTOR = 'button:not(:disabled), input';

/** Searchable text of an entry label — a JSX label contributes its rendered text. */
function labelText(label: unknown): string {
  if (typeof label === 'string') return label;
  if (typeof label === 'number') return String(label);
  // `<Show>` / dynamic fragments compile to accessors.
  if (typeof label === 'function') return labelText(label());
  if (Array.isArray(label)) return label.map(labelText).join('');
  return label instanceof Node ? label.textContent ?? '' : '';
}

export function SubmenuItem(props: {
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
  let triggerRef: HTMLButtonElement | undefined;
  /** Set by a keyboard open; the opening frame then moves focus into the flyout. */
  let focusOnOpen = false;
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

  function openFromKeyboard() {
    focusOnOpen = true;
    enter();
  }

  function onTriggerClick(e: MouseEvent) {
    // `detail === 0`: Enter/Space synthesised this click. A pointer already opened it on hover.
    if (e.detail === 0) openFromKeyboard();
    else enter();
  }

  function onTriggerKeyDown(e: KeyboardEvent) {
    if (e.key !== 'ArrowRight') return;
    e.preventDefault();
    openFromKeyboard();
  }

  // ArrowLeft closes this level and returns focus; stopped so an enclosing flyout keeps its own.
  function onFlyoutKeyDown(e: KeyboardEvent) {
    if (e.key !== 'ArrowLeft' || e.target instanceof HTMLInputElement) return;
    e.preventDefault();
    e.stopPropagation();
    props.setActiveSubmenu(-1);
    triggerRef?.focus();
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
  // Effect transitions disconnect only on close; an open submenu unmounting must too.
  onCleanup(() => resizeObserver?.disconnect());

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
        else if (focusOnOpen) flyoutRef?.querySelector<HTMLElement>(FLYOUT_FOCUS_SELECTOR)?.focus();
        focusOnOpen = false;
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
      <button
        ref={triggerRef}
        type="button"
        class="cujuju-context-menu-item cujuju-context-menu-item-has-submenu"
        aria-haspopup="menu"
        aria-expanded={isOpen()}
        onClick={onTriggerClick}
        onKeyDown={onTriggerKeyDown}
      >
        <Show when={props.item.icon}>
          {(icon) => <span class="cujuju-context-menu-icon">{icon()}</span>}
        </Show>
        <span class="cujuju-context-menu-label">{props.item.label}</span>
        {/* Arrow glyph differs by surface: solid mirrors the host's ▶
            right-pointing context-menu arrow; glass keeps the lighter › . */}
        <span class="cujuju-context-menu-chevron" aria-hidden="true">
          {props.surface === 'solid' ? '▶' : '›'}
        </span>
      </button>
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
              onKeyDown={onFlyoutKeyDown}
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
              onKeyDown={onFlyoutKeyDown}
            >
              {renderFlyoutBody()}
            </GlassMenu>
          )}
        </Portal>
      </Show>
    </div>
  );
}

