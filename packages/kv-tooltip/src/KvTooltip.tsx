import { createSignal, createMemo, createEffect, onCleanup, For, Show, type JSX } from 'solid-js';
import { Portal } from 'solid-js/web';
import { createClampedPosition } from './clamp';
import { createHoverIntent } from './_internal/hoverIntent';

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
interface TooltipContentProps {
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

  const pos = createClampedPosition(
    () => props.x,
    () => props.y,
    () => size().w || 150,
    () => size().h || 100,
    props.hysteresisPx,
    props.edgePadPx,
    props.mouseOffsetX,
    props.mouseOffsetY,
  );

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
export interface KvTooltipProps {
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

  ariaLabel?: string;
  role?: 'tooltip' | 'status';

  class?: string;
  panelClass?: string;
  portalTarget?: HTMLElement;
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

  // Hover-intent state machine — extracted to _internal/hoverIntent.ts so the
  // logic is unit-testable without mounting JSX. Non-interactive callers see
  // instant hide (preserved behavior); interactive mode debounces by
  // hideDelayMs and cancels on either trigger or panel re-entry.
  const hoverIntent = createHoverIntent({
    setVisible,
    shouldShow,
    interactive,
    hideDelayMs,
  });
  onCleanup(hoverIntent.cleanup);

  return (
    <span
      class={props.class}
      style={{ position: 'relative', display: 'inline', overflow: 'hidden', 'text-overflow': 'ellipsis' }}
      onMouseEnter={hoverIntent.onTriggerEnter}
      onMouseMove={(e) => setMouse({ x: e.clientX, y: e.clientY })}
      onMouseLeave={hoverIntent.onTriggerLeave}
    >
      {props.children}
      <Show when={visible() && shouldShow()}>
        <TooltipContent
          entries={filtered()}
          x={mouse().x}
          y={mouse().y}
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
        />
      </Show>
    </span>
  );
}

// ── Controlled mode: caller owns x/y + visibility ──────────────────────────
export interface KvTooltipPanelProps {
  entries: Record<string, string>;
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
      />
    </Show>
  );
}
