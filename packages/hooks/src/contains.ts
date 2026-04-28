import { type Accessor } from 'solid-js';

/**
 * Builds an "is inside" predicate from one or more element refs.
 *
 * Single ref:
 *   `useClickOutside(contains(() => menuEl), close);`
 *
 * Multi-ref (button trigger + portaled panel, etc.):
 *   `useClickOutside(contains(() => [buttonEl, panelEl]), close);`
 *
 * Returns a stable function that re-reads the accessor on every call — so refs
 * that mount after this is created (e.g., a portaled panel) are picked up
 * automatically. Null/undefined entries are treated as "not inside" (no false positives).
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
