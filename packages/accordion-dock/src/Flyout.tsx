import {
  AnchoredPopover,
  type AnchoredPlacement,
} from '@cujuju/solidjs-anchored-popover';
import { Show, onCleanup, type JSX } from 'solid-js';
import type { PanelMeta } from './context';
import { Close, Pin, PinOff } from './icons';
import { SlotIf } from './SlotIf';

import {
  DISMISS_SUPPRESS_SELECTOR,
  FLYOUT_CONTENT_CLASS,
  FLYOUT_FALLBACK_MAX_HEIGHT_VH,
  FLYOUT_SHELL_CLASS,
  GROUP_SELECTOR,
  RAIL_SELECTOR,
  flyoutCrossAxis,
  inheritedTypographyOf,
  type AutoHideGroup,
} from './autoHideModel';
/**
 * One flyout: the popover shell, its placement inputs, and the host the panel's subtree
 * portals into. It renders no panel content — that arrives from `AccordionPanel`.
 */
export function Flyout(props: {
  id: string;
  group: AutoHideGroup;
  registerHost: (id: string, el: HTMLElement | null) => void;
  onDismiss: () => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  onCommit: () => void;
  autoFocus: boolean;
}): JSX.Element {
  /** The popover's content element, once it exists — the whole flyout surface. */
  let surface: HTMLElement | undefined;

  /**
   * Move focus in once the popover is actually focusable, driven by the primitive's `onShown`.
   * See DESIGN_NOTES.md § src/autoHide.tsx:734.
   */
  const focusSurface = (): void => {
    if (!props.autoFocus) return;
    // The surface itself, not its first focusable child — the dialog pattern: the reader
    // announces the panel's label, and the next Tab enters content in document order.
    surface?.focus();
  };
  // The anchor is READ REACTIVELY, not captured: the rail button's ref fires after this
  // component first renders, and a rail re-render can replace the element.
  const anchor = (): HTMLElement | null | undefined =>
    props.group.activatorElOf(props.id);

  /** Flyouts grow from the rail edge horizontally and from the header downward vertically. See DESIGN_NOTES.md § src/autoHide.tsx:765. */
  const placement = (): AnchoredPlacement => {
    if (props.group.orientation() === 'vertical') return 'below-start';
    return props.group.railSide() === 'left' ? 'right-start' : 'left-start';
  };

  /** The group element — the vertical flyout's width reference, and the source of
   *  the typography the Portal would otherwise lose. */
  const groupEl = (): Element | null | undefined => anchor()?.closest(GROUP_SELECTOR);

  /** CROSS-AXIS size. The decision itself is `flyoutCrossAxis` — pure, and
   *  documented there; this only supplies the two measurements it needs. */
  const crossAxis = (): { width: string; minWidth: string; maxWidth?: string } => {
    const el = groupEl();
    return flyoutCrossAxis({
      orientation: props.group.orientation(),
      panelSizePx: props.group.sizeOf(props.id),
      groupWidthPx: el instanceof HTMLElement ? el.getBoundingClientRect().width : 0,
    });
  };

  /**
   * A flyout is at most as tall as the dock. The rail is measured because it already spans
   * exactly the dock's growth-axis extent.
   */
  const maxHeight = (): string => {
    // Re-runs when the rail button's ref lands. See DESIGN_NOTES.md § src/autoHide.tsx:803.
    const source =
      props.group.orientation() === 'vertical'
        ? groupEl()
        : anchor()?.closest(RAIL_SELECTOR);
    if (source === null || source === undefined)
      return `${FLYOUT_FALLBACK_MAX_HEIGHT_VH}vh`;
    return `${Math.round(source.getBoundingClientRect().height)}px`;
  };

  onCleanup(() => props.registerHost(props.id, null));

  return (
    <AnchoredPopover
      open={() => true}
      anchor={() => anchor() ?? null}
      placement={placement()}
      onDismiss={props.onDismiss}
      onShown={focusSurface}
      shouldSuppressDismiss={(target) =>
        target.closest(DISMISS_SUPPRESS_SELECTOR) !== null
      }
      shellClass={FLYOUT_SHELL_CLASS}
      shellStyle={() => {
        const style: Record<string, string> = {
          // Typography FIRST, so a host restyling through the tokens below still out-ranks the
          // inherited baseline. Sourced from the group via the anchor, which the flyout already holds.
          ...inheritedTypographyOf(groupEl()),
          '--acc-flyout-width': crossAxis().width,
          '--acc-flyout-min-width': crossAxis().minWidth,
          '--acc-flyout-max-height': maxHeight(),
        };
        // Absent in vertical, so the stylesheet's own ceiling token applies.
        const maxWidth = crossAxis().maxWidth;
        if (maxWidth !== undefined) style['--acc-flyout-max-width'] = maxWidth;
        // The per-panel accent recolours this panel's pin and focus ring. It inherits in the dock;
        // a Portal'd flyout is not a descendant, so it is restated here.
        const accent = props.group.meta(props.id)?.accent();
        if (accent !== undefined) style['--acc-accent'] = accent;
        return style;
      }}
      class={FLYOUT_CONTENT_CLASS}
      aria-label={labelOf(props.group.meta(props.id))}
      /* Pointer intent is asked of the WHOLE surface, not the content host: `pointerleave` does
              not bubble. See DESIGN_NOTES.md § src/autoHide.tsx:857. */
      contentRef={(el) => {
        surface = el;
        // Focusable programmatically but NOT in the tab sequence: the flyout is a destination for
        // the focus move above and for a click, never something tabbed into from the document.
        el.tabIndex = -1;
        // A pointerdown anywhere on the surface promotes the peek to a decision. Bubble phase, so
        // the pin and close buttons' `stopPropagation` still pre-empts it.
        el.addEventListener('pointerdown', props.onCommit);
        el.addEventListener('pointerenter', props.onPointerEnter);
        el.addEventListener('pointerleave', props.onPointerLeave);
      }}
    >
      {/* The flyout's OWN title bar, carrying a docked column's classes. Without this a flyout
             had no pin. See DESIGN_NOTES.md § src/autoHide.tsx:886. */}
      <div class="acc-col-bar">
        <SlotIf
          content={props.group.meta(props.id)?.icon()}
          wrap={(slot) => <span class="acc-icon">{slot}</span>}
        />
        <span class="acc-title">{props.group.meta(props.id)?.title()}</span>
        <Show when={props.group.meta(props.id)?.count() !== undefined}>
          <span class="acc-count">{props.group.meta(props.id)?.count()}</span>
        </Show>
        <div class="acc-header-tail">
          <Show when={props.group.meta(props.id)?.pinnable() === true}>
            <button
              type="button"
              class="acc-pin"
              data-no-drag
              aria-pressed={props.group.isPinned(props.id)}
              title="Pin — dock this panel as a column instead of a flyout"
              /* Stops the pointerdown from also reaching `onCommit` below, which
                 would promote the peek to a click-opened flyout in the same
                 gesture that is about to dock it outright. */
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => props.group.togglePin(props.id)}
            >
              {/* State, not action — see the column bar's pin. A flyout is by
                  definition unpinned, so this is the un-pinned glyph until the
                  click that docks it. */}
              <Show when={props.group.isPinned(props.id)} fallback={<PinOff />}>
                <Pin />
              </Show>
            </button>
          </Show>
          <button
            type="button"
            class="acc-close"
            data-no-drag
            title="Close"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => props.onDismiss()}
          >
            <Close />
          </button>
        </div>
      </div>

      <div
        class="acc-flyout-host"
        /* Restates the group's density inside the Portal'd surface — see the `density` note on
           AutoHideGroup. Tokens set here inherit to the flyout's whole subtree. */
        data-density={props.group.density?.() ?? 'comfortable'}
        ref={(el) => props.registerHost(props.id, el)}
      />
    </AnchoredPopover>
  );
}

/** Native-tooltip-or-title as an accessible name, when either is a plain string.
 *  A JSX title cannot become an `aria-label`; the content's own
 *  `aria-labelledby` still names the region in that case. */
function labelOf(meta: PanelMeta | undefined): string | undefined {
  if (meta === undefined) return undefined;
  const tooltip = meta.tooltip();
  if (tooltip !== undefined) return tooltip;
  const title = meta.title();
  return typeof title === 'string' ? title : undefined;
}
