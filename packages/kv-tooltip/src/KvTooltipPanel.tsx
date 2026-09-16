import { createMemo, Show, type JSX } from 'solid-js';
import { TooltipContent, filterEntries, type KvTooltipAnchoringProps } from './TooltipContent';

// ── Controlled mode: caller owns x/y + visibility ──────────────────────────
export interface KvTooltipPanelProps extends KvTooltipAnchoringProps {
  entries: Record<string, string>;
  /**
   * Viewport coordinates. Ignored while `anchor` resolves; still required for the point
   * fallback when the anchor unmounts.
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

  /**
   * The browser closed the popover (another hint, `auto` popover, Escape, outside click); set
   * your visibility false. Without it the panel demotes and stays visible under top-layer surfaces.
   */
  onPlatformDismiss?: () => void;

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
        onPlatformDismiss={props.onPlatformDismiss}
        anchor={props.anchor}
        placement={props.placement}
        anchorGapPx={props.anchorGapPx}
      />
    </Show>
  );
}
