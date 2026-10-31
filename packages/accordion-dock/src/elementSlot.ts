import { onCleanup } from 'solid-js';
/**
 * A place the dock keeps element references, keyed. Two methods rather than one setter, and
 * `clear` takes the ELEMENT — see `slotRef` for why that identity guard matters.
 */
export interface ElementSlot<T extends HTMLElement = HTMLElement> {
  set: (key: string, el: T) => void;
  /** Forget `key`, but ONLY if `el` is still what is stored there. */
  clear: (key: string, el: T) => void;
}

/**
 * A `ref` callback that fills a slot and empties it on unmount. An unguarded clear deletes the
 * LIVE replacement. See DESIGN_NOTES.md § src/context.ts:429.
 */
export function slotRef<T extends HTMLElement>(
  slot: ElementSlot<T>,
  key: string,
): (el: T) => void {
  return (el) => {
    slot.set(key, el);
    onCleanup(() => {
      /*
       * A throwing cleanup is not local: one exception abandons the whole walk. That once
       * orphaned popped-out windows. See DESIGN_NOTES.md § src/context.ts:465.
       */
      try {
        slot.clear(key, el);
      } catch (err) {
        // eslint-disable-next-line no-console -- silence here would trade a visible
        // error for an invisible resource leak elsewhere.
        console.error(
          "[accordion-dock] an element slot's clear() threw during teardown. The rest " +
            'of the teardown continued. clear() must not read reactive state — it is ' +
            'given the key and the element precisely so it does not have to.',
          err,
        );
      }
    });
  };
}

/** An `ElementSlot` over a plain `Map`, for references nothing renders from. */
export function createMapSlot<T extends HTMLElement>(
  map: Map<string, T>,
): ElementSlot<T> {
  return {
    set: (key, el) => {
      map.set(key, el);
    },
    clear: (key, el) => {
      // The identity guard from `slotRef`, in the one place a Map-backed slot needs
      // it. A bare `map.delete(key)` is the defect described there.
      if (map.get(key) === el) map.delete(key);
    },
  };
}

/** The single key `railOverflowSlot` is stored under — it holds one element, but wears the
 *  keyed shape so it can use `slotRef`. */
export const RAIL_OVERFLOW_SLOT_KEY = 'rail-overflow';
