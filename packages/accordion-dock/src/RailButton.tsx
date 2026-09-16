import { Show, type JSX } from 'solid-js';
import { slotRef, type AccordionGroupApi, type PanelMeta } from './context';
import { Pin } from './icons';
import { createActivatorKeyDown } from './keys';
import { createPanelMenu } from './panelMenu';
import { RAIL_ITEM_ATTR } from './railOverflow';
import { flyoutDataAttr, type AutoHideApi } from './autoHide';

/**
 * One button in the horizontal rail. Reads its label through the meta ACCESSORS rather than a
 * snapshot, so a ticking count or a changed title updates on the rail.
 */
export function RailButton(props: {
  group: AccordionGroupApi;
  meta: PanelMeta;
  autoHide: AutoHideApi;
  /** Whether this tab is the rail's single Tab stop. */
  tabStop: () => boolean;
  onTabFocus: () => void;
}): JSX.Element {
  const open = (): boolean => props.group.isOpen(props.meta.id);
  const pinned = (): boolean => props.group.isPinned(props.meta.id);
  const dragProps = (): Record<string, unknown> => props.group.reorderItemProps(props.meta.id);
  /**
   * The id is CAPTURED, not read through `props` on each call: `trackedRef`'s cleanup runs
   * during disposal, when `props.meta` is already undefined and would throw, taking every
   * later cleanup with it.
   */
  const panelId = props.meta.id;
  const registerHeaderEl = slotRef(props.group.activators, panelId);
  // The id is passed as an accessor: this button renders from a <For> over reactive metadata,
  // so a snapshot would bind the menu to the wrong panel.
  const menu = createPanelMenu(props.group, () => props.meta.id);
  // The menu is passed INTO the key handler rather than attached separately: one
  // element, one `onKeyDown`. See `createActivatorKeyDown`.
  const onKeyDown = createActivatorKeyDown(props.group, () => props.meta.id, {
    onMenu: (el) => menu.openAtElement(el),
  });

  return (
    <>
    <button
      {...dragProps()}
      {...props.autoHide.activatorHoverProps(props.meta.id)}
      {...menu.triggerProps}
      {...{ [RAIL_ITEM_ATTR]: props.meta.id }}
      data-flyout={flyoutDataAttr(props.autoHide.isFlyout(props.meta.id))}
      ref={(el) => {
        // `trackedRef`, NOT a bare `setHeaderEl(id, el)`: this button unmounts whenever the rail
        // overflows, and the panel is not unregistered by that, so nothing else would clear the entry.
        registerHeaderEl(el);
        // The reorder primitive registers its own node via `itemProps.ref`; Solid lets the later
        // `ref` win, so it is called through explicitly rather than silently dropped.
        const viaDrag = dragProps().ref as ((e: HTMLElement) => void) | undefined;
        viaDrag?.(el);
      }}
      type="button"
      class={`acc-rail-btn ${props.meta.railClass() ?? ''}`.trim()}
      role="tab"
      tabIndex={props.tabStop() ? 0 : -1}
      onFocus={() => props.onTabFocus()}
      title={props.meta.tooltip()}
      /* The other half of the tab/tabpanel pattern — see `PanelMeta.contentId`.
         A tab that controls nothing is a button wearing a role. */
      aria-controls={props.meta.contentId}
      aria-selected={open()}
      data-open={open() ? 'true' : 'false'}
      data-pinned={pinned() ? 'true' : 'false'}
      style={props.meta.accent() !== undefined ? { '--acc-accent': props.meta.accent() } : undefined}
      onClick={() => props.group.toggle(props.meta.id)}
      onKeyDown={onKeyDown}
    >
      <Show when={pinned()}>
        <span class="acc-rail-pin" aria-hidden="true">
          <Pin />
        </span>
      </Show>
      <Show when={props.meta.icon()}>
        <span class="acc-rail-icon">{props.meta.icon()}</span>
      </Show>
      <span class="acc-rail-label">{props.meta.railLabel() ?? props.meta.title()}</span>
      <Show when={props.meta.count() !== undefined}>
        <span class="acc-rail-count">{props.meta.count()}</span>
      </Show>
      <Show when={props.meta.badge()}>
        <span class="acc-badge" data-badge={props.meta.badge()} aria-hidden="true" />
      </Show>
    </button>
    {menu.element}
    </>
  );
}
