/**
 * Two pointer-gesture helpers the RAIL PAN owns. Vendored from `@cujuju/solid-reorder-list`,
 * which does not export them. See DESIGN_NOTES.md § src/gesture.ts:1.
 */

/**
 * Block the next document-level click after a drag commits, so it cannot trigger handlers
 * underneath the dragged item. A rAF safety net removes the handler if no click arrives.
 */
export function blockNextClick(): void {
  const eatClick = (e: Event) => {
    e.stopPropagation();
    e.preventDefault();
  };
  document.addEventListener('click', eatClick, { capture: true, once: true });
  requestAnimationFrame(() => {
    document.removeEventListener('click', eatClick, { capture: true });
  });
}

export interface CancelListeners {
  /** Attach Esc / window-blur / contextmenu cancellation listeners. */
  add(): void;
  /** Detach all cancellation listeners. */
  remove(): void;
}

/**
 * Attach/detach pair for drag-cancellation listeners: Esc, window blur and contextmenu all
 * invoke `onCancel`. Both are idempotent at the document level.
 */
export function createCancelListeners(opts: { onCancel: () => void }): CancelListeners {
  const onEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') opts.onCancel();
  };
  const onBlur = () => opts.onCancel();
  const onContextMenu = () => opts.onCancel();

  return {
    add() {
      document.addEventListener('keydown', onEscape);
      document.addEventListener('contextmenu', onContextMenu);
      window.addEventListener('blur', onBlur);
    },
    remove() {
      document.removeEventListener('keydown', onEscape);
      document.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('blur', onBlur);
    },
  };
}
