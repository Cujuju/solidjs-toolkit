import { GlassMenu } from '@cujuju/solidjs-glass-menu';
import { createAfterPaint } from '@cujuju/solidjs-hooks';
import { createEffect, createMemo, createSignal, onCleanup, Show, useContext, type JSX } from 'solid-js';
import { Portal } from 'solid-js/web';
import { POPOVER_STACK_ATTR } from './_internal/popoverStack.js';
import { CustomSubmenuScope, type SubmenuScope } from './_internal/submenuScope.js';
import { MenuEntries } from './MenuEntries.js';
import { computeSubmenuStyle } from './submenuPosition.js';
import { submenuCloseDelayMs } from './submenuTiming.js';
import { isDivider, type ContextMenuSubmenu } from './types.js';

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

interface SubmenuTriggerProps {
  /** The flyout's entries and options; same type as a built-in submenu entry (label used for search). */
  submenu: ContextMenuSubmenu;
  /** Trigger content; rendered inside the library's trigger button. */
  children: JSX.Element;
  /** Extra classes on the trigger button (it already carries the library's item classes). */
  class?: string;
  disabled?: boolean;
}

export function ContextMenuSubmenuTrigger(props: SubmenuTriggerProps): JSX.Element {
  const scope = useContext(CustomSubmenuScope);
  if (!scope) {
    throw new Error('ContextMenuSubmenuTrigger must be rendered inside a custom entry of a ContextMenu.');
  }
  return <SubmenuItem {...props} scope={scope} />;
}

export function SubmenuItem(props: Omit<SubmenuTriggerProps, 'children'> & {
  children?: JSX.Element;
  scope: SubmenuScope;
  builtin?: boolean;
}) {
  const { menu, activeSubmenu, setActiveSubmenu } = props.scope;
  const key = Symbol();
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

  const isOpen = createMemo(() => activeSubmenu() === key);
  const triggerAnchor = () => wrapperRef ?? triggerRef;
  const afterPaint = createAfterPaint();
  const afterResize = createAfterPaint();

  function positionFlyout() {
    const anchor = triggerAnchor();
    if (!flyoutRef || !anchor) return;
    const triggerRect = anchor.getBoundingClientRect();
    const flyoutRect = flyoutRef.getBoundingClientRect();
    // Anchor on the OUTER parent menu rect; fall back to the wrapper
    // rect when the parent ref is not wired yet (late ref population).
    const parentRect = menu.parentMenuRef()?.getBoundingClientRect() ?? triggerRect;
    setFlyoutStyle(
      computeSubmenuStyle({
        triggerRect,
        parentRect,
        flyoutRect,
        viewportW: window.innerWidth,
        viewportH: window.innerHeight,
        scrollable: props.submenu.scrollable ?? false,
      }),
    );
  }

  function enter() {
    if (!props.disabled) setActiveSubmenu(key);
  }

  function close() {
    setActiveSubmenu((active) => active === key ? undefined : active);
  }
  onCleanup(close);
  createEffect(() => { if (props.disabled) close(); });

  function focusFlyout() {
    if (props.submenu.scrollable) searchRef?.focus();
    else flyoutRef?.querySelector<HTMLElement>(FLYOUT_FOCUS_SELECTOR)?.focus();
  }

  function openFromKeyboard() {
    if (props.disabled) return;
    if (isOpen() && flyoutRef?.matches(':popover-open')) {
      focusFlyout();
      return;
    }
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

  // Close only this level and return focus. Left in the search field still moves its caret.
  function onFlyoutKeyDown(e: KeyboardEvent) {
    if (e.defaultPrevented) return;
    if (e.key !== 'Escape' && (e.key !== 'ArrowLeft' || e.target instanceof HTMLInputElement)) return;
    e.preventDefault();
    e.stopPropagation();
    close();
    triggerRef?.focus();
  }

  function cancelClose() {
    clearTimeout(closeTimer);
    closeTimer = undefined;
  }

  // A hover anywhere in the parent menu outside this trigger starts the close
  // grace; re-entering the trigger or the flyout cancels it.
  function onParentMouseOver(e: MouseEvent) {
    if (triggerAnchor()?.contains(e.target as Node)) {
      cancelClose();
      return;
    }
    if (closeTimer !== undefined) return;
    const pathPx = hoverScope?.offsetWidth ?? 0;
    // Unmeasurable parent (no layout yet): no path, so no grace to derive — leave the submenu open.
    if (pathPx <= 0) return;
    closeTimer = setTimeout(() => {
      closeTimer = undefined;
      close();
    }, submenuCloseDelayMs(pathPx));
  }

  // The flyout is placed once from the trigger rect; a scrolled parent would leave it detached.
  function onParentScroll() {
    close();
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
    const parent = menu.parentMenuRef();
    if (parent && parent.matches(':popover-open')) {
      parent.hidePopover();
      parent.showPopover();
    }
    menu.promoteAncestors?.();
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
          hoverScope = menu.parentMenuRef();
          hoverScope?.addEventListener('mouseover', onParentMouseOver);
          // Capture: scroll doesn't bubble, and GlassMenu scrolls a body child, not the root.
          hoverScope?.addEventListener('scroll', onParentScroll, true);
        }
        if (props.submenu.scrollable || focusOnOpen) focusFlyout();
        focusOnOpen = false;
      });
    } else {
      focusOnOpen = false;
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
    if (!q) return props.submenu.children;
    return props.submenu.children.filter((child) => {
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
    menu.flyouts.add(el);
    onCleanup(() => menu.flyouts.delete(el));
  };

  // Built lazily, so a closed submenu never mounts its children. A nested sub-submenu tucks
  // under THIS submenu and inherits our surface.
  const renderFlyoutBody = () => (
    <CustomSubmenuScope.Provider value={undefined}>
      <Show when={props.submenu.scrollable}>
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
        onClose={menu.onClose}
        parentMenuRef={() => flyoutRef ?? null}
        surface={menu.surface}
        promoteAncestors={promoteParentChain}
        flyouts={menu.flyouts}
      />
    </CustomSubmenuScope.Provider>
  );

  const renderTrigger = () => (
    <button
      ref={triggerRef}
      type="button"
      class={`cujuju-context-menu-item cujuju-context-menu-item-has-submenu${props.class ? ` ${props.class}` : ''}`}
      disabled={props.disabled}
      aria-haspopup="menu"
      aria-expanded={isOpen()}
      onMouseEnter={props.builtin ? undefined : enter}
      onClick={onTriggerClick}
      onKeyDown={onTriggerKeyDown}
    >
      {props.builtin ? (
        <>
          <Show when={props.submenu.icon}>
            {(icon) => <span class="cujuju-context-menu-icon">{icon()}</span>}
          </Show>
          <span class="cujuju-context-menu-label">{props.submenu.label}</span>
          <span class="cujuju-context-menu-chevron" aria-hidden="true">
            {menu.surface === 'solid' ? '▶' : '›'}
          </span>
        </>
      ) : props.children}
    </button>
  );

  const renderFlyout = () => (
    <Show when={isOpen()}>
      {/* Portal out of the parent's DOM tree: sidesteps the `backdrop-filter`
          containing-block trap (a glass ancestor re-anchors fixed descendants).
          `data-popover-stack` keeps the menu's dismiss from firing inside it. */}
      <Portal>
        {menu.surface === 'solid' ? (
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
  );

  return props.builtin ? (
    <div ref={wrapperRef} class="cujuju-context-menu-submenu-wrapper" onMouseEnter={enter}>
      {renderTrigger()}
      {renderFlyout()}
    </div>
  ) : <>{renderTrigger()}{renderFlyout()}</>;
}

