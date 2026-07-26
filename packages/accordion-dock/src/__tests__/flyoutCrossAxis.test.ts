import { describe, expect, it } from 'vitest';
import { flyoutCrossAxis, FLYOUT_DEFAULT_WIDTH_PX } from '../autoHide';

/**
 * A FLYOUT MUST NEVER BE THE REASON ITS OWN CONTENT CLIPS.
 *
 * A docked section is as wide as the user's layout allows and may scroll; a
 * flyout is an overlay with the whole window to spend. The bug these pin: a
 * vertical flyout took the GROUP's width, so a 10-row symbol list opening out of
 * a narrow sidebar was rendered at the sidebar's width and every P/L value in it
 * was cut off behind a horizontal scrollbar.
 *
 * WHAT IS NOT COVERED HERE: the ceiling itself. It lives in `autoHide.css` as
 * `--acc-flyout-max-width`, and jsdom applies no stylesheet, so asserting it here
 * would test nothing. What IS covered is the half that decides whether the token
 * gets a chance to apply at all — vertical must NOT write an inline max-width,
 * horizontal must write `none`.
 */

/** A deliberately narrow group — the sidebar case that produced the bug. */
const NARROW_GROUP_PX = 190;
/** A column width a user dragged, wider than the default. */
const DRAGGED_COLUMN_PX = 420;

describe('flyoutCrossAxis — vertical sizes to CONTENT', () => {
  it('asks for the content width rather than the group width', () => {
    const { width } = flyoutCrossAxis({
      orientation: 'vertical',
      panelSizePx: undefined,
      groupWidthPx: NARROW_GROUP_PX,
    });
    // The whole fix: NOT `${NARROW_GROUP_PX}px`.
    expect(width).toBe('max-content');
  });

  it('floors at the anchor width, so opening never looks like shrinking', () => {
    const { minWidth } = flyoutCrossAxis({
      orientation: 'vertical',
      panelSizePx: undefined,
      groupWidthPx: NARROW_GROUP_PX,
    });
    expect(minWidth).toBe(`${NARROW_GROUP_PX}px`);
  });

  it('leaves max-width unset so the stylesheet ceiling applies', () => {
    /* Writing it inline would out-rank a consumer restating the token, which is
       the whole reason the ceiling lives in CSS rather than here. */
    const result = flyoutCrossAxis({
      orientation: 'vertical',
      panelSizePx: undefined,
      groupWidthPx: NARROW_GROUP_PX,
    });
    expect(result.maxWidth).toBeUndefined();
  });

  it('ignores the panel size, which on this axis is a HEIGHT', () => {
    // Feeding a vertical panel's stored size in as a width is how a 210px-tall
    // panel would come out 210px wide by coincidence of sharing one number.
    const { width, minWidth } = flyoutCrossAxis({
      orientation: 'vertical',
      panelSizePx: 210,
      groupWidthPx: NARROW_GROUP_PX,
    });
    expect(width).toBe('max-content');
    expect(minWidth).toBe(`${NARROW_GROUP_PX}px`);
  });

  it('falls back to the default floor when the group cannot be measured', () => {
    const { minWidth } = flyoutCrossAxis({
      orientation: 'vertical',
      panelSizePx: undefined,
      groupWidthPx: 0,
    });
    expect(minWidth).toBe(`${FLYOUT_DEFAULT_WIDTH_PX}px`);
  });
});

describe('flyoutCrossAxis — horizontal preserves the user’s width', () => {
  it('uses the panel’s own dragged width exactly, so pinning does not resize', () => {
    const { width, minWidth } = flyoutCrossAxis({
      orientation: 'horizontal',
      panelSizePx: DRAGGED_COLUMN_PX,
      groupWidthPx: 1200,
    });
    expect(width).toBe(`${DRAGGED_COLUMN_PX}px`);
    expect(minWidth).toBe(`${DRAGGED_COLUMN_PX}px`);
  });

  it('opts OUT of the ceiling, which would cap a width the user chose', () => {
    /* A horizontal flyout's width already fits in the dock, so it cannot overflow
       the viewport and needs no cap — while a cap below the column's width would
       make pinning visibly resize it. */
    const { maxWidth } = flyoutCrossAxis({
      orientation: 'horizontal',
      panelSizePx: DRAGGED_COLUMN_PX,
      groupWidthPx: 1200,
    });
    expect(maxWidth).toBe('none');
  });

  it('falls back to the default width when the panel has never been dragged', () => {
    const { width } = flyoutCrossAxis({
      orientation: 'horizontal',
      panelSizePx: undefined,
      groupWidthPx: 1200,
    });
    expect(width).toBe(`${FLYOUT_DEFAULT_WIDTH_PX}px`);
  });
});
