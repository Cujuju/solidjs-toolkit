import { type JSX } from 'solid-js';
import { useSegGroupContext } from './SegGroup';

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
  title?: string;

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

  return (
    <button
      type="button"
      class={`csb-btn csb-btn-${size()} ${props.class ?? ''}`.trim()}
      style={style()}
      disabled={props.disabled}
      title={props.title}
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
        const parent = btn.parentElement;
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
}
