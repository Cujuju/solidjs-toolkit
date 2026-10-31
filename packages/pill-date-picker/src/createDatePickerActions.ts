import type { Setter } from 'solid-js';
import { isAnchorOutsideViewport, POPOUT_DEFAULT_GAP_PX, POPOUT_DEFAULT_PREFERENCE, resolvePopoutPosition, type PopoutPosition } from './_internal/popout';
import { NO_ACTIVE_INDEX, type createPillDateModel } from './createPillDateModel';
import type { PillDateEntry, PillDatePickerProps } from './types';

export function createDatePickerActions<T extends PillDateEntry>(
  props: PillDatePickerProps<T>,
  model: ReturnType<typeof createPillDateModel<T>>,
  refs: { readonly anchorEl: HTMLButtonElement | undefined; readonly panelEl: HTMLDivElement | undefined },
  setOpen: (next: boolean) => void,
  setPopout: Setter<PopoutPosition | null>,
) {
  const { activeIndex, activeKey, setActiveIndex, stateOf } = model;
  /**
   * Measure and place the panel; returns whether the anchor is in view. Re-runs on scroll and
   * resize — CAPTURING, since the scrolling ancestor is rarely `window`.
   */
  const place = (): boolean => {
    // No anchor to measure: report in-view, because "unknown" must never close the ladder.
    if (!refs.anchorEl) return true;
    const a = refs.anchorEl.getBoundingClientRect();
    // The LAYOUT viewport — the space the rects and `position: fixed` live in, excluding classic scrollbars.
    const viewport = {
      width: document.documentElement.clientWidth,
      height: document.documentElement.clientHeight,
    };
    // Hide, never close, here: `place` runs inside opening. Residual: only the viewport is checked, not clipping ancestors.
    if (isAnchorOutsideViewport(a, viewport)) {
      setPopout(null);
      return false;
    }
    if (!refs.panelEl) return true;
    const p = refs.panelEl.getBoundingClientRect();
    setPopout(
      resolvePopoutPosition(
        { top: a.top, left: a.left, width: a.width, height: a.height },
        { width: p.width, height: p.height },
        viewport,
        props.popoutGap ?? POPOUT_DEFAULT_GAP_PX,
        props.preferPlacement ?? POPOUT_DEFAULT_PREFERENCE,
      ),
    );
    return true;
  };

  /** The cursor key only while its row is rendered. */
  const activeRowKey = (): string | null => (activeIndex() === NO_ACTIVE_INDEX ? null : activeKey());

  const close = (refocus: boolean): void => {
    setOpen(false);
    setActiveIndex(NO_ACTIVE_INDEX);
    // Returning focus to the pill matters: without it, closing from the keyboard drops focus
    // onto <body> and the tab order restarts from the top of the document.
    if (refocus) refs.anchorEl?.focus();
  };

  /** Disabled items never reach `onChange`, whether invoked by a row click, custom renderer or keyboard commit. */
  const commit = (index: number): void => {
    // A control the caller disabled must not act, even with a panel already on screen — the rows
    // are portalled and still under the pointer.
    if (props.disabled) return;
    const item = props.items[index];
    if (!item) return;
    if (stateOf(item) === 'disabled') return;
    props.onChange(item);
    close(true);
  };

  return { place, close, commit, activeRowKey };
}
