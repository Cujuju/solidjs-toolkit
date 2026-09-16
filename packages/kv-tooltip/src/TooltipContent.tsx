import {
  createSignal,
  createEffect,
  onCleanup,
  onMount,
  For,
  Show,
  type JSX,
} from 'solid-js';
import { Portal } from 'solid-js/web';
import {
  createClampedPosition,
  viewportSize,
  DEFAULT_ANCHOR_GAP_PX,
  type KvTooltipPlacement,
} from './clamp';

export function filterEntries(
  entries: Record<string, string>,
  showEmpty: boolean,
): Array<[string, string]> {
  return Object.entries(entries).filter(([, v]) =>
    showEmpty ? true : v !== '' && v !== undefined,
  );
}

/**
 * A caller-captured rect or a re-measuring accessor. Prefer the accessor: position recomputes
 * on resize/scroll, and a bare `DOMRect` goes stale if the anchor moves.
 */
export type KvTooltipAnchor = DOMRect | (() => DOMRect | null);

/** Resolve either anchor form to a rect (or `null` when unset / unmounted). */
export function resolveAnchor(anchor: KvTooltipAnchor | undefined): DOMRect | null {
  if (anchor === undefined) return null;
  return typeof anchor === 'function' ? anchor() : anchor;
}

/**
 * Anchored placement, shared by wrapper and panel. Anchoring to the trigger RECT lets a tooltip
 * and a menu take opposite sides, so neither covers the other.
 */
export interface KvTooltipAnchoringProps {
  /**
   * Anchor to a rect instead of `x`/`y`; `x`/`y` and `hysteresisPx` are then ignored.
   * Prefer the accessor form so the rect is re-read on resize/scroll.
   */
  anchor?: KvTooltipAnchor;
  /**
   * Side and alignment against `anchor`. Default `'cursor'` (mouse-follow); with an `anchor`
   * it resolves to `'below-start'`. Overflow flips to the rect's opposite side, never onto it.
   */
  placement?: KvTooltipPlacement;
  /**
   * Gap between the anchor's edge and the panel's facing edge. Default 4,
   * matching `DEFAULT_POPOVER_OFFSET_PX` in `@cujuju/solidjs-anchored-popover`
   * so a tooltip and a popover on the same trigger share one offset grid.
   */
  anchorGapPx?: number;
}

// ── Shared tooltip panel (internal) ─────────────────────────────────────────
interface TooltipContentProps extends KvTooltipAnchoringProps {
  entries: Array<[string, string]>;
  x: number;
  y: number;
  extraContent?: JSX.Element;
  hysteresisPx: number;
  edgePadPx: number;
  mouseOffsetX: number;
  mouseOffsetY: number;
  minWidth?: number | string;
  maxWidth?: number | string;
  interactive: boolean;
  role: 'tooltip' | 'status';
  ariaLabel?: string;
  /**
   * Hide from assistive tech when the wrapper's always-mounted description node already
   * exposes the text; one copy, not two.
   */
  ariaHidden?: boolean;
  panelClass?: string;
  portalTarget?: HTMLElement;
  /**
   * Hover-intent hooks for the wrapper; controlled mode omits them. Safe unconditionally: a
   * non-interactive panel has `pointer-events: none`, so they never fire.
   */
  onPanelMouseEnter?: () => void;
  onPanelMouseLeave?: () => void;
  /**
   * The PLATFORM closed the panel's popover (another hint, an `auto` popover, outside click,
   * Escape). See `KvTooltipPanelProps.onPlatformDismiss`.
   */
  onPlatformDismiss?: () => void;
  /** The mounted panel element, for the wrapper's Escape ownership. */
  panelRef?: (el: HTMLElement) => void;
}

function toCssSize(v: number | string | undefined): string | undefined {
  if (v === undefined) return undefined;
  return typeof v === 'number' ? `${v}px` : v;
}

/**
 * `hint`, the platform tooltip type: top-layer paint like `manual`, plus one-at-a-time,
 * yielding to `auto` popovers, and platform dismissal. See `promoteToTopLayer`.
 */
const PANEL_POPOVER_TYPE = 'hint';

const POPOVER_OPEN_SELECTOR = ':popover-open';

/**
 * Local, not `lib.dom`'s `ToggleEvent`: consumed from source, this must typecheck against
 * the consumer's possibly older DOM lib.
 */
interface PopoverToggleEvent extends Event {
  readonly newState?: string;
  readonly oldState?: string;
}

/**
 * A fixed element's shrink-to-fit width is capped at `viewport - left`; measuring at the
 * origin removes that dependency.
 */
const MEASURE_ORIGIN_LEFT = '0px';

/**
 * Measure at NATURAL size: in place, a panel near the right edge wraps narrower and taller,
 * corrupting clamp and flip. Effects run pre-paint, so the borrowed `left` never shows.
 */
function measureNaturalSize(el: HTMLElement): { w: number; h: number } {
  const previousLeft = el.style.left;
  el.style.left = MEASURE_ORIGIN_LEFT;
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  el.style.left = previousLeft;
  return { w, h };
}

export function TooltipContent(props: TooltipContentProps): JSX.Element {
  let ref: HTMLDivElement | undefined;
  const [measured, setMeasured] = createSignal(false);
  const [size, setSize] = createSignal(
    { w: 0, h: 0 },
    { equals: (a, b) => a.w === b.w && a.h === b.h },
  );

  // Measure after mount to avoid first-frame position jump
  createEffect(() => {
    const _len = props.entries.length; // track for re-measure
    void _len;
    void props.extraContent; // re-measure when extra content changes
    void viewportSize(); // the natural size is capped by the viewport
    if (ref) {
      setSize(measureNaturalSize(ref));
      setMeasured(true);
    }
  });

  // `extraContent` can reflow with no prop change (an image loads, a row arrives).
  // Only the trigger is taken from the entry; the size still comes from `measureNaturalSize`.
  onMount(() => {
    const el = ref;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setSize(measureNaturalSize(el)));
    observer.observe(el);
    onCleanup(() => observer.disconnect());
  });

  const pos = createClampedPosition({
    getX: () => props.x,
    getY: () => props.y,
    getW: () => size().w || 150,
    getH: () => size().h || 100,
    hysteresisPx: props.hysteresisPx,
    edgePadPx: props.edgePadPx,
    mouseOffsetX: props.mouseOffsetX,
    mouseOffsetY: props.mouseOffsetY,
    getAnchorRect: () => resolveAnchor(props.anchor),
    getPlacement: () => props.placement ?? 'cursor',
    getAnchorGapPx: () => props.anchorGapPx ?? DEFAULT_ANCHOR_GAP_PX,
  });

  const panelStyle = (): JSX.CSSProperties => ({
    top: `${pos().y}px`,
    left: `${pos().x}px`,
    opacity: measured() ? 1 : 0,
    ...(props.minWidth !== undefined ? { 'min-width': toCssSize(props.minWidth) } : {}),
    ...(props.maxWidth !== undefined ? { 'max-width': toCssSize(props.maxWidth) } : {}),
  });

  /**
   * Top layer paints above any z-index; LIFO puts a tooltip shown after its menu on top.
   * `hint`, not `auto` (which light-dismisses the menu). No Popover API: plain fixed div.
   */
  const promoteToTopLayer = (el: HTMLElement): void => {
    if (typeof el.showPopover !== 'function') return;
    // Attribute set only around a successful `showPopover()`: `[popover]:not(:popover-open)` is
    // `display: none`, so a failed promotion would leave an invisible tooltip.
    el.setAttribute('popover', PANEL_POPOVER_TYPE);
    try {
      el.showPopover();
    } catch {
      el.removeAttribute('popover');
    }
  };

  /**
   * Platform closed our popover: DEMOTE (drop `popover`, stay visible), never hide, then notify.
   * No re-promote: panels would fight one-at-a-time. State is re-read because `toggle` is
   * queued and may coalesce.
   */
  const onPopoverToggle = (el: HTMLElement, e: Event): void => {
    if ((e as PopoverToggleEvent).newState !== 'closed') return;
    let stillOpen = false;
    try {
      stillOpen = el.matches(POPOVER_OPEN_SELECTOR);
    } catch {
      // An engine that can't parse `:popover-open` has nothing in the top layer; treating it as
      // closed only makes the panel more visible.
      stillOpen = false;
    }
    if (stillOpen) return;
    // Removed panels need nothing. Chromium fires no `toggle` on removal (probed 2026-08-04);
    // this guards engines that do.
    if (!el.isConnected) return;
    el.removeAttribute('popover');
    props.onPlatformDismiss?.();
  };

  return (
    <Portal mount={props.portalTarget ?? document.body}>
      <div
        ref={(el) => {
          ref = el;
          props.panelRef?.(el);
          // Registered synchronously in the ref: `onCleanup` inside the microtask has no owner and
          // would leak. Unconditional: inert without promotion, and testable without a Popover API.
          const onToggle = (e: Event): void => onPopoverToggle(el, e);
          el.addEventListener('toggle', onToggle);
          onCleanup(() => el.removeEventListener('toggle', onToggle));
          // Promotion, by contrast, must wait for insertion: `showPopover()`
          // throws on a disconnected node, and a Solid ref fires before the
          // element is in the document.
          queueMicrotask(() => {
            if (el.isConnected) promoteToTopLayer(el);
          });
        }}
        class={`ckv-panel ${props.panelClass ?? ''}`.trim()}
        // Private identity marker, not a styling hook: `.ckv-panel` is forgeable.
        // `_internal/topLayer.ts` excludes it so a tooltip never defers to another tooltip.
        data-ckv-tooltip-panel=""
        role={props.role}
        aria-label={props.ariaLabel}
        aria-hidden={props.ariaHidden ? 'true' : undefined}
        data-interactive={props.interactive ? 'true' : undefined}
        style={panelStyle()}
        onMouseEnter={props.onPanelMouseEnter}
        onMouseLeave={props.onPanelMouseLeave}
      >
        <For each={props.entries}>
          {([key, value]) => (
            <div class="ckv-row">
              <span class="ckv-key">{key}:</span>
              <span class="ckv-value">{value}</span>
            </div>
          )}
        </For>
        <Show when={props.extraContent}>
          <div class="ckv-extra">{props.extraContent}</div>
        </Show>
      </div>
    </Portal>
  );
}
