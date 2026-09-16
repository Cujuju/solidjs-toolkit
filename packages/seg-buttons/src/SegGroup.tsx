import { createContext, createMemo, createSignal, useContext, type JSX } from 'solid-js';

/** A mounted SegButton, as the group sees it when choosing the radiogroup's tab stop. */
export interface SegGroupEntry {
  active: () => boolean;
  disabled: () => boolean;
  el: () => HTMLElement | undefined;
}

// Context carries the controlled-mode value + onChange to SegButton children.
// Generic is erased via `unknown`; SegButton narrows on read.
interface SegGroupContextValue {
  value: unknown;
  onChange: (value: unknown) => void;
  role: 'group' | 'radiogroup';
  // Reactive getters on ONE stable object: Solid's Provider reads its `value` once, untracked.
  controlled: boolean;
  tabbable: SegGroupEntry | undefined;
  register: (entry: SegGroupEntry) => () => void;
}

export const SegGroupContext = createContext<SegGroupContextValue | null>(null);

export function useSegGroupContext(): SegGroupContextValue | null {
  return useContext(SegGroupContext);
}

export interface SegGroupProps<T = string> {
  children: JSX.Element;

  // Controlled mode: when `value` is set, SegButtons read state from context
  // and call onChange on click. When unset, SegButtons use their own
  // `active` / `onClick` props (uncontrolled).
  value?: T;
  onChange?: (value: T) => void;

  role?: 'group' | 'radiogroup';
  ariaLabel?: string;

  class?: string;
}

/** Segmented button group wrapper. Connects adjacent `<SegButton>` children. */
export function SegGroup<T = string>(props: SegGroupProps<T>): JSX.Element {
  const role = (): 'group' | 'radiogroup' => props.role ?? 'group';
  const controlled = (): boolean => props.value !== undefined;

  const [entries, setEntries] = createSignal<SegGroupEntry[]>([]);
  // APG radio group: the checked option is the tab stop, else the first enabled one. Never none while any option is enabled.
  const tabbable = createMemo(() => {
    const enabled = entries().filter((e) => !e.disabled());
    return enabled.find((e) => e.active()) ?? enabled[0];
  });

  const ctx: SegGroupContextValue = {
    get value() {
      return props.value;
    },
    onChange: (v) => {
      (props.onChange as ((value: unknown) => void) | undefined)?.(v);
    },
    get role() {
      return role();
    },
    get controlled() {
      return controlled();
    },
    get tabbable() {
      return tabbable();
    },
    register: (entry) => {
      // Kept in DOM order (entries register on mount, so their elements are connected).
      setEntries((list) => {
        const el = entry.el();
        const at = list.findIndex((other) => {
          const otherEl = other.el();
          return (
            !!el &&
            !!otherEl &&
            (el.compareDocumentPosition(otherEl) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
          );
        });
        return at < 0 ? [...list, entry] : [...list.slice(0, at), entry, ...list.slice(at)];
      });
      return () => setEntries((list) => list.filter((other) => other !== entry));
    },
  };

  // Always provide the same object; `controlled` on it decides the mode reactively.
  // In uncontrolled mode, the span still renders but SegButtons ignore the context.
  return (
    <SegGroupContext.Provider value={ctx}>
      <span
        class={`csb-group ${props.class ?? ''}`.trim()}
        role={role()}
        aria-label={props.ariaLabel}
      >
        {props.children}
      </span>
    </SegGroupContext.Provider>
  );
}
