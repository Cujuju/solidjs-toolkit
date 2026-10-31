import type { AnchoredPopoverProps } from './types';
export type { AnchoredPlacement, AnchoredPopoverProps } from './types';
import {
  createAfterPaint,
  createEscapeOwner,
  createResizeObserver,
  getGlobalTarget,
  safeAddEventListener,
} from '@cujuju/solidjs-hooks';
import {
  createEffect,
  createSignal,
  type JSX,
} from 'solid-js';
import { Portal } from 'solid-js/web';

/** Gap in CSS pixels between the anchor edge and the popover edge.
 *  Small enough that the popover feels visually connected to its
 *  trigger, large enough to prevent border/shadow bleed. */
const DEFAULT_POPOVER_OFFSET_PX = 4;

/** Minimum clamp gap to the viewport edge: breathing room without wasting space on wide
 *  screens. */
const DEFAULT_POPOVER_VIEWPORT_MARGIN_PX = 8;

/** The separator set `DOMTokenList` rejects inside a single token. */
const ASCII_WHITESPACE = /[\t\n\f\r ]+/;

/* Dismiss order lives in `createEscapeOwner`'s shared stack, not a module-scope array here:
 * this component is inlined into several dists, and a per-module stack gave each one its own. */

/**
 * Popover API in MANUAL mode, so the anchor is excluded from outside-click and toggles without
 * racing light-dismiss. Shell + content split keeps author `display` off the `popover` element.
 */
export default function AnchoredPopover(props: AnchoredPopoverProps): JSX.Element {
  const [panelEl, setPanelEl] = createSignal<HTMLDivElement | undefined>(undefined);
  const [pos, setPos] = createSignal<{ top: number; left: number } | null>(null);
  const afterPaint = createAfterPaint();
  /** Set on an open transition, consumed by the frame that fires re-promote + onShown. */
  let showPending = false;

  /** Returns false when there is no anchor or panel to position against. */
  function computeAndClamp(): boolean {
    const anchor = props.anchor();
    const el = panelEl();
    if (!anchor || !el) return false;
    const rect = anchor.getBoundingClientRect();
    const panel = el.getBoundingClientRect();
    const offset = props.offsetPx ?? DEFAULT_POPOVER_OFFSET_PX;
    const margin = props.viewportMarginPx ?? DEFAULT_POPOVER_VIEWPORT_MARGIN_PX;
    const placement = props.placement ?? 'below-start';
    const [side, align] = placement.split('-') as [
      'below' | 'above' | 'right' | 'left',
      'start' | 'end',
    ];
    // Horizontal placements (right/left) anchor on the side axis and
    // align the perpendicular axis via -start/-end. Vertical placements
    // (below/above) do the inverse.
    const isHorizontal = side === 'right' || side === 'left';
    const vpW = window.innerWidth;
    const vpH = window.innerHeight;

    // For horizontal placements, the side rect (x source) may differ
    // from the perpendicular rect (y source) — see `horizontalAnchor`
    // docstring. Falls back to the primary anchor when not provided.
    const horizontalAnchorEl = props.horizontalAnchor?.();
    const sideRect = isHorizontal && horizontalAnchorEl
      ? horizontalAnchorEl.getBoundingClientRect()
      : rect;

    let top: number;
    let left: number;

    if (isHorizontal) {
      left = side === 'right'
        ? sideRect.right + offset
        : sideRect.left - panel.width - offset;
      top = align === 'start' ? rect.top : rect.bottom - panel.height;
    } else {
      top = side === 'below'
        ? rect.bottom + offset
        : rect.top - panel.height - offset;
      left = align === 'start' ? rect.left : rect.right - panel.width;
    }

    // `centered` overrides the horizontal anchor only for vertical
    // placements — pairing it with a side placement would defeat the
    // side anchoring (popover detaches from the trigger).
    if (props.centered && !isHorizontal) {
      left = Math.max(margin, Math.round((vpW - panel.width) / 2));
    }

    if (left + panel.width > vpW - margin) {
      left = Math.max(margin, vpW - panel.width - margin);
    }
    if (left < margin) left = margin;
    if (top + panel.height > vpH - margin) {
      top = Math.max(margin, vpH - panel.height - margin);
    }
    if (top < margin) top = margin;

    setPos({ top, left });
    return true;
  }

  // Sync open() → browser popover  Reading anchor() / panelEl()
  // tracks them so DOM swaps + ref population re-fire the effect.
  createEffect<boolean>((wasOpen) => {
    const el = panelEl();
    if (!el) return wasOpen;
    const isOpen = props.open();
    if (isOpen) {
      void props.anchor();
      void props.horizontalAnchor?.();
      // Positioning inputs are read in an untracked frame callback; subscribe here so a change repositions.
      void [props.placement, props.offsetPx, props.viewportMarginPx, props.centered];
      // An anchor swap while open only repositions; re-promote and onShown
      // belong to the open transition.
      if (!wasOpen) {
        showPending = true;
      }
      if (!el.matches(':popover-open')) {
        el.showPopover();
      }
      // Measure after show — panel must be in top layer to have
      // non-zero dimensions.
      afterPaint(() => {
        // A close before this frame leaves nothing to position or announce.
        if (!props.open()) return;
        // Unpositioned (no anchor yet) stays pending: the anchor's arrival re-runs this effect.
        if (!computeAndClamp() || !showPending) return;
        showPending = false;
        // Re-promote the parent AFTER our show and measure (LIFO top layer), else we paint
        // above it. Guarded on `:popover-open` to avoid InvalidStateError.
        const parent = props.parentPopoverRef?.();
        if (parent && parent.matches(':popover-open')) {
          parent.hidePopover();
          parent.showPopover();
        }
        // Last: focus moved into the panel needs it painted and in its final position.
        props.onShown?.();
      });
    } else {
      if (el.matches(':popover-open')) {
        el.hidePopover();
      }
    }
    return isOpen;
  }, false);

  // Outside-click dismiss on document pointerdown. Excludes the panel,
  // the anchor, the horizontalAnchor, and anything the consumer's
  // `shouldSuppressDismiss` predicate accepts.
  const onPointerDown = (e: Event): void => {
    if (!props.open()) return;
    const target = e.target as Node | null;
    if (!target) return;
    if (panelEl()?.contains(target)) return;
    const targetEl =
      target.nodeType === Node.ELEMENT_NODE
        ? (target as Element)
        : (target as Node).parentElement;
    if (targetEl && props.shouldSuppressDismiss?.(targetEl)) return;
    const anchor = props.anchor();
    if (anchor && anchor.contains(target)) return;
    const horizontalAnchor = props.horizontalAnchor?.();
    if (horizontalAnchor && horizontalAnchor.contains(target)) return;
    props.onDismiss();
  };
  safeAddEventListener(getGlobalTarget('document'), 'pointerdown', onPointerDown);

  // Escape dismiss, like the UA's auto popovers. Only the topmost open surface in the app
  // dismisses, and it consumes the key — pill pickers and chip flyouts share the same stack.
  createEscapeOwner({
    open: () => props.open(),
    onDismiss: () => props.onDismiss(),
    // Inner handlers keep their own Escape: one raised inside the panel or an anchor reaches them first.
    owns: () => [panelEl(), props.anchor(), props.horizontalAnchor?.()],
  });

  // Reposition on resize. Closing would also be reasonable; consumer
  // can achieve that by calling onDismiss themselves.
  const onResize = (): void => {
    if (props.open()) computeAndClamp();
  };
  safeAddEventListener(getGlobalTarget('window'), 'resize', onResize);
  // An ancestor scroller moves the anchor but not this fixed panel. Capture: `scroll` doesn't
  // bubble. The panel's own scrolling moves nothing, so it is skipped.
  const afterScroll = createAfterPaint();
  const onScroll = (e: Event): void => {
    if (!props.open()) return;
    if (e.target instanceof Node && panelEl()?.contains(e.target)) return;
    afterScroll(onResize);
  };
  safeAddEventListener(getGlobalTarget('window'), 'scroll', onScroll, {
    capture: true,
    passive: true,
  });
  // Content-driven size changes (rows added, late data) invalidate the clamp too.
  createResizeObserver(panelEl, onResize);

  // Reactive shellClass application. Tracks the prop so a consumer
  // that swaps shellClass gets the old class removed and the new one
  // added — avoids stale classes accumulating on the DOM node.
  createEffect<string[]>((prev) => {
    const el = panelEl();
    if (!el) return prev;
    const next = props.shellClass?.split(ASCII_WHITESPACE).filter(Boolean) ?? [];
    el.classList.remove(...prev);
    el.classList.add(...next);
    return next;
  }, []);

  // Reactive shellStyle application. Diffs against the previous run
  // so removed keys get explicitly cleared (avoids stale CSS vars
  // surviving past a render where the consumer dropped a property).
  createEffect<Record<string, string>>((prev) => {
    const el = panelEl();
    if (!el) return prev ?? {};
    const next = props.shellStyle?.() ?? {};
    if (prev) {
      for (const key of Object.keys(prev)) {
        if (!(key in next)) el.style.removeProperty(key);
      }
    }
    for (const [key, value] of Object.entries(next)) {
      el.style.setProperty(key, value);
    }
    return next;
  });

  return (
    <Portal>
      {/* Two elements: the unstyleable SHELL carries `popover` and fixed coordinates, so
       *  UA closed-state `display: none` always wins; the CONTENT carries `props.class`. */}
      <div
        ref={(el) => {
          setPanelEl(el);
          // Via ref: Solid's JSX types lack the `popover` attribute, and object spread doesn't
          // reliably render it.
          el.setAttribute('popover', 'manual');
        }}
        // No author class, so UA closed-state `display: none` always wins. Inline overrides UA
        // `[popover]` defaults: overflow (clips shadows), inset/margin (recentres; right: auto
        // for rtl), Canvas background.
        style={
          pos()
            ? {
                position: 'fixed',
                top: `${pos()!.top}px`,
                left: `${pos()!.left}px`,
                right: 'auto',
                bottom: 'auto',
                margin: '0',
                overflow: 'visible',
                background: 'transparent',
                border: '0',
                padding: '0',
                color: 'inherit',
              }
            : {
                position: 'fixed',
                visibility: 'hidden',
                right: 'auto',
                bottom: 'auto',
                margin: '0',
                overflow: 'visible',
                background: 'transparent',
                border: '0',
                padding: '0',
                color: 'inherit',
              }
        }
      >
        <div
          ref={(el) => props.contentRef?.(el)}
          class={props.class}
          role={props.role}
          aria-label={props['aria-label']}
          id={props.id}
        >
          {props.children}
        </div>
      </div>
    </Portal>
  );
}
