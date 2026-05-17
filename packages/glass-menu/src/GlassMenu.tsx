import { Show, splitProps, type JSX } from 'solid-js';

/**
 * Props for {@link GlassMenu}. Extends the native `div` attributes
 * (minus the HTML `title` string attribute, which is repurposed below
 * as the header content), so `ref`, `style`, `class`, `role`, and
 * `aria-*` all pass through to the root element — the caller positions
 * and labels the surface, `GlassMenu` only paints the chrome.
 */
export interface GlassMenuProps
  extends Omit<JSX.HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Header content (left side). A string or any node. Optional — when
   *  `title`, `headerAction`, and `onClose` are all omitted, the header
   *  row is not rendered at all and `GlassMenu` is a bare glass surface
   *  wrapping `children`. */
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
  /** Root `overflow`. Defaults to `'hidden'` — clips edge-to-edge body
   *  content (e.g. full-width row hovers) to the rounded corners. Pass
   *  `'visible'` for a menu whose children must paint past the surface
   *  edge — a context menu with Portal-less submenus, or one relying on
   *  the drop shadow rendering outside the box. */
  overflow?: 'hidden' | 'visible';
  /** Forwarded to the root element so a caller (e.g. a positioned
   *  popover) can measure the surface. */
  ref?: HTMLDivElement | ((el: HTMLDivElement) => void);
}

/**
 * Glass-surfaced menu shell — an optional header row (title + optional
 * action slot + optional close button) above a scrollable body. Purely
 * presentational: it owns no positioning, no Portal, and no dismiss
 * lifecycle (outside-click / Escape belong to the caller that controls
 * open state). The root element carries the `.glass-menu` surface class
 * from `@cujuju/solidjs-glass`, so the caller can make `GlassMenu`
 * itself the positioned element without nesting an extra box.
 *
 * The header is rendered only when at least one of `title`,
 * `headerAction`, or `onClose` is supplied — so `GlassMenu` doubles as
 * a plain glass container for headerless menus (option lists, context
 * menus) as well as the full titled-panel shell.
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
  ]);

  const hasHeader = (): boolean =>
    local.title !== undefined ||
    local.headerAction !== undefined ||
    local.onClose !== undefined;

  return (
    <div
      {...rest}
      class={`glass-menu cujuju-glass-menu${
        local.overflow === 'visible'
          ? ' cujuju-glass-menu--overflow-visible'
          : ''
      }${local.class ? ` ${local.class}` : ''}`}
    >
      <Show when={hasHeader()}>
        <div
          class={`cujuju-glass-menu-header${
            local.headerDivider === false
              ? ' cujuju-glass-menu-header--flush'
              : ''
          }`}
        >
          {/* Always rendered so the actions cluster stays right-
              aligned even with no title — an empty title div has zero
              content width. A `div` (not `span`) so callers can pass
              block content, e.g. a stacked stats cluster. */}
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
