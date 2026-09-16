import { Show, onCleanup, onMount, type JSX } from 'solid-js';
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

  reserveBoldWidth?: boolean;
  children?: JSX.Element;

  disabled?: boolean;
  ariaLabel?: string;
  /**
   * Hover hint, via the `setSegTooltipHost` component when registered, else native `title`.
   * See `tooltipHost.ts`.
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
    if (ctx?.controlled && props.value !== undefined) {
      return ctx.value === props.value;
    }
    return props.active ?? false;
  };

  const handleClick = (): void => {
    if (props.disabled) return;
    if (ctx?.controlled && props.value !== undefined) {
      ctx.onChange(props.value as unknown);
    } else {
      props.onClick?.();
    }
  };

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
  const isRadio = (): boolean => !!ctx?.controlled && ctx.role === 'radiogroup';

  let el: HTMLButtonElement | undefined;
  const entry = { active: isActive, disabled: () => !!props.disabled, el: () => el };
  onMount(() => {
    if (ctx) onCleanup(ctx.register(entry));
  });

  // 'none' when there's no hint, so no wrapper renders and the group's direct-child CSS stays
  // simple.
  const host = (): ReturnType<typeof useSegTooltipHost> => useSegTooltipHost();
  const tooltipMode = (): 'none' | 'host' | 'native' => {
    if (!props.title) return 'none';
    return host() ? 'host' : 'native';
  };

  const button = (): JSX.Element => (
    <button
      ref={el}
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
      tabIndex={isRadio() ? (ctx?.tabbable === entry ? 0 : -1) : undefined}
      data-label={props.label}
      data-reserve-bold={reserveBold() ? 'true' : undefined}
      onClick={handleClick}
      onKeyDown={(e) => {
        // Roving focus for radiogroup mode — ArrowLeft/ArrowRight move focus
        // across siblings. Arrow order is read from the live DOM at keypress;
        // the Tab stop comes from the group's registry.
        if (!isRadio()) return;
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        const btn = e.currentTarget;
        // Scope to the GROUP: with a tooltip host the parent is that wrapper, holding only this
        // button, so arrows would go dead.
        const ownGroup = btn.closest('.csb-group');
        const parent = ownGroup ?? btn.parentElement;
        if (!parent) return;
        // Disabled options can take neither focus nor click, so roving skips them.
        const siblings = Array.from(parent.querySelectorAll<HTMLButtonElement>('.csb-btn')).filter(
          // A nested group's buttons belong to that group's roving, not this one. Compare against
          // this button's own group so a portaled button (no `.csb-group` ancestor) still roves.
          (b) => !b.disabled && b.closest('.csb-group') === ownGroup,
        );
        const idx = siblings.indexOf(btn);
        if (idx < 0) return;
        // Arrows are visual: under RTL the next DOM sibling is drawn to the left. Flex items are
        // ordered by the CONTAINER's `direction`, so read the group, not the button.
        const forward = (e.key === 'ArrowRight') !== (getComputedStyle(parent).direction === 'rtl');
        const delta = forward ? 1 : -1;
        const nextIdx = (idx + delta + siblings.length) % siblings.length;
        const next = siblings[nextIdx];
        next.focus();
        next.click();
      }}
    >
      {props.children ?? props.label}
    </button>
  );

  // `when` carries the host itself so the callback can't run before one exists.
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
