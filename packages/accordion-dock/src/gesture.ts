/**
 * Two pointer-gesture helpers the RAIL PAN owns.
 *
 * ── Why these are here and not imported ─────────────────────────────────────
 * They arrived as part of a vendored copy of `@cujuju/solid-reorder-list`, which
 * this package now depends on for real (see `AccordionGroup`). The reorder
 * primitive itself came back as the dependency; these two did NOT, because they
 * are not part of that library's public surface — its `index.ts` exports only
 * `createReorderList`, `createReorderGrid`, `DEFAULT_SKIP_SELECTOR` and their
 * types, and its `exports` map admits no subpath, so `.../src/shared` cannot be
 * deep-imported past it.
 *
 * So the choice was: reach around a package's declared API, or own the twenty
 * lines. Owning them is the smaller lie. They are consumed by `railPan.ts` — the
 * dock's OWN pan gesture, which is not a reorder and would need this behaviour
 * even if the reorder library did not exist.
 *
 * NOT a fork, and nothing here tracks upstream: if the library ever exports them,
 * delete this file and import them. Until then this is dock code.
 *
 * Original implementation © the `@cujuju/solid-reorder-list` author (same author
 * as this package), reused here with the same intent.
 */

/**
 * Block the next document-level click after a drag commits.
 *
 * Document-capture + once eats the click, rAF safety net removes the
 * handler if the click never fires. This prevents a post-drag click
 * from triggering button/link handlers underneath the dragged item.
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
 * Create attach/detach pair for drag-cancellation listeners.
 *
 * Esc keypress, window blur, and contextmenu all invoke `onCancel`.
 * The returned `add` and `remove` are idempotent at the document level
 * (the underlying handler identities are stable per factory call).
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
