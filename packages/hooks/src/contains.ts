import { type Accessor } from 'solid-js';

/**
 * "Is inside" predicate from element refs, e.g. `contains(() => [buttonEl, panelEl])`. Re-reads
 * refs per call, so late-mounting refs work; null entries count as outside.
 */
export function contains(
  refs:
    | Accessor<HTMLElement | null | undefined>
    | Accessor<readonly (HTMLElement | null | undefined)[]>,
): (target: Node) => boolean {
  return (target: Node): boolean => {
    const r = refs();
    if (!r) return false;
    if (Array.isArray(r)) {
      for (const el of r) {
        if (el && el.contains(target)) return true;
      }
      return false;
    }
    return (r as HTMLElement).contains(target);
  };
}
