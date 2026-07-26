import type { AccordionGroupApi } from './context';

/**
 * Roving keyboard nav for a panel's activator — the stacked header in `vertical`,
 * the rail button in `horizontal`. ONE implementation for both, because the two
 * activators are the same control wearing different chrome, and letting them drift
 * is how you end up with a dock where Home works on one axis only.
 *
 * Arrow keys are what make a stack of headers feel like ONE control rather than N
 * buttons that happen to be adjacent: without them, traversing a 6-panel dock costs
 * 6 tabs and drops you into the content between each.
 *
 * The nav axis is ALWAYS the axis the activators are stacked along — which is
 * vertical in both orientations (headers stack down; rail buttons stack down). So
 * Up/Down always moves between panels, and Left/Right always means collapse/expand.
 */
export function createActivatorKeyDown(
  group: AccordionGroupApi,
  id: () => string,
  options?: {
    /**
     * Open the panel's context menu, anchored to the activator.
     *
     * Handled HERE rather than as a second `onKeyDown` from `createPanelMenu`
     * because an element has exactly one `onKeyDown` in JSX: a menu that supplied
     * its own would be silently overwritten by this one, or overwrite it,
     * depending on spread order. `createPanelMenu` already keeps `triggerProps`
     * down to `onContextMenu` for the same reason, and this is the other half of
     * that decision.
     */
    onMenu?: (activator: HTMLElement) => void;
  },
): (e: KeyboardEvent) => void {
  return (e: KeyboardEvent): void => {
    /*
     * Shift+F10 and the dedicated ContextMenu key, handled EXPLICITLY.
     *
     * Not because the menu was unreachable — a review claim that turned out to be
     * wrong. Chromium and Firefox synthesise a `contextmenu` EVENT for both keys,
     * which the activator's existing `onContextMenu` already caught; verified by
     * disabling this branch and watching the browser tests still pass.
     *
     * It is kept because that synthesis is a platform courtesy rather than a
     * guarantee — macOS has no ContextMenu key at all and Shift+F10 is not a Safari
     * binding — and because a synthesised event carries whatever coordinates the
     * browser picks, while `openAtElement` anchors the menu to the activator. So
     * this makes a behaviour that happens to work everywhere we tested into one
     * that is specified.
     */
    if (options?.onMenu !== undefined && (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10'))) {
      const activator = e.currentTarget;
      if (activator instanceof HTMLElement) {
        options.onMenu(activator);
        e.preventDefault();
        return;
      }
    }
    // Alt+Up/Down REORDERS instead of navigating. Drag-to-reorder that has no
    // keyboard equivalent is an accessibility hole, not a missing nicety: a
    // pointer-only affordance makes the feature unreachable rather than awkward.
    if (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      if (!group.reorderable()) return;
      group.moveBy(id(), e.key === 'ArrowDown' ? 1 : -1);
      e.preventDefault();
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        group.moveFocus(id(), 1);
        break;
      case 'ArrowUp':
        group.moveFocus(id(), -1);
        break;
      case 'Home':
        group.moveFocus(id(), 'first');
        break;
      case 'End':
        group.moveFocus(id(), 'last');
        break;
      case 'ArrowRight':
        if (group.isOpen(id())) return;
        group.setOpen(id(), true);
        break;
      case 'ArrowLeft':
        if (!group.isOpen(id())) return;
        group.setOpen(id(), false);
        break;
      default:
        return;
    }
    e.preventDefault();
  };
}
