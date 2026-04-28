import { Show, createMemo, createUniqueId, type JSX } from 'solid-js';
import { useCollapsible } from './useCollapsible';

export interface CollapsibleProps {
  title: string | JSX.Element;
  children: JSX.Element;

  count?: number;
  actions?: JSX.Element;
  icon?: JSX.Element;
  openIcon?: JSX.Element;
  closedIcon?: JSX.Element;

  // State:
  storageKey?: string;
  storageKeyPrefix?: string;
  defaultOpen?: boolean;
  forceOpen?: boolean | null;
  onChange?: (open: boolean) => void;

  // Styling:
  uppercase?: boolean;
  variant?: 'section' | 'panel';
  lazyMount?: boolean;
  keepMounted?: boolean;
  animated?: boolean;

  // A11y:
  ariaLabel?: string;
  id?: string;

  // Passthrough:
  class?: string;
  headerClass?: string;
  contentClass?: string;
}

export function Collapsible(props: CollapsibleProps): JSX.Element {
  const variant = (): 'section' | 'panel' => props.variant ?? 'section';
  const uppercase = (): boolean => props.uppercase ?? false;
  const keepMounted = (): boolean => props.keepMounted ?? true;
  const animated = (): boolean => props.animated ?? false;

  const state = useCollapsible({
    storageKey: props.storageKey,
    storageKeyPrefix: props.storageKeyPrefix,
    defaultOpen: props.defaultOpen,
    forceOpen: () => props.forceOpen,
    onChange: props.onChange,
  });

  const baseId = props.id ?? createUniqueId();
  const headerId = `${baseId}-header`;
  const contentId = `${baseId}-content`;

  const renderArrow = (): JSX.Element => {
    if (props.openIcon !== undefined && state.open()) return props.openIcon;
    if (props.closedIcon !== undefined && !state.open()) return props.closedIcon;
    if (props.icon !== undefined) return props.icon;
    return '▶';
  };

  // Track whether we've ever been open for lazyMount.
  const everOpen = createMemo<boolean>((prev) => prev || state.open(), false);

  const shouldRender = (): boolean => {
    if (state.open()) return true;
    if (props.lazyMount) return everOpen();
    return keepMounted();
  };

  return (
    <div
      class={`ccl-root ${props.class ?? ''}`.trim()}
      data-variant={variant()}
      data-open={state.open() ? 'true' : 'false'}
      data-uppercase={uppercase() ? 'true' : 'false'}
      data-animated={animated() ? 'true' : 'false'}
      aria-label={props.ariaLabel}
    >
      <div class="ccl-header-row">
        <button
          id={headerId}
          type="button"
          class={`ccl-header ${props.headerClass ?? ''}`.trim()}
          aria-expanded={state.open()}
          aria-controls={contentId}
          onClick={state.toggle}
        >
          <span class="ccl-arrow" aria-hidden="true">{renderArrow()}</span>
          <span class="ccl-title">{props.title}</span>
          <Show when={props.count !== undefined}>
            <span class="ccl-count">({props.count})</span>
          </Show>
        </button>
        <Show when={props.actions}>
          <div class="ccl-actions">{props.actions}</div>
        </Show>
      </div>
      <Show when={shouldRender()}>
        {/* When animated=true, the wrapper element implements the open/close
            transition via CSS `grid-template-rows: 0fr ↔ 1fr`. This auto-tracks
            content's natural height without JS measurement and handles dynamic
            content size changes for free — replacing the old broken-by-design
            `max-height: 0 ↔ none` style which CSS cannot interpolate.
            Browser support: Chrome 117+ / Firefox 121+ / Safari 17.4+ (all
            2023-Q1 2024). No-op fallback for `animated=false` (display: contents
            on the wrapper makes it inert). */}
        <div
          class="ccl-content-wrapper"
          data-content-wrapper="true"
          hidden={keepMounted() && !state.open() && !animated()}
        >
          <div
            id={contentId}
            role="region"
            aria-labelledby={headerId}
            class={`ccl-content ${props.contentClass ?? ''}`.trim()}
          >
            {props.children}
          </div>
        </div>
      </Show>
    </div>
  );
}
