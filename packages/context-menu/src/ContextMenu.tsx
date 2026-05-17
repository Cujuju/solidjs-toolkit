import { createSignal, onMount } from 'solid-js';
import { createAfterPaint } from '@cujuju/solidjs-hooks';
import { GlassMenu } from '@cujuju/solidjs-glass-menu';
import type { ContextMenuEntry } from './types';
import { MenuEntries } from './MenuEntries';
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
}

/**
 * A cursor-positioned context menu.
 *
 * Presentation-plus-behavior, but caller-driven: it does NOT own its
 * open state. Render `<ContextMenu items x y onClose>` while the menu
 * should be visible (typically from a `contextmenu` handler that
 * stores the click point) and stop rendering it inside `onClose`.
 *
 * The menu promotes itself into the browser's top layer
 * (`popover="manual"`) so it paints above every normal stacking
 * context. It dismisses on outside `mousedown` and on `Escape`; clicks
 * inside a Portal'd submenu (marked `data-popover-stack`) are treated
 * as inside. The open point is clamped into the viewport after render.
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
    // Submenus are Portal'd to <body> so they sit OUTSIDE menuRef's
    // subtree, but they belong to THIS menu's dismiss scope. Without
    // this skip, clicking a slider/item inside a submenu would call
    // onClose() — unmounting the submenu before the click event fires,
    // which the WHATWG event spec then suppresses. See `popoverStack`.
    const targetEl =
      target.nodeType === Node.ELEMENT_NODE
        ? (target as Element)
        : (target as Node).parentElement;
    if (targetEl?.closest(POPOVER_STACK_ATTR_SELECTOR)) return;
    props.onClose();
  }

  createDocumentListener('keydown', onKeyDown);
  createDocumentListener('mousedown', onMouseDown);

  onMount(() => {
    // Promote into the top layer so the menu paints above every normal
    // stacking context — including other top-layer popovers. Top-layer
    // order is LIFO of showPopover() calls, so a menu opened on top of
    // an already-open popover lands above it. The `popover` attribute
    // is set in the ref callback below, before this onMount fires.
    if (menuRef && !menuRef.matches(':popover-open')) {
      menuRef.showPopover();
    }
    afterPaint(() => {
      if (!menuRef) return;
      const w = menuRef.offsetWidth;
      const h = menuRef.offsetHeight;
      // Clamp so the menu never starts past the viewport. Combined
      // with the `max-width` cap below, this also handles the
      // narrow-window case where intrinsic content is wider than the
      // viewport — the CSS caps the width, this keeps it in frame.
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
    });
  });

  return (
    <GlassMenu
      overflow="visible"
      ref={(el) => {
        menuRef = el;
        // Set `popover` via ref, not a JSX attribute: Solid's JSX types
        // do not yet include the global `popover` attr. Manual mode —
        // the UA does NOT auto-dismiss; the document listeners above
        // own dismiss.
        el.setAttribute('popover', 'manual');
      }}
      class="cujuju-context-menu"
      style={{
        position: 'fixed',
        left: `${pos().x}px`,
        top: `${pos().y}px`,
        // Cap the menu's own width so very narrow viewports force
        // content to wrap/truncate inside rather than clipping.
        'max-width': `calc(100vw - ${VIEWPORT_MARGIN_PX * 2}px)`,
      }}
    >
      <MenuEntries
        items={props.items}
        onClose={props.onClose}
        parentMenuRef={() => menuRef ?? null}
      />
    </GlassMenu>
  );
}
