import { createSignal, createMemo, createEffect, on, onCleanup, For, Show, type JSX } from 'solid-js';
import { Portal } from 'solid-js/web';
import {
  createClampedPosition,
  DEFAULT_ANCHOR_GAP_PX,
  type KvTooltipPlacement,
} from './clamp';
import { createHoverIntent } from './_internal/hoverIntent';
import { isTopLayerSurfaceOpen } from './_internal/topLayer';

/**
 * An anchor is either a rect captured by the caller, or an accessor that
 * re-measures on demand. Prefer the accessor form: the position recomputes on
 * viewport resize and on any scroll (see `clamp.ts`), and only the accessor
 * form can return a fresh rect at that moment. A bare `DOMRect` is a snapshot
 * and will go stale if the anchor element moves.
 */
export type KvTooltipAnchor = DOMRect | (() => DOMRect | null);

/** Resolve either anchor form to a rect (or `null` when unset / unmounted). */
function resolveAnchor(anchor: KvTooltipAnchor | undefined): DOMRect | null {
  if (anchor === undefined) return null;
  return typeof anchor === 'function' ? anchor() : anchor;
}

/**
 * Anchored-placement props. Shared by the hover wrapper and the controlled
 * panel — one declaration so the two entry points can never drift apart on
 * what anchoring means.
 *
 * Why anchoring exists at all: a panel placed at a cursor POINT can only be
 * kept clear of a surface that opens from the same trigger by luck. Anchoring
 * to the trigger's RECT lets the tooltip take one side (say, above) while a
 * menu takes the other (below), so neither can cover the other. That matters
 * specifically because the native Popover API paints in the browser TOP LAYER:
 * this Portal-rendered panel is normal stacking content and can never paint
 * above an open popover at any z-index. Placement, not z-index, is the fix.
 */
export interface KvTooltipAnchoringProps {
  /**
   * Anchor the panel to a rect instead of to `x`/`y`. When supplied, `x`/`y`
   * are ignored and `hysteresisPx` is bypassed (a static rect cannot flicker).
   * Prefer the accessor form so the rect is re-read on resize / scroll.
   */
  anchor?: KvTooltipAnchor;
  /**
   * Which side of the `anchor` the panel takes, and how it aligns along that
   * side. Default `'cursor'` = the 0.1.0 mouse-follow behaviour. Supplying an
   * `anchor` while leaving this at `'cursor'` resolves to `'below-start'`.
   * Overflow flips to the opposite side of the RECT — never onto it.
   */
  placement?: KvTooltipPlacement;
  /**
   * Gap between the anchor's edge and the panel's facing edge. Default 4,
   * matching `DEFAULT_POPOVER_OFFSET_PX` in `@cujuju/solidjs-anchored-popover`
   * so a tooltip and a popover on the same trigger share one offset grid.
   */
  anchorGapPx?: number;
}

// ── Filter helper ──────────────────────────────────────────────────────────
function filterEntries(
  entries: Record<string, string>,
  showEmpty: boolean,
): Array<[string, string]> {
  return Object.entries(entries).filter(([, v]) =>
    showEmpty ? true : v !== '' && v !== undefined,
  );
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
  panelClass?: string;
  portalTarget?: HTMLElement;
  /**
   * Optional handlers wired onto the panel's outer div. KvTooltip wrapper
   * uses these to participate in the hover-intent state machine (cancel
   * pending hide on enter, re-arm on leave). KvTooltipPanel (controlled
   * mode) omits them — consumer owns visibility.
   *
   * Safe to attach unconditionally: when `interactive=false` the panel has
   * `pointer-events: none` (per styles.css), so these listeners attach but
   * never fire.
   */
  onPanelMouseEnter?: () => void;
  onPanelMouseLeave?: () => void;
}

function toCssSize(v: number | string | undefined): string | undefined {
  if (v === undefined) return undefined;
  return typeof v === 'number' ? `${v}px` : v;
}

function TooltipContent(props: TooltipContentProps): JSX.Element {
  let ref: HTMLDivElement | undefined;
  const [measured, setMeasured] = createSignal(false);
  const [size, setSize] = createSignal({ w: 0, h: 0 });

  // Measure after mount to avoid first-frame position jump
  createEffect(() => {
    const _len = props.entries.length; // track for re-measure
    void _len;
    void props.extraContent; // re-measure when extra content changes
    if (ref) {
      setSize({ w: ref.offsetWidth, h: ref.offsetHeight });
      setMeasured(true);
    }
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

  return (
    <Portal mount={props.portalTarget ?? document.body}>
      <div
        ref={ref}
        class={`ckv-panel ${props.panelClass ?? ''}`.trim()}
        role={props.role}
        aria-label={props.ariaLabel}
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

// ── Wrapper mode: hover-triggered ──────────────────────────────────────────
export interface KvTooltipProps extends KvTooltipAnchoringProps {
  entries: Record<string, string>;
  children: JSX.Element;

  extraContent?: JSX.Element;

  showEmpty?: boolean;
  disabled?: boolean;
  mouseOffsetX?: number;
  mouseOffsetY?: number;
  hysteresisPx?: number;
  edgePadPx?: number;
  interactive?: boolean;

  minWidth?: number | string;
  maxWidth?: number | string;

  /**
   * Hide-debounce delay (ms) used in interactive mode. After the cursor
   * leaves the trigger (or the panel), the panel persists this long so the
   * user can cross the gap between trigger and panel without losing it.
   * Cancelled by re-entering either the trigger or the panel.
   *
   * Default 100ms — derived from typical pointer-travel time across the
   * `mouseOffsetX/Y` gap (12-16px at 60-120 px/s mouse speeds = 100-250ms).
   * Both wrapper and panel cancel on enter, so 100ms catches a slow user
   * who paused mid-traversal. Below 50ms feels too fast; above 200ms feels
   * sluggish.
   *
   * Only consulted when `interactive=true`. Non-interactive callers hide
   * immediately on mouseleave (preserved behavior).
   */
  hideDelayMs?: number;

  /**
   * Rest delay (ms) on the way IN: the panel appears only after the pointer
   * has stayed on the trigger this long, so a pointer passing THROUGH a dense
   * row of triggers never flashes a tooltip behind it. Cancelled by leaving
   * the trigger.
   *
   * Default 0 / undefined = show immediately (0.1.x behaviour). There is
   * deliberately no derived default — the right value depends on the
   * consumer's trigger density and size, not on this package's geometry. See
   * the derivation in `_internal/hoverIntent.ts`.
   *
   * Applies in both interactive and non-interactive mode.
   */
  showDelayMs?: number;

  /**
   * Snapshot the panel's content AND its reference position at show time, and
   * hold both until the panel hides.
   *
   * Why: `entries` is read reactively, so a live-ticking source (a streaming
   * quote) re-runs the entries memo on every tick, which re-runs the panel's
   * measure effect, which re-derives the clamped position — the panel visibly
   * re-measures and twitches under a stationary cursor. Consumers were
   * working around this downstream by snapshotting the object before passing
   * it in; that workaround belongs here, where the measure effect actually
   * lives.
   *
   * What is frozen: the filtered entry list, the cursor point, and the
   * resolved anchor rect. What is NOT frozen: `extraContent` (the consumer
   * owns its own reactivity) and the viewport clamp itself — a frozen panel
   * still re-clamps on resize/scroll, it just re-clamps from held inputs, so
   * it cannot drift off-screen while held.
   *
   * Default `false` = 0.1.0 live-follow behaviour.
   */
  freezeOnShow?: boolean;

  /**
   * Pressing the pointer on the trigger hides the panel and suppresses every
   * re-show until the pointer leaves the trigger and comes back.
   *
   * For a trigger that is also a control — a field that opens a select menu,
   * a button that opens a popover — the tooltip has said what it had to say by
   * the time the user commits to clicking, and keeping it up means it competes
   * with whatever the click opened.
   *
   * The suppression (rather than a bare hide) is the load-bearing half: a
   * click that lands before a pending `showDelayMs` elapses would otherwise
   * still let the deferred show fire, painting the tooltip over the surface
   * that just opened.
   *
   * Default `false` = pointerdown is not observed at all (0.1.x behaviour).
   */
  hideOnPointerDown?: boolean;

  /**
   * Refuse to show while any native popover is open in the browser's top
   * layer (`[popover]:popover-open`).
   *
   * `hideOnPointerDown` covers the click that opens a menu; this covers the
   * opens it cannot see — keyboard activation, programmatic opens, a surface
   * opened from elsewhere on the page. The panel is ordinary
   * stacking-context content, so it can never paint above the top layer at
   * any z-index; showing it there produces an invisible or competing tooltip.
   *
   * Default `false`, and deliberately so despite being a bug fix: the check is
   * document-global, so defaulting it on would silently break a KvTooltip
   * rendered INSIDE an open popover or dialog — a legitimate existing usage
   * that would simply stop showing tooltips. Opt in from the surface that
   * actually has the collision.
   */
  suppressWhileTopLayerOpen?: boolean;

  ariaLabel?: string;
  role?: 'tooltip' | 'status';

  class?: string;
  panelClass?: string;
  portalTarget?: HTMLElement;
}

/** Content + reference position held for the lifetime of one show, per `freezeOnShow`. */
interface FrozenSnapshot {
  entries: Array<[string, string]>;
  x: number;
  y: number;
  anchor: DOMRect | null;
}

export function KvTooltip(props: KvTooltipProps): JSX.Element {
  const [visible, setVisible] = createSignal(false);
  const [mouse, setMouse] = createSignal({ x: 0, y: 0 });

  const filtered = createMemo(() =>
    filterEntries(props.entries, props.showEmpty ?? false),
  );

  const shouldShow = (): boolean => !(props.disabled ?? false) && (filtered().length > 0 || props.extraContent !== undefined);
  const interactive = (): boolean => props.interactive ?? false;
  const hideDelayMs = (): number => props.hideDelayMs ?? 100;
  const showDelayMs = (): number => props.showDelayMs ?? 0;

  // ── freezeOnShow: capture content + reference position at show time ───────
  // `on(visible, …)` runs its callback untracked, so taking the snapshot does
  // NOT subscribe this effect to the very sources it is snapshotting.
  const [frozen, setFrozen] = createSignal<FrozenSnapshot | null>(null);
  createEffect(
    on(visible, (v) => {
      if (!v || !(props.freezeOnShow ?? false)) {
        setFrozen(null);
        return;
      }
      const m = mouse();
      setFrozen({ entries: filtered(), x: m.x, y: m.y, anchor: resolveAnchor(props.anchor) });
    }),
  );

  // Each of these reads the live source ONLY when nothing is frozen — reading
  // it unconditionally (e.g. `frozen()?.x ?? mouse().x`) would re-subscribe
  // the panel to the ticking source and defeat the freeze.
  const panelEntries = (): Array<[string, string]> => frozen()?.entries ?? filtered();
  const panelX = (): number => { const f = frozen(); return f ? f.x : mouse().x; };
  const panelY = (): number => { const f = frozen(); return f ? f.y : mouse().y; };
  const panelAnchor = (): KvTooltipAnchor | undefined => {
    const f = frozen();
    // A frozen null anchor means "was never anchored" — stay in cursor mode
    // rather than falling back to the live prop, which would unfreeze it.
    return f ? (f.anchor ?? undefined) : props.anchor;
  };

  // Hover-intent state machine — extracted to _internal/hoverIntent.ts so the
  // logic is unit-testable without mounting JSX. Non-interactive callers see
  // instant hide (preserved behavior); interactive mode debounces by
  // hideDelayMs and cancels on either trigger or panel re-entry.
  const hoverIntent = createHoverIntent({
    setVisible,
    shouldShow,
    interactive,
    hideDelayMs,
    showDelayMs,
    hideOnPointerDown: () => props.hideOnPointerDown ?? false,
    blockShow: () =>
      (props.suppressWhileTopLayerOpen ?? false) && isTopLayerSurfaceOpen(),
  });
  onCleanup(hoverIntent.cleanup);

  return (
    <span
      class={props.class}
      style={{ position: 'relative', display: 'inline', overflow: 'hidden', 'text-overflow': 'ellipsis' }}
      onMouseEnter={(e) => {
        // Seed the cursor point from the ENTER event, not the last mousemove.
        // Without this the panel's first frame uses a stale point (or 0,0 on
        // the very first hover) until a mousemove corrects it — invisible in
        // live-follow mode, but `freezeOnShow` would capture that stale point
        // and hold it for the whole show.
        setMouse({ x: e.clientX, y: e.clientY });
        hoverIntent.onTriggerEnter();
      }}
      onMouseMove={(e) => setMouse({ x: e.clientX, y: e.clientY })}
      onMouseLeave={hoverIntent.onTriggerLeave}
      onPointerDown={hoverIntent.onTriggerPointerDown}
    >
      {props.children}
      <Show when={visible() && shouldShow()}>
        <TooltipContent
          entries={panelEntries()}
          x={panelX()}
          y={panelY()}
          extraContent={props.extraContent}
          hysteresisPx={props.hysteresisPx ?? 20}
          edgePadPx={props.edgePadPx ?? 8}
          mouseOffsetX={props.mouseOffsetX ?? 12}
          mouseOffsetY={props.mouseOffsetY ?? 16}
          minWidth={props.minWidth}
          maxWidth={props.maxWidth}
          interactive={interactive()}
          role={props.role ?? 'tooltip'}
          ariaLabel={props.ariaLabel}
          panelClass={props.panelClass}
          portalTarget={props.portalTarget}
          onPanelMouseEnter={hoverIntent.onPanelEnter}
          onPanelMouseLeave={hoverIntent.onPanelLeave}
          anchor={panelAnchor()}
          placement={props.placement}
          anchorGapPx={props.anchorGapPx}
        />
      </Show>
    </span>
  );
}

// ── Controlled mode: caller owns x/y + visibility ──────────────────────────
export interface KvTooltipPanelProps extends KvTooltipAnchoringProps {
  entries: Record<string, string>;
  /**
   * Cursor / reference coordinates in viewport space. Ignored while `anchor`
   * resolves to a rect; still required so a caller can drop `anchor` at
   * runtime (unmounted anchor element) and fall back to point placement.
   */
  x: number;
  y: number;

  extraContent?: JSX.Element;

  showEmpty?: boolean;
  mouseOffsetX?: number;
  mouseOffsetY?: number;
  hysteresisPx?: number;
  edgePadPx?: number;
  interactive?: boolean;

  minWidth?: number | string;
  maxWidth?: number | string;

  ariaLabel?: string;
  role?: 'tooltip' | 'status';

  class?: string;
  panelClass?: string;
  portalTarget?: HTMLElement;
}

export function KvTooltipPanel(props: KvTooltipPanelProps): JSX.Element {
  const filtered = createMemo(() =>
    filterEntries(props.entries, props.showEmpty ?? false),
  );
  const shouldShow = (): boolean => filtered().length > 0 || props.extraContent !== undefined;

  return (
    <Show when={shouldShow()}>
      <TooltipContent
        entries={filtered()}
        x={props.x}
        y={props.y}
        extraContent={props.extraContent}
        hysteresisPx={props.hysteresisPx ?? 20}
        edgePadPx={props.edgePadPx ?? 8}
        mouseOffsetX={props.mouseOffsetX ?? 12}
        mouseOffsetY={props.mouseOffsetY ?? 16}
        minWidth={props.minWidth}
        maxWidth={props.maxWidth}
        interactive={props.interactive ?? false}
        role={props.role ?? 'tooltip'}
        ariaLabel={props.ariaLabel}
        panelClass={props.panelClass}
        portalTarget={props.portalTarget}
        anchor={props.anchor}
        placement={props.placement}
        anchorGapPx={props.anchorGapPx}
      />
    </Show>
  );
}
