/**
 * Returns an element's layout border-box dimensions (unscaled by CSS transforms).
 *
 * CRITICAL: use THIS for SIZING child elements. Use `getBoundingClientRect`
 * only for POSITIONING (it reflects transforms, which is what you want when
 * placing an absolute child relative to a transformed ancestor — but feeding
 * post-transform dimensions back into a child that ALSO inherits the
 * transform double-applies the transform).
 *
 * Observed footgun: host button with `:active { transform: scale(0.95) }` +
 * a descendant absolute-positioned SVG sized from the button's BCR → the
 * SVG gets sized to the scaled dims, then the parent's transform scales
 * the SVG again, producing a visibly-smaller-than-expected render.
 */
export function measureLayoutBox(el: HTMLElement): { w: number; h: number } {
  return { w: el.offsetWidth, h: el.offsetHeight };
}
