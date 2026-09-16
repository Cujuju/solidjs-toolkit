import { describe, it, expect } from 'vitest';
import { columnFlex } from '../resize';

/**
 * WHO ABSORBS THE GROUP'S LEFTOVER EXTENT. Three answers pinned: trailing by default, declared
 * wins, several SHARE. See DESIGN_NOTES.md § src/__tests__/columnFlex.test.ts:4.
 */

/** Sizes are arbitrary but distinct, so a wrong branch shows up as a wrong number
 *  rather than coincidentally matching the right one. */
const SIZE_A = 120;
const SIZE_B = 240;

describe('columnFlex — the default: trailing grows when nobody declares', () => {
  it('grows the trailing member and fixes the rest', () => {
    const lead = columnFlex({
      sizePx: SIZE_A,
      fill: true,
      trailing: false,
      declaresGrow: false,
      groupHasDeclaredGrower: false,
      shrinkToContent: false,
      axis: 'height',
    });
    const last = columnFlex({
      sizePx: SIZE_B,
      fill: true,
      trailing: true,
      declaresGrow: false,
      groupHasDeclaredGrower: false,
      shrinkToContent: false,
      axis: 'height',
    });

    expect(lead).toEqual({ flex: `0 0 ${SIZE_A}px` });
    expect(last).toEqual({ flex: `1 1 ${SIZE_B}px` });
  });

  it('emits nothing for an unsized member, leaving the stylesheet in charge', () => {
    // The absence of an inline `flex` IS the contract here: `fill`'s stylesheet
    // rule already sizes an unsized member, and out-specifying it would change
    // every existing consumer's layout for no gain.
    expect(
      columnFlex({
        sizePx: undefined,
        fill: true,
        trailing: true,
        declaresGrow: false,
        groupHasDeclaredGrower: false,
        shrinkToContent: false,
        axis: 'height',
      }),
    ).toEqual({});
  });

  it('never grows anything outside fill mode', () => {
    expect(
      columnFlex({
        sizePx: SIZE_A,
        fill: false,
        trailing: true,
        declaresGrow: true,
        groupHasDeclaredGrower: true,
        shrinkToContent: false,
        axis: 'height',
      }),
    ).toEqual({ flex: `0 0 ${SIZE_A}px` });
  });
});

describe('columnFlex — a declaration beats the trailing default', () => {
  it('grows the declared member', () => {
    expect(
      columnFlex({
        sizePx: SIZE_A,
        fill: true,
        trailing: false,
        declaresGrow: true,
        groupHasDeclaredGrower: true,
        shrinkToContent: false,
        axis: 'height',
      }),
    ).toEqual({ flex: `1 1 ${SIZE_A}px` });
  });

  it('stops the TRAILING member growing once someone else has declared', () => {
    // The regression this exists for: the trailing member kept its growth and
    // competed with the declared one, so the surplus went to both and the
    // declaration achieved nothing.
    expect(
      columnFlex({
        sizePx: SIZE_B,
        fill: true,
        trailing: true,
        declaresGrow: false,
        groupHasDeclaredGrower: true,
        shrinkToContent: false,
        axis: 'height',
      }),
    ).toEqual({ flex: `0 0 ${SIZE_B}px` });
  });

  it('pins an UNSIZED non-grower to its content size when a grower exists', () => {
    /* Subtle and load-bearing: `fill`'s rule is `flex: 1 1 0`, i.e. "grow". An unsized
           non-grower left to the stylesheet would compete for the surplus, so it is pinned inline. */
    expect(
      columnFlex({
        sizePx: undefined,
        fill: true,
        trailing: false,
        declaresGrow: false,
        groupHasDeclaredGrower: true,
        shrinkToContent: false,
        axis: 'height',
      }),
    ).toEqual({ flex: '0 0 auto' });
  });

  it('leaves an unsized DECLARED grower to the stylesheet, which already grows it', () => {
    expect(
      columnFlex({
        sizePx: undefined,
        fill: true,
        trailing: false,
        declaresGrow: true,
        groupHasDeclaredGrower: true,
        shrinkToContent: false,
        axis: 'height',
      }),
    ).toEqual({});
  });
});

describe('columnFlex — several declared growers share', () => {
  it('gives each an equal grow factor and its OWN basis', () => {
    /* Sharing, not splitting in half: equal `flex-grow` divides the SURPLUS evenly while
           each member starts from the size it measured, so different content heights stay different. */
    const first = columnFlex({
      sizePx: SIZE_A,
      fill: true,
      trailing: false,
      declaresGrow: true,
      groupHasDeclaredGrower: true,
      shrinkToContent: false,
      axis: 'height',
    });
    const second = columnFlex({
      sizePx: SIZE_B,
      fill: true,
      trailing: true,
      declaresGrow: true,
      groupHasDeclaredGrower: true,
      shrinkToContent: false,
      axis: 'height',
    });

    expect(first).toEqual({ flex: `1 1 ${SIZE_A}px` });
    expect(second).toEqual({ flex: `1 1 ${SIZE_B}px` });
  });
});

describe('columnFlex — shrinkToContent: the size is a CEILING, not an extent', () => {
  it('is content-sized with no ceiling when nothing has been saved', () => {
    /* The unsized case the sidebar ships in: no `defaultSize`, so the section is as tall as
           its rows until a drag sets a ceiling. Hence `0 1 auto`. */
    expect(
      columnFlex({
        sizePx: undefined,
        fill: true,
        trailing: false,
        declaresGrow: false,
        groupHasDeclaredGrower: false,
        shrinkToContent: true,
        axis: 'height',
      }),
    ).toEqual({ flex: '0 1 auto' });
  });

  it('applies a saved size as a max on the growth axis', () => {
    expect(
      columnFlex({
        sizePx: SIZE_A,
        fill: true,
        trailing: false,
        declaresGrow: false,
        groupHasDeclaredGrower: false,
        shrinkToContent: true,
        axis: 'height',
      }),
    ).toEqual({ flex: '0 1 auto', maxHeight: `${SIZE_A}px` });
  });

  it('caps the WIDTH instead when the group grows horizontally', () => {
    // The ceiling has to land on the dimension the dock sizes along, or a
    // horizontal dock would cap a column's height and silently do nothing.
    expect(
      columnFlex({
        sizePx: SIZE_A,
        fill: true,
        trailing: false,
        declaresGrow: false,
        groupHasDeclaredGrower: false,
        shrinkToContent: true,
        axis: 'width',
      }),
    ).toEqual({ flex: '0 1 auto', maxWidth: `${SIZE_A}px` });
  });

  it('never grows, even as the trailing member with no declared grower', () => {
    // The trailing default would otherwise stretch a two-card section down a tall sidebar.
        // shrinkToContent has to beat it, or the declaration does nothing in the layout it exists for.
    expect(
      columnFlex({
        sizePx: SIZE_A,
        fill: true,
        trailing: true,
        declaresGrow: false,
        groupHasDeclaredGrower: false,
        shrinkToContent: true,
        axis: 'height',
      }),
    ).toEqual({ flex: '0 1 auto', maxHeight: `${SIZE_A}px` });
  });

  it('beats an explicit grow on the same member rather than blending them', () => {
    expect(
      columnFlex({
        sizePx: SIZE_A,
        fill: true,
        trailing: false,
        declaresGrow: true,
        groupHasDeclaredGrower: true,
        shrinkToContent: true,
        axis: 'height',
      }),
    ).toEqual({ flex: '0 1 auto', maxHeight: `${SIZE_A}px` });
  });
});
