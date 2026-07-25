import {
  createEffect,
  createSignal,
  onCleanup,
  type Accessor,
  type JSX,
} from 'solid-js';
import { Portal } from 'solid-js/web';
import { createAfterPaint } from '@cujuju/solidjs-hooks';

type HTMLDivAttrs = JSX.HTMLAttributes<HTMLDivElement>;

/** Gap in CSS pixels between the anchor edge and the popover edge.
 *  Small enough that the popover feels visually connected to its
 *  trigger, large enough to prevent border/shadow bleed. */
const DEFAULT_POPOVER_OFFSET_PX = 4;

/** Minimum gap between popover edge and viewport edge after clamp,
 *  in CSS pixels. Stops the popover from touching the viewport's
 *  hard boundary. 8px is enough visual breathing room without
 *  wasting space on wide screens. */
const DEFAULT_POPOVER_VIEWPORT_MARGIN_PX = 8;

export type AnchoredPlacement =
  | 'below-start'
  | 'below-end'
  | 'above-start'
  | 'above-end'
  | 'right-start'
  | 'right-end'
  | 'left-start'
  | 'left-end';

export interface AnchoredPopoverProps {
  /** Reactive open state. The popover's browser state is synced TO
   *  this: flipping true calls `showPopover()`, flipping false calls
   *  `hidePopover()`. The consumer flips it back to false in response
   *  to `onDismiss` when an outside click or Escape fires. */
  open: Accessor<boolean>;
  /** Anchor element accessor. Reactive — DOM swaps (e.g. an anchor
   *  being replaced after a state change) reposition the popover
   *  automatically. Returning `null` or `undefined` skips positioning
   *  but the popover can still be open (position stays stale until a
   *  real anchor is provided). The anchor element is also EXCLUDED
   *  from outside-click dismiss — clicks on it are the consumer's
   *  toggle, not a dismiss request.
   *
   *  When `horizontalAnchor` is also set, this `anchor`'s rect drives
   *  ONLY the perpendicular axis (vertical for `right`/`left`
   *  placements, horizontal for `below`/`above`). The split-anchor
   *  shape mirrors a submenu pattern: x reads from the parent popover
   *  (so under-tuck lands at the parent's outer right edge, not at an
   *  inner row), y reads from the trigger row inside the parent (so
   *  the submenu vertically aligns with the row that spawned it). */
  anchor: Accessor<HTMLElement | null | undefined>;
  /** Optional secondary anchor for the side-axis only (horizontal for
   *  `right`/`left` placements). When present, x positioning reads
   *  from this rect's right/left edge while y still reads from
   *  `anchor`. For `below`/`above` placements this prop is ignored
   *  (the side axis IS y, which `anchor` already drives). Excluded
   *  from outside-click dismiss alongside `anchor`.
   *
   *  Use case: parent/child popover pairs (popover inside popover,
   *  context-menu submenu inside parent menu) need child x =
   *  parent.right − overlap, child y = trigger-row.top. */
  horizontalAnchor?: Accessor<HTMLElement | null | undefined>;
  /** Optional parent popover element. When supplied, the open effect
   *  re-promotes the parent (hidePopover() + showPopover()
   *  synchronously) inside `afterPaint` AFTER showing this popover.
   *  Top-layer order is LIFO of `showPopover()` calls; without re-
   *  promote a child popover always paints ABOVE its parent, which
   *  defeats any under-tuck overlap. The parent must already be in
   *  the top layer (`popover='manual'` and currently `:popover-open`)
   *  — the primitive guards on both before issuing the hide/show
   *  pair, so a missing/closed parent is a no-op rather than a
   *  crash. */
  parentPopoverRef?: Accessor<HTMLElement | null | undefined>;
  /** Fired when the user clicks outside both the popover panel and
   *  the anchor element, or presses Escape while the popover is open.
   *  NOT fired when the consumer itself flips `open` to false. */
  onDismiss: () => void;
  /** Which corner of the anchor to align with. Default `below-start`
   *  (popover's top-left at anchor's bottom-left). All placements
   *  clamp into the viewport after initial positioning. */
  placement?: AnchoredPlacement;
  /** Override the default 4px gap between anchor and popover. */
  offsetPx?: number;
  /** Override the default 8px viewport-edge clamp margin. */
  viewportMarginPx?: number;
  /** Class applied to the popover CONTENT element. Consumers own
   *  visual styling (color, padding, radius, shadow, width). */
  class?: string;
  /** Passed through. Common values: `"menu"`, `"dialog"`, `"listbox"`. */
  role?: HTMLDivAttrs['role'];
  /** Passed through. Strongly recommended for screen-reader context. */
  'aria-label'?: string;
  /** Optional id forwarded to the content `<div>` (the element that
   *  carries `class` / `role` / `aria-label`). Useful when an external
   *  trigger button needs to wire `aria-controls`. */
  id?: string;
  /**
   * Fired once the popover is SHOWN and POSITIONED — after `showPopover()` and
   * after the clamp has run.
   *
   * The distinction matters for anything that has to act on the element rather
   * than merely render it. A popover is `display: none` until it enters the top
   * layer and is unpositioned for a frame after that, and both states silently
   * swallow `.focus()` — an element that cannot be painted cannot be focused. A
   * consumer therefore cannot schedule that work itself: a ref fires too early, an
   * effect created in the consumer's body runs before this component's, and one
   * `requestAnimationFrame` is a guess that is right on some machines.
   *
   * Fires on every open, not just the first.
   */
  onShown?: () => void;
  /** Optional ref to the CONTENT element — the one carrying `class` /
   *  `role` / `aria-label`, i.e. the whole visible surface including
   *  any chrome the consumer renders around its main body.
   *
   *  Exists for listeners that CANNOT be expressed on the children:
   *  `pointerenter` / `pointerleave` do not bubble, so a consumer whose
   *  "is the pointer over this surface?" question spans several sibling
   *  children has no element of its own to ask it on. Attaching to one
   *  child answers a narrower question and silently misreports a move
   *  between siblings as a departure.
   *
   *  Not for reaching in to restyle — `class`, `shellClass` and
   *  `shellStyle` own presentation, and the cascade-trap warning on
   *  `shellClass` applies to anything set through here too. */
  contentRef?: (el: HTMLDivElement) => void;
  /** Optional class applied to the SHELL element (the one that carries
   *  the `popover` attribute). Use this when you need to attach
   *  `:popover-open::backdrop` styles or other shell-scoped CSS that
   *  must reach the actual popover element rather than the inner
   *  content div. Most consumers should leave this undefined and
   *  style via `class` (the content).
   *
   *  **Cascade-trap warning**: do NOT use shellClass to set `display`,
   *  `visibility`, or any other layout rule on the shell. The UA's
   *  `[popover]:not(:popover-open) { display: none }` closed-state
   *  hiding wins by virtue of having no author class competing at
   *  equal specificity. Restrict shellClass rules to `::backdrop` and
   *  shell-scoped CSS variables. */
  shellClass?: string;
  /** Optional inline-style accessor applied to the SHELL element.
   *  Reactive — the effect re-runs and re-sets each property when
   *  the accessor's tracked dependencies change. Useful for setting
   *  CSS custom properties that need shell-element scope (e.g.
   *  `--popover-backdrop-top` for `::backdrop` styles, since
   *  `::backdrop` inherits from its originating popover element,
   *  not from `:root`). */
  shellStyle?: Accessor<Record<string, string>>;
  /** When true, override `placement`'s horizontal anchoring and center
   *  the popover horizontally in the viewport. Vertical positioning
   *  still uses the anchor (top = anchor.bottom + offset for below
   *  placements). Useful for wide panels where the anchor sits at one
   *  edge of the bar but the panel itself should appear visually
   *  centered. */
  centered?: boolean;
  /** Optional predicate consulted on every outside-click dismiss
   *  evaluation. Receives the click target as an `Element`. When it
   *  returns true, dismiss is SUPPRESSED.
   *
   *  Use this to coordinate with sibling popover-like surfaces that
   *  live in a Portal (so they appear "outside" by DOM walk but are
   *  logically nested). Typical predicate:
   *    `(t) => !!t.closest('[popover]:popover-open, [data-my-popover-stack]')`
   *
   *  When omitted, the only dismiss exclusions are the panel itself,
   *  the anchor, and the horizontalAnchor. */
  shouldSuppressDismiss?: (target: Element) => boolean;
  children: JSX.Element;
}

/**
 * Anchored popover primitive using the HTML Popover API in MANUAL mode
 * with a custom outside-click dismiss.
 *
 * Manual mode (vs `popover="auto"`) gives full control over dismiss
 * semantics — critically, we exclude the anchor element from "outside"
 * so clicking the trigger toggles cleanly without racing the UA's
 * light-dismiss handler.
 *
 * Two-element shape (shell + content) is load-bearing: the shell carries
 * `popover="manual"` and no author class; the content carries `class` and
 * receives all consumer styling. This prevents an author `display: flex`
 * on the popover element from overriding the UA's closed-state
 * `display: none`.
 */
export default function AnchoredPopover(props: AnchoredPopoverProps): JSX.Element {
  const [panelEl, setPanelEl] = createSignal<HTMLDivElement | undefined>(undefined);
  const [pos, setPos] = createSignal<{ top: number; left: number } | null>(null);
  const afterPaint = createAfterPaint();

  function computeAndClamp(): void {
    const anchor = props.anchor();
    const el = panelEl();
    if (!anchor || !el) return;
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
  }

  // Sync open() → browser popover state. Reading anchor() / panelEl()
  // tracks them so DOM swaps + ref population re-fire the effect.
  createEffect(() => {
    const el = panelEl();
    if (!el) return;
    if (props.open()) {
      void props.anchor();
      void props.horizontalAnchor?.();
      if (!el.matches(':popover-open')) {
        el.showPopover();
      }
      // Measure after show — panel must be in top layer to have
      // non-zero dimensions.
      afterPaint(() => {
        computeAndClamp();
        // Re-promote the parent popover (if any) AFTER our showPopover
        // and AFTER measure. Top-layer order is LIFO of showPopover()
        // calls — without this, our just-shown popover would paint
        // above its parent and any under-tuck overlap would invert
        // visually. Guarded on `:popover-open` so a parent that hasn't
        // entered top layer yet is a silent no-op rather than
        // InvalidStateError.
        const parent = props.parentPopoverRef?.();
        if (parent && parent.matches(':popover-open')) {
          parent.hidePopover();
          parent.showPopover();
        }
        // Last, deliberately: a consumer moving focus into the panel must run
        // after the panel is both painted and in its final position, or it
        // focuses an element the browser still considers unrenderable.
        props.onShown?.();
      });
    } else {
      if (el.matches(':popover-open')) {
        el.hidePopover();
      }
    }
  });

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
  document.addEventListener('pointerdown', onPointerDown);
  onCleanup(() => document.removeEventListener('pointerdown', onPointerDown));

  // Escape dismiss. Matches the UA's auto-popover behavior. A popover-
  // internal handler can preventDefault to keep its own Escape semantics
  // (e.g. an inline rename input cancelling its edit instead of
  // dismissing the popover).
  const onKeyDown = (e: KeyboardEvent): void => {
    if (!props.open()) return;
    if (e.key !== 'Escape') return;
    if (e.defaultPrevented) return;
    props.onDismiss();
  };
  document.addEventListener('keydown', onKeyDown);
  onCleanup(() => document.removeEventListener('keydown', onKeyDown));

  // Reposition on resize. Closing would also be reasonable; consumer
  // can achieve that by calling onDismiss themselves.
  const onResize = (): void => {
    if (props.open()) computeAndClamp();
  };
  window.addEventListener('resize', onResize);
  onCleanup(() => window.removeEventListener('resize', onResize));

  // Reactive shellClass application. Tracks the prop so a consumer
  // that swaps shellClass gets the old class removed and the new one
  // added — avoids stale classes accumulating on the DOM node.
  createEffect<string | undefined>((prev) => {
    const el = panelEl();
    if (!el) return prev;
    if (prev) el.classList.remove(prev);
    if (props.shellClass) el.classList.add(props.shellClass);
    return props.shellClass;
  });

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
      {/* Two-element shape — the SHELL carries `popover` and position-
       *  fixed coordinates. Consumers cannot style it (no `class` prop
       *  reaches it). UA's `[popover]:not(:popover-open) { display:
       *  none }` rule has no author CSS competing at this level, so
       *  closed-state hiding always works.
       *
       *  The CONTENT element inside carries `props.class`. Consumers
       *  can write any layout rule there without needing
       *  `:popover-open` qualifiers. */}
      <div
        ref={(el) => {
          setPanelEl(el);
          // Setting via ref rather than JSX attribute: Solid's JSX
          // types don't yet include the `popover` global attribute,
          // and prop-spread of an object isn't reliably rendered as
          // an HTML attribute. setAttribute is unambiguous.
          el.setAttribute('popover', 'manual');
        }}
        // Shell has NO author class. Layout rules from consumers can
        // never reach this element, so the UA's closed-state
        // `display: none` always wins.
        //
        // Inline-style overrides three UA-stylesheet quirks:
        //   1. `[popover]` defaults to `overflow: auto` — would clip
        //      drop shadow on inner content. Force `overflow: visible`.
        //   2. `[popover]` defaults to `inset: 0; margin: auto` — would
        //      center closed-and-reopened popovers. Override via
        //      `top/left + margin: 0`; keep width/height unset so they
        //      inherit `fit-content`.
        //   3. `[popover]` defaults to `background-color: Canvas`
        //      (resolves to system color). Force transparent so only
        //      the inner's bg paints.
        style={
          pos()
            ? {
                position: 'fixed',
                top: `${pos()!.top}px`,
                left: `${pos()!.left}px`,
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
