/**
 * The flex declaration for ONE open member — panels and leaves alike. In `fill`, a declared
 * `grow` absorbs the remainder. See DESIGN_NOTES.md § src/resize.ts:76.
 */
export function columnFlex(opts: {
  /** The panel's explicit size, or `undefined` while it follows the mode. */
  sizePx: number | undefined;
  /** `fill` mode — the only mode that owes the group's whole extent to its members. */
  fill: boolean;
  /** True when no open member follows this one in visual order. */
  trailing: boolean;
  /** This member declares itself the absorber of the group's leftover space. */
  declaresGrow: boolean;
  /** Any OPEN member declares it — which retires the trailing default, including for members
   *  that declare nothing. */
  groupHasDeclaredGrower: boolean;
  /** This member is its CONTENT's size, with `sizePx` as a ceiling it scrolls past. */
  shrinkToContent: boolean;
  /** The group's growth axis, so a ceiling is applied to the dimension the dock
   *  actually sizes along. */
  axis: 'width' | 'height';
}): { flex: string; maxWidth?: string; maxHeight?: string } | Record<string, never> {
  if (opts.shrinkToContent) {
    // `0 1 auto`: never grow past the content, shrink if the group cannot hold every member,
    // and take the content as the basis.
    const flex = { flex: '0 1 auto' };
    if (opts.sizePx === undefined) return flex;
    return opts.axis === 'width'
      ? { ...flex, maxWidth: `${opts.sizePx}px` }
      : { ...flex, maxHeight: `${opts.sizePx}px` };
  }

  const grows =
    opts.fill && (opts.declaresGrow || (!opts.groupHasDeclaredGrower && opts.trailing));

  if (opts.sizePx === undefined) {
    /* No explicit size. See DESIGN_NOTES.md § src/resize.ts:185. */
    if (opts.fill && opts.groupHasDeclaredGrower && !opts.declaresGrow) {
      return { flex: '0 0 auto' };
    }
    return {};
  }
  return { flex: grows ? `1 1 ${opts.sizePx}px` : `0 0 ${opts.sizePx}px` };
}
