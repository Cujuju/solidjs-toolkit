import { createSignal, createEffect, untrack, type Accessor } from 'solid-js';

export interface UseCollapsibleOptions {
  /** Key for localStorage persistence. If omitted, state is ephemeral. */
  storageKey?: string;
  /** Prefix prepended to `storageKey`. Default empty — consumer controls the namespace. */
  storageKeyPrefix?: string;
  /** Initial value when no persisted state exists. Default true. */
  defaultOpen?: boolean;
  /**
   * External override (e.g. expand-all). Wins until the user toggles; their choice sticks
   * until `forceOpen` changes to a NEW value.
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
 * Collapsible state with persistence and a `forceOpen` override; see that option for
 * manual-toggle semantics. `manuallyToggled` resets only when `forceOpen` changes value.
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

  const effectiveOpen = (): boolean => {
    const fo = options.forceOpen?.();
    if (fo !== null && fo !== undefined && !manuallyToggled()) return fo;
    return localOpen();
  };

  // onChange reports effective-state transitions; every writer notifies through here.
  let lastNotified = untrack(effectiveOpen);
  const notifyIfChanged = (): void => {
    const next = untrack(effectiveOpen);
    if (next === lastNotified) return;
    lastNotified = next;
    options.onChange?.(next);
  };

  // Watch forceOpen — reset manuallyToggled on value change.
  let prevForceOpen: boolean | null | undefined = undefined;
  let firstRun = true;
  createEffect(() => {
    const fo = options.forceOpen?.();
    if (firstRun) {
      firstRun = false;
      prevForceOpen = fo;
      // Re-seed: forceOpen may have changed between hook creation and this first run.
      // effectiveOpen/lastNotified are declared above: a synchronous first run must not hit the TDZ.
      lastNotified = untrack(effectiveOpen);
      return;
    }
    if (fo !== prevForceOpen) {
      prevForceOpen = fo;
      setManuallyToggled(false);
      if (fo !== null && fo !== undefined) {
        setLocalOpen(fo);
        persist(fo);
      }
      notifyIfChanged();
    }
  });

  const toggle = (): void => {
    const next = !effectiveOpen();
    setLocalOpen(next);
    setManuallyToggled(true);
    persist(next);
    notifyIfChanged();
  };

  const setOpen = (v: boolean): void => {
    setLocalOpen(v);
    setManuallyToggled(true);
    persist(v);
    notifyIfChanged();
  };

  const reset = (): void => {
    setManuallyToggled(false);
    notifyIfChanged();
  };

  return {
    open: effectiveOpen,
    toggle,
    setOpen,
    manuallyToggled,
    reset,
  };
}
