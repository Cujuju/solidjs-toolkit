import { createAfterPaint } from '@cujuju/solidjs-hooks';
import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  type JSX,
} from 'solid-js';
import type { AccordionPanelProps } from './AccordionPanel.types';
import { seedDefaultSize } from './contentSize';
import { slotRef, type AccordionGroupApi } from './context';
import { createActivatorKeyDown } from './keys';
import { createPanelMenu } from './panelMenu';
import { columnFlex } from './resize';

export function createPanelState(deps: {
  contentId: string;
  group: AccordionGroupApi;
  props: AccordionPanelProps;
}) {
  const { contentId, group, props } = deps;
  const open = (): boolean => group.isOpen(props.id);
  const pinned = (): boolean => group.isPinned(props.id);
  const pinnable = (): boolean => props.pinnable ?? true;
  const horizontal = (): boolean => group.orientation() === 'horizontal';
  const closable = (): boolean => props.closable ?? horizontal();

  /**
   * See `slotRef`: filling a slot and emptying it are one decision. The id is captured, not
   * read at cleanup time — a cleanup that reads reactive state can throw.
   */
  const panelId = props.id;
  const registerHeaderEl = slotRef(group.activators, panelId);
  const registerPanelEl = slotRef(group.panelElements, panelId);
  /** This panel's own column element. The group's `panelElements` map is non-reactive, and a
   *  size seeded on arrival needs to KNOW when it arrives. */
  const [panelEl, setPanelEl] = createSignal<HTMLElement | undefined>();
  /** The column title bar's activator. A signal, not a `slotRef`: whether it claims the slot is
   *  reactive, and a ref runs once. */
  const [colBarEl, setColBarEl] = createSignal<HTMLElement | undefined>();

  /** Holds the activator slot only while no rail button exists. Released through the identity-guarded `clear`, so it never deletes the rail button's entry. */
  createEffect(() => {
    const el = colBarEl();
    if (el === undefined || group.showsRailButton(panelId)) return;
    group.activators.set(panelId, el);
    onCleanup(() => {
      group.activators.clear(panelId, el);
    });
  });
  const afterPaint = createAfterPaint();
  /** One menu instance per panel, attached to whichever chrome this orientation
   *  renders — the header row (vertical) or the column title bar (horizontal). */
  const menu = createPanelMenu(group, () => props.id);
  // One `onKeyDown` per element, so the menu binding lives inside the activator's
  // key handler rather than competing with it — see `createActivatorKeyDown`.
  const onKeyDown = createActivatorKeyDown(group, () => props.id, {
    onMenu: (el) => menu.openAtElement(el),
  });
  /**
   * The drag ITEM is the whole panel; the header is only the HANDLE. See DESIGN_NOTES.md
   * § src/AccordionPanel.tsx:169.
   */
  const dragItem = (): Record<string, unknown> =>
    horizontal() ? group.reorderColumnProps(props.id) : group.reorderItemProps(props.id);

  /** Just the gesture starter, for the handle element. */
  const dragHandle = (): Record<string, unknown> => {
    const onPointerDown = dragItem().onPointerDown;
    return onPointerDown === undefined ? {} : { onPointerDown };
  };

  /** Ref + drag classes + the engine's id attribute, for the panel element. */
  const dragItemAttrs = (): Record<string, unknown> => {
    const { ref: _ref, onPointerDown: _down, ...rest } = dragItem();
    return rest;
  };

  /** The panel's own inline content box — the default Portal target. */
  const [inlineHost, setInlineHost] = createSignal<HTMLElement | undefined>();

  /** Flyout host wins when the panel is an overlay; otherwise the content lives in
   *  its column. Undefined only until the inline host's ref has fired. */
  /** Mount precedence: a popup WINDOW outranks a flyout outranks the column. See DESIGN_NOTES.md § src/AccordionPanel.tsx:201. */
  const contentMount = (): HTMLElement | undefined =>
    group.tearOffMountFor(props.id) ?? group.flyoutMountFor(props.id) ?? inlineHost();

  /**
   * Portal calls this with every container it creates, so it is where the container's box
   * learns where it landed: the window's content area, or nothing at all.
   */
  const decorateContainer = (container: HTMLElement): void => {
    if (group.isTornOff(props.id)) {
      container.style.display = 'flex';
      container.style.flexDirection = 'column';
      container.style.flex = '1 1 auto';
      container.style.minHeight = '0';
      return;
    }
    container.style.display = 'contents';
  };

  /** Latches once the panel has ever been open — the gate for `lazyMount`. */
  const everOpen = createMemo<boolean>((prev) => prev || open(), false);
  const shouldRender = (): boolean => (props.lazyMount ? everOpen() : true);

  onMount(() => {
    group.register(
      {
        id: props.id,
        // Accessors, not values — the group renders these on the rail in
        // `horizontal`, and a snapshot would freeze a live count.
        title: () => props.title,
        railLabel: () => props.railLabel,
        count: () => props.count,
        badge: () => props.badge,
        // A factory, not a value: each caller (header, rail, flyout) builds its own copy.
        icon: () => props.icon,
        tooltip: () => props.tooltip,
        accent: () => props.accent,
        pinnable,
        closable,
        minSize: () => props.minSize,
        grow: () => props.grow ?? false,
        railClass: () => props.railClass,
        contentId,
        isLeaf: false,
      },
      props.defaultOpen ?? false,
    );
    seedDefaultSize({
      defaultSize: () => props.defaultSize,
      open,
      // The host, not the inline element: a panel whose first open is a FLYOUT has its children
      // there, so the empty inline host would measure as chrome width.
      host: contentMount,
      panel: panelEl,
      sizeOf: () => group.sizeOf(props.id),
      setSize: (px) => group.setSize(props.id, px),
      orientation: group.orientation,
      afterPaint,
    });
  });
  onCleanup(() => {
    group.unregister(props.id);
  });

  /**
   * Explicit size wins over the mode's automatic sizing, for THIS panel only —
   * a group can hold a user-dragged column next to an auto-sized one.
   */
  const sizeStyle = (): JSX.CSSProperties => {
    // A flying-out shell is out of the layout: inline flex would beat `autoHide.css` and grow it.
    if (!open() || group.isFlyout(props.id)) return {};
    return columnFlex({
      sizePx: group.sizeOf(props.id),
      fill: group.mode() === 'fill',
      trailing: group.neighborOpenId(props.id) === undefined,
      declaresGrow: props.grow ?? false,
      groupHasDeclaredGrower: group.hasDeclaredGrower(),
      shrinkToContent: props.shrinkToContent ?? false,
      axis: group.orientation() === 'horizontal' ? 'width' : 'height',
    });
  };

  return {
    open,
    pinned,
    pinnable,
    horizontal,
    closable,
    panelId,
    registerHeaderEl,
    registerPanelEl,
    panelEl,
    setPanelEl,
    colBarEl,
    setColBarEl,
    afterPaint,
    menu,
    onKeyDown,
    dragItem,
    dragHandle,
    dragItemAttrs,
    inlineHost,
    setInlineHost,
    contentMount,
    decorateContainer,
    everOpen,
    shouldRender,
    sizeStyle,
  };
}
