import type { AccordionGroupApi } from './context';

/**
 * Roving keyboard nav for a panel's activator — one implementation for both orientations.
 * See DESIGN_NOTES.md § src/keys.ts:3.
 */
export function createActivatorKeyDown(
  group: AccordionGroupApi,
  id: () => string,
  options?: {
    /**
         * Open the panel's context menu, anchored to the activator. Handled here because an element
         * has exactly one `onKeyDown` in JSX, so a second would silently overwrite this.
         */
    onMenu?: (activator: HTMLElement) => void;
  },
): (e: KeyboardEvent) => void {
  return (e: KeyboardEvent): void => {
    /*
         * Shift+F10 and the ContextMenu key, handled EXPLICITLY: browser synthesis is a courtesy,
         * and `openAtElement` anchors deterministically. See DESIGN_NOTES.md § src/keys.ts:35.
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
