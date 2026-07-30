import { Show, type JSX } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { useSegGroupContext } from './SegGroup';
import { useSegTooltipHost, segTooltipDefaults } from './tooltipHost';

export interface SegButtonProps<T = string> {
  label: string;

  // Uncontrolled mode (when SegGroup has no `value`):
  active?: boolean;
  onClick?: () => void;

  // Controlled mode (when SegGroup has `value`):
  value?: T;

  // Sizing — preset + raw overrides:
  size?: 'xs' | 'sm' | 'md';
  height?: number | string;
  paddingX?: number | string;
  fontSize?: number | string;
  minWidth?: number;

  // Visual:
  reserveBoldWidth?: boolean;
  children?: JSX.Element;

  // State + a11y:
  disabled?: boolean;
  ariaLabel?: string;
  /**
   * Hover hint. Rendered through the component the consumer registered with
   * `setSegTooltipHost` (styleable, delay-controlled, and described to screen
   * readers via the trigger) — or, when nothing is registered, as a native
   * `title`. Callers do not choose: the same prop gives the best available
   * tooltip. See `tooltipHost.ts` for why registration and not auto-detection.
   */
  title?: string;
  /** Overrides the delay set by `setSegTooltipDefaults`, ms. Host path only. */
  tooltipDelayMs?: number;

  class?: string;
}

function toCssSize(v: number | string | undefined): string | undefined {
  if (v === undefined) return undefined;
  return typeof v === 'number' ? `${v}px` : v;
}

export function SegButton<T = string>(props: SegButtonProps<T>): JSX.Element {
  const ctx = useSegGroupContext();
  const size = (): 'xs' | 'sm' | 'md' => props.size ?? 'md';
  const reserveBold = (): boolean => props.reserveBoldWidth ?? true;

  // Determine active state — context (controlled) takes precedence if present.
  const isActive = (): boolean => {
    if (ctx !== null && props.value !== undefined) {
      return ctx.value === props.value;
    }
    return props.active ?? false;
  };

  const handleClick = (): void => {
    if (props.disabled) return;
    if (ctx !== null && props.value !== undefined) {
      ctx.onChange(props.value as unknown);
    } else {
      props.onClick?.();
    }
  };

  // Inline style overrides — applied on top of the size preset class.
  const style = (): JSX.CSSProperties => {
    const s: JSX.CSSProperties = {};
    if (props.height !== undefined) s.height = toCssSize(props.height);
    if (props.paddingX !== undefined) {
      const p = toCssSize(props.paddingX);
      if (p !== undefined) {
        s['padding-inline-start'] = p;
        s['padding-inline-end'] = p;
      }
    }
    if (props.fontSize !== undefined) s['font-size'] = toCssSize(props.fontSize);
    if (props.minWidth !== undefined) s['min-width'] = `${props.minWidth}px`;
    return s;
  };

  // Radiogroup mode: role="radio" + aria-checked. Group mode: aria-pressed.
  const isRadio = (): boolean => ctx?.role === 'radiogroup';

  // Which tooltip mechanism this button is using right now. 'none' when there
  // is nothing to say, so a button without a hint renders no wrapper at all and
  // the group's direct-child CSS keeps its simplest form.
  const host = (): ReturnType<typeof useSegTooltipHost> => useSegTooltipHost();
  const tooltipMode = (): 'none' | 'host' | 'native' => {
    if (!props.title) return 'none';
    return host() ? 'host' : 'native';
  };

  const button = (): JSX.Element => (
    <button
      type="button"
      class={`csb-btn csb-btn-${size()} ${props.class ?? ''}`.trim()}
      style={style()}
      disabled={props.disabled}
      // Native title ONLY when no host is rendering this hint — the two on one
      // trigger is the double-popup this indirection exists to prevent.
      title={tooltipMode() === 'native' ? props.title : undefined}
      aria-label={props.ariaLabel}
      aria-pressed={!isRadio() ? isActive() : undefined}
      aria-checked={isRadio() ? isActive() : undefined}
      role={isRadio() ? 'radio' : undefined}
      tabIndex={isRadio() ? (isActive() ? 0 : -1) : undefined}
      data-label={props.label}
      data-reserve-bold={reserveBold() ? 'true' : undefined}
      onClick={handleClick}
      onKeyDown={(e) => {
        // Roving focus for radiogroup mode — ArrowLeft/ArrowRight move focus
        // across siblings. Keeps SegGroup + SegButton loosely coupled by
        // walking the DOM rather than needing registration.
        if (!isRadio()) return;
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        const btn = e.currentTarget;
        // Scope to the GROUP, not the parent element: with a tooltip host in
        // play the button's parent is that wrapper, and a parent-scoped query
        // would find only this button — arrow keys would go dead.
        const parent = btn.closest('.csb-group') ?? btn.parentElement;
        if (!parent) return;
        const siblings = Array.from(parent.querySelectorAll<HTMLButtonElement>('.csb-btn'));
        const idx = siblings.indexOf(btn);
        if (idx < 0) return;
        const delta = e.key === 'ArrowRight' ? 1 : -1;
        const nextIdx = (idx + delta + siblings.length) % siblings.length;
        const next = siblings[nextIdx];
        next.focus();
        next.click();
      }}
    >
      {props.children ?? props.label}
    </button>
  );

  // `when` carries the host itself, not a boolean, so the callback body cannot
  // run before there is one to render through — `Show`'s callback form is the
  // only shape that guarantees that ordering.
  return (
    <Show when={tooltipMode() === 'host' ? host() : null} fallback={button()}>
      {(Tooltip) => (
        <Dynamic
          component={Tooltip()}
          entries={{}}
          description={props.title}
          showDelayMs={props.tooltipDelayMs ?? segTooltipDefaults().delayMs}
          maxWidth={segTooltipDefaults().maxWidth}
          // The host must not become a box between the group and the button:
          // the group lays its children out with flex and its own CSS reaches
          // them as direct children.
          wrapperLayout="contents"
          hideOnPointerDown
          extraContent={<span class="csb-tip">{props.title}</span>}
        >
          {button()}
        </Dynamic>
      )}
    </Show>
  );
}
