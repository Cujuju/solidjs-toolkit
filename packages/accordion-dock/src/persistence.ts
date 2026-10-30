import { ACCORDION_LAYOUT_VERSION, type AccordionLayout } from './context';

/**
 * What goes to localStorage. `AccordionLayout` itself rather than a parallel shape: a saved
 * workspace and an auto-persisted session are the same data, so there is one migration story.
 */
export type PersistedState = AccordionLayout;

/**
 * Read a persisted layout, or null. VERSION-GATED like `setLayout`, because this runs on every
 * page load. See DESIGN_NOTES.md § src/AccordionGroup.tsx:191.
 */
export function readPersisted(key: string | undefined): PersistedState | null {
  if (key === undefined) return null;
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const p = parsed as Partial<PersistedState>;
    if (p.version !== ACCORDION_LAYOUT_VERSION) return null;
    const strings = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
    const sizes: Record<string, number> = {};
    if (typeof p.sizes === 'object' && p.sizes !== null) {
      for (const [k, v] of Object.entries(p.sizes)) {
        if (typeof v === 'number' && Number.isFinite(v)) sizes[k] = v;
      }
    }
    return {
      version: ACCORDION_LAYOUT_VERSION,
      open: strings(p.open),
      pinned: strings(p.pinned),
      order: strings(p.order),
      sizes,
    };
  } catch {
    // A corrupt/blocked localStorage must not take the panel group down.
    return null;
  }
}

/** Store a layout under `key`. Silent on failure: persistence is a nicety, never a hard dependency. */
export function writePersisted(key: string, state: PersistedState): void {
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // Quota, private mode or a blocked storage: keep running without it.
  }
}
