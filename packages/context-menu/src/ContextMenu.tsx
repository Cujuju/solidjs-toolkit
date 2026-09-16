import { createSignal, createMemo, createEffect, on, onMount, Show, type JSX } from 'solid-js';
import { Portal } from 'solid-js/web';
import { createAfterPaint } from '@cujuju/solidjs-hooks';
import { GlassMenu } from '@cujuju/solidjs-glass-menu';
import type { ContextMenuEntry } from './types';
import { MenuEntries, type ContextMenuSurface } from './MenuEntries';
import { VIEWPORT_MARGIN_PX } from './submenuPosition';
import { createDocumentListener } from './_internal/createDocumentListener';
import { POPOVER_STACK_ATTR_SELECTOR } from './_internal/popoverStack';

export interface ContextMenuProps {
  /** The entries to render. */
  items: ContextMenuEntry[];
  /** Viewport x of the requested open point (e.g. `event.clientX`). */
  x: number;
  /** Viewport y of the requested open point (e.g. `event.clientY`). */
  y: number;
  /** Called when the menu should close — outside click, Escape, or a
   *  non-`keepOpen` item activation. The caller owns open state; render
   *  `<ContextMenu>` while open and stop rendering it on `onClose`. */
  onClose: () => void;
  /** Surface treatment. `'glass'` (default) renders the `GlassMenu` shell; `'solid'` renders a
   *  plain opaque card (`.cujuju-context-menu--solid`, host-themed). Submenus inherit it. */
  surface?: ContextMenuSurface;
  /** Optional custom header band rendered above the items, inside the menu
   *  surface (e.g. a title + metadata row). */
  header?: () => JSX.Element;
  /** Minimum menu width in px. Overrides the stylesheet's default floor. */
  minWidth?: number;
}

/**
 * Cursor-positioned context menu; the caller owns open state — render it while open, stop
 * rendering inside `onClose`. Promotes into the top layer (`popover="manual"`); dismisses on
 * outside mousedown and Escape.
 */
export function ContextMenu(props: ContextMenuProps) {
  let menuRef: HTMLDivElement | undefined;
  const [pos, setPos] = createSignal({ x: props.x, y: props.y });
  const afterPaint = createAfterPaint();

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') props.onClose();
  }

  function onMouseDown(e: MouseEvent) {
    if (!menuRef) return;
    const target = e.target as Node;
    if (menuRef.contains(target)) return;
    // Submenus are Portal'd outside menuRef's subtree but belong to this dismiss scope; closing
    // would unmount the submenu before its click fires. See `popoverStack`.
    const targetEl =
      target.nodeType === Node.ELEMENT_NODE
        ? (target as Element)
        : (target as Node).parentElement;
    if (targetEl?.closest(POPOVER_STACK_ATTR_SELECTOR)) return;
    props.onClose();
  }

  createDocumentListener('keydown', onKeyDown);
  createDocumentListener('mousedown', onMouseDown);

  function clampToViewport() {
    if (!menuRef) return;
    const w = menuRef.offsetWidth;
    const h = menuRef.offsetHeight;
    // Clamp so the menu never starts past the viewport; with the `max-width` cap this also
    // covers content wider than a narrow window.
    setPos({
      x: Math.max(
        VIEWPORT_MARGIN_PX,
        Math.min(props.x, window.innerWidth - w - VIEWPORT_MARGIN_PX),
      ),
      y: Math.max(
        VIEWPORT_MARGIN_PX,
        Math.min(props.y, window.innerHeight - h - VIEWPORT_MARGIN_PX),
      ),
    });
  }

  onMount(() => {
    // Top layer paints above every stacking context, and LIFO order puts a menu opened over an
    // existing popover above it. The `popover` attribute is set in the ref below.
    if (menuRef && !menuRef.matches(':popover-open')) {
      menuRef.showPopover();
    }
    afterPaint(clampToViewport);
  });

  // A caller can move the open point without remounting (same `<Show>` branch);
  // re-clamp at the new point.
  createEffect(on(() => [props.x, props.y], () => afterPaint(clampToViewport), { defer: true }));

  // Set `popover` via ref: Solid's JSX types lack the global attr. Manual mode — the document
  // listeners own dismiss. Shared by both surface branches.
  const setMenu = (el: HTMLDivElement) => {
    menuRef = el;
    el.setAttribute('popover', 'manual');
  };

  // Reactive style so the onMount clamp repositions the menu; a plain object built once would
  // freeze left/top at the pre-clamp coords.
  const menuStyle = createMemo<JSX.CSSProperties>(() => ({
    position: 'fixed',
    left: `${pos().x}px`,
    top: `${pos().y}px`,
    // Cap width so very narrow viewports wrap/truncate inside rather than clip.
    'max-width': `calc(100vw - ${VIEWPORT_MARGIN_PX * 2}px)`,
    // Cap height too, so a tall menu scrolls (GlassMenu body / solid card) instead of running off-screen.
    'max-height': `calc(100vh - ${VIEWPORT_MARGIN_PX * 2}px)`,
    ...(props.minWidth ? { 'min-width': `${props.minWidth}px` } : {}),
  }));

  // Header band (optional) + the entries. Shared by both surfaces.
  const renderBody = () => (
    <>
      <Show when={props.header}>
        <div class="cujuju-context-menu-header">{props.header!()}</div>
      </Show>
      <MenuEntries
        items={props.items}
        onClose={props.onClose}
        parentMenuRef={() => menuRef ?? null}
        surface={props.surface ?? 'glass'}
        anchor={() => [props.x, props.y]}
      />
    </>
  );

  // Portal to <body> so the menu escapes the consumer's ancestor cascade (an ancestor `color`
  // could tint the labels invisible). Painting is already top-layer.
  return (
    <Portal>
      {props.surface === 'solid' ? (
        <div
          ref={setMenu}
          class="cujuju-context-menu cujuju-context-menu--solid"
          style={menuStyle()}
        >
          {renderBody()}
        </div>
      ) : (
        <GlassMenu
          overflow="visible"
          ref={setMenu}
          class="cujuju-context-menu"
          style={menuStyle()}
        >
          {renderBody()}
        </GlassMenu>
      )}
    </Portal>
  );
}
