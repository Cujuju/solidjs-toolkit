import { createContext, useContext, type JSX } from 'solid-js';

// Context carries the controlled-mode value + onChange to SegButton children.
// Generic is erased via `unknown`; SegButton narrows on read.
interface SegGroupContextValue {
  value: unknown;
  onChange: (value: unknown) => void;
  role: 'group' | 'radiogroup';
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

  // A11y:
  role?: 'group' | 'radiogroup';
  ariaLabel?: string;

  class?: string;
}

/** Segmented button group wrapper. Connects adjacent `<SegButton>` children. */
export function SegGroup<T = string>(props: SegGroupProps<T>): JSX.Element {
  const role = (): 'group' | 'radiogroup' => props.role ?? 'group';
  const controlled = (): boolean => props.value !== undefined;

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
  };

  // Conditionally wrap with provider only in controlled mode.
  // In uncontrolled mode, the span still renders but context is unused.
  return (
    <SegGroupContext.Provider value={controlled() ? ctx : null}>
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
