import { Show, splitProps, type JSX } from 'solid-js';

/**
 * Native `div` attributes (minus string `title`, repurposed as header content) pass through to
 * the root. `classList` is folded into `class`, so imperatively added classes are dropped on
 * the next change.
 */
export interface GlassMenuProps
  extends Omit<JSX.HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Header content (left). With `title`, `headerAction` and `onClose` all omitted — `null`, a
   *  boolean and `''` count as omitted — no header renders. */
  title?: JSX.Element;
  /** Optional node rendered in the header between the title and the
   *  close button — e.g. a "Clear" action. */
  headerAction?: JSX.Element;
  /** Close-button handler. The close button renders only when this is
   *  provided; a menu with no dismiss affordance simply omits it. */
  onClose?: () => void;
  /** Hairline divider under the header. Defaults to `true`; pass
   *  `false` for a flush header (no border-bottom) — e.g. an option
   *  list where a header-to-body rule reads as visual clutter. */
  headerDivider?: boolean;
  /** Root `overflow`. Default `'hidden'` clips body content to the rounded corners; `'visible'`
   *  lets submenus or shadows paint past the edge. */
  overflow?: 'hidden' | 'visible';
  /** Forwarded to the root element so a caller (e.g. a positioned
   *  popover) can measure the surface. */
  ref?: HTMLDivElement | ((el: HTMLDivElement) => void);
}

/**
 * Presentational glass menu shell: optional header over a scrollable body. No positioning, Portal
 * or dismiss; the root carries `.glass-menu`, so it can be the positioned element.
 */
export function GlassMenu(props: GlassMenuProps): JSX.Element {
  const [local, rest] = splitProps(props, [
    'title',
    'headerAction',
    'onClose',
    'headerDivider',
    'overflow',
    'children',
    'class',
    'classList',
  ]);

  // Solid renders nothing visible for these; they must not force an empty header row.
  const isRendered = (node: JSX.Element): boolean =>
    node !== undefined && node !== null && typeof node !== 'boolean' && node !== '';

  // Folded into the class string: a separate classList binding is wiped whenever `class` is rewritten.
  const callerClassList = (): string =>
    Object.entries(local.classList ?? {})
      .filter(([, on]) => on)
      .map(([name]) => ` ${name}`)
      .join('');

  const hasHeader = (): boolean =>
    isRendered(local.title) ||
    isRendered(local.headerAction) ||
    local.onClose !== undefined;

  return (
    <div
      {...rest}
      class={`glass-menu cujuju-glass-menu${
        local.overflow === 'visible'
          ? ' cujuju-glass-menu--overflow-visible'
          : ''
      }${local.class ? ` ${local.class}` : ''}${callerClassList()}`}
    >
      <Show when={hasHeader()}>
        <div
          class={`cujuju-glass-menu-header${
            local.headerDivider === false
              ? ' cujuju-glass-menu-header--flush'
              : ''
          }`}
        >
          {/* Always rendered so actions stay right-aligned without a title; a `div` so callers can pass block content. */}
          <div class="cujuju-glass-menu-title">{local.title}</div>
          <div class="cujuju-glass-menu-header-actions">
            {local.headerAction}
            <Show when={local.onClose}>
              <button
                type="button"
                class="cujuju-glass-menu-close"
                aria-label="Close"
                onClick={() => local.onClose?.()}
              >
                ×
              </button>
            </Show>
          </div>
        </div>
      </Show>
      <div class="cujuju-glass-menu-body">{local.children}</div>
    </div>
  );
}
