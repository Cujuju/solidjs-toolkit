import { createSignal, createEffect, type Accessor } from 'solid-js';

export interface UseCollapsibleOptions {
  /** Key for localStorage persistence. If omitted, state is ephemeral. */
  storageKey?: string;
  /** Prefix prepended to `storageKey`. Default empty — consumer controls the namespace. */
  storageKeyPrefix?: string;
  /** Initial value when no persisted state exists. Default true. */
  defaultOpen?: boolean;
  /**
   * Accessor for external override (e.g. expand-all/collapse-all). When non-null/undefined,
   * this value wins UNTIL the user manually toggles AFTER the override is set. Once the
   * user toggles, their choice sticks until `forceOpen` transitions to a NEW value.
   */
  forceOpen?: Accessor<boolean | null | undefined>;
  /** Called whenever the effective open state changes. */
  onChange?: (open: boolean) => void;
}

export interface UseCollapsibleReturn {
  /** Effective open state — respects forceOpen + manual override semantics. */
  open: Accessor<boolean>;
  toggle: () => void;
  setOpen: (v: boolean) => void;
  /** True once the user has manually toggled while a forceOpen was active. */
  manuallyToggled: Accessor<boolean>;
  /** Clear manuallyToggled — the next forceOpen value takes effect immediately. */
  reset: () => void;
}

/**
 * Hook for collapsible state with persistence + forceOpen override.
 *
 * Semantics of forceOpen:
 *  - When `forceOpen` returns a boolean, it overrides the local state.
 *  - If the user toggles AFTER a forceOpen is active, their choice sticks and
 *    `manuallyToggled` becomes true.
 *  - manuallyToggled resets to false on the next forceOpen EDGE (i.e., when its
 *    value changes to something different — not just re-asserted as the same value).
 */
export function useCollapsible(options: UseCollapsibleOptions = {}): UseCollapsibleReturn {
  const prefix = options.storageKeyPrefix ?? '';
  const fullKey = options.storageKey !== undefined ? `${prefix}${options.storageKey}` : null;
  const defaultOpen = options.defaultOpen ?? true;

  const readInitial = (): boolean => {
    if (fullKey === null) return defaultOpen;
    try {
      const raw = localStorage.getItem(fullKey);
      if (raw === null) return defaultOpen;
      return raw !== 'false';
    } catch {
      return defaultOpen;
    }
  };

  const [localOpen, setLocalOpen] = createSignal<boolean>(readInitial());
  const [manuallyToggled, setManuallyToggled] = createSignal(false);

  const persist = (v: boolean): void => {
    if (fullKey === null) return;
    try {
      localStorage.setItem(fullKey, String(v));
    } catch {
      // silent
    }
  };

  // Watch forceOpen — reset manuallyToggled on value change.
  let prevForceOpen: boolean | null | undefined = undefined;
  let firstRun = true;
  createEffect(() => {
    const fo = options.forceOpen?.();
    if (firstRun) {
      firstRun = false;
      prevForceOpen = fo;
      return;
    }
    if (fo !== prevForceOpen) {
      prevForceOpen = fo;
      setManuallyToggled(false);
      if (fo !== null && fo !== undefined) {
        setLocalOpen(fo);
        persist(fo);
        options.onChange?.(fo);
      }
    }
  });

  const effectiveOpen = (): boolean => {
    const fo = options.forceOpen?.();
    if (fo !== null && fo !== undefined && !manuallyToggled()) return fo;
    return localOpen();
  };

  const toggle = (): void => {
    const next = !effectiveOpen();
    setLocalOpen(next);
    setManuallyToggled(true);
    persist(next);
    options.onChange?.(next);
  };

  const setOpen = (v: boolean): void => {
    setLocalOpen(v);
    setManuallyToggled(true);
    persist(v);
    options.onChange?.(v);
  };

  const reset = (): void => {
    setManuallyToggled(false);
  };

  return {
    open: effectiveOpen,
    toggle,
    setOpen,
    manuallyToggled,
    reset,
  };
}
