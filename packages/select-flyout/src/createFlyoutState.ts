import { createAfterPaint } from '@cujuju/solidjs-hooks';
import { createEffect, createSignal, createUniqueId, on, onCleanup } from 'solid-js';
import type { FlyoutProps } from './types';

/** Native-select feel: long enough for a multi-character prefix, short enough that an idle
 *  return starts a new one. */
const TYPEAHEAD_RESET_MS = 500;

/** Optional chain: a non-Vite bundler consuming `dist` may leave `import.meta.env` undefined. */
function devWarn(...args: unknown[]): void {
  const env = (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env;
  if (env?.DEV) {
    // eslint-disable-next-line no-console
    console.warn(...args);
  }
}

export function createFlyoutState(props: FlyoutProps) {
  const [open, setOpen] = createSignal(false);
  const [anchor, setAnchor] = createSignal<HTMLElement | null>(null);
  /** Index into props.options. -1 = nothing focused yet. */
  const [focusedIndex, setFocusedIndex] = createSignal(-1);
  // createUniqueId gives a per-component-instance id that respects
  // hydration + HMR lifecycle (vs. a module-scoped mutable counter
  // that'd grow monotonically across renders).
  const panelId = `cujuju-select-flyout-panel-${createUniqueId()}`;
  let listEl: HTMLUListElement | undefined;
  let triggerEl: HTMLButtonElement | undefined;

  let typeaheadBuffer = '';
  let typeaheadTimer: ReturnType<typeof setTimeout> | null = null;

  const afterPaint = createAfterPaint();

  function clearTypeahead(): void {
    typeaheadBuffer = '';
    if (typeaheadTimer !== null) {
      clearTimeout(typeaheadTimer);
      typeaheadTimer = null;
    }
  }

  onCleanup(clearTypeahead);

  function selectedIndex(): number {
    return props.options.findIndex((o) => o.value === props.value);
  }

  /** Empty when `value` matches no option. Warns in dev on a non-empty unmatched `value`,
   *  or the trigger silently renders blank. */
  function selectedLabel(): string {
    const idx = selectedIndex();
    if (idx >= 0) return props.options[idx]!.label;
    if (props.value !== '' && props.options.length > 0) {
      devWarn(
        '[Flyout] value did not match any option:',
        props.value,
        'options:',
        props.options.map((o) => o.value),
      );
    }
    return '';
  }

  function optionRowAt(index: number): HTMLButtonElement | undefined {
    return listEl?.querySelectorAll<HTMLButtonElement>('button[role="option"]')[index];
  }

  /** No-op if out of range; caller picks a non-disabled index. */
  function focusOptionAt(index: number): void {
    if (!listEl) return;
    const btn = optionRowAt(index);
    if (btn) btn.focus();
  }

  /** Sole owner of "the row at `focusedIndex()` holds DOM focus". Reads the index when the
   *  frame runs, so a clamp after scheduling can't leave focus on a stale row. */
  function refocusFocusedRow(): void {
    const row = optionRowAt(focusedIndex());
    if (row && row !== document.activeElement) row.focus();
  }

  function firstEnabledIndex(): number {
    return props.options.findIndex((o) => !o.disabled);
  }

  /** Walk `from` in `direction` (+1 / -1), wrapping at ends, returning
   *  the next non-disabled index. -1 if none exist. */
  function nextEnabledIndex(from: number, direction: 1 | -1): number {
    const n = props.options.length;
    if (n === 0) return -1;
    let i = from;
    for (let step = 0; step < n; step += 1) {
      i = (i + direction + n) % n;
      if (!props.options[i]!.disabled) return i;
    }
    return -1;
  }

  function openPanel(): void {
    if (props.disabled) return;
    // No enabled option: the panel would open with nothing focusable. Skip opening, like a
    // disabled select.
    if (props.options.every((o) => o.disabled)) return;
    setOpen(true);
    afterPaint(() => {
      const sel = selectedIndex();
      const target = sel >= 0 && !props.options[sel]!.disabled
        ? sel
        : firstEnabledIndex();
      setFocusedIndex(target);
      if (target >= 0) focusOptionAt(target);
    });
  }

  function closePanel(restoreFocus: boolean): void {
    setOpen(false);
    setFocusedIndex(-1);
    clearTypeahead();
    if (restoreFocus) triggerEl?.focus();
  }

  function onTriggerClick(): void {
    if (props.disabled) return;
    if (open()) {
      // Restore explicitly: Safari / macOS Firefox don't focus a clicked button.
      closePanel(true);
    } else {
      openPanel();
    }
  }

  function onTriggerKeyDown(e: KeyboardEvent): void {
    if (props.disabled) return;
    // Native-select parity: ArrowDown / ArrowUp / Enter / Space open the
    // panel from a closed 
    if (!open()) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openPanel();
      }
    }
  }

  function selectOption(index: number): void {
    if (props.disabled) return;
    const opt = props.options[index];
    if (!opt || opt.disabled) return;
    props.onChange(opt.value);
    closePanel(true);
  }

  function handleTypeahead(char: string): void {
    typeaheadBuffer += char.toLowerCase();
    if (typeaheadTimer !== null) clearTimeout(typeaheadTimer);
    typeaheadTimer = setTimeout(() => {
      typeaheadBuffer = '';
      typeaheadTimer = null;
    }, TYPEAHEAD_RESET_MS);

    const match = props.options.findIndex(
      (o) => !o.disabled && o.label.toLowerCase().startsWith(typeaheadBuffer),
    );
    if (match >= 0) {
      setFocusedIndex(match);
      focusOptionAt(match);
    }
  }

  function onPanelKeyDown(e: KeyboardEvent): void {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = nextEnabledIndex(focusedIndex(), 1);
      if (next >= 0) {
        setFocusedIndex(next);
        focusOptionAt(next);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const next = nextEnabledIndex(focusedIndex() === -1 ? 0 : focusedIndex(), -1);
      if (next >= 0) {
        setFocusedIndex(next);
        focusOptionAt(next);
      }
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (focusedIndex() >= 0) selectOption(focusedIndex());
    } else if (e.key === 'Home') {
      e.preventDefault();
      const first = firstEnabledIndex();
      if (first >= 0) {
        setFocusedIndex(first);
        focusOptionAt(first);
      }
    } else if (e.key === 'End') {
      e.preventDefault();
      // Walk backwards from index 0 to land on the LAST enabled option.
      const last = nextEnabledIndex(0, -1);
      if (last >= 0) {
        setFocusedIndex(last);
        focusOptionAt(last);
      }
    } else if (e.key === 'Tab') {
      // Tab can't be trapped: focus would escape while aria-expanded stays true. Close, restore
      // focus to the trigger, then let Tab/Shift+Tab proceed.
      closePanel(true);
      // Don't preventDefault — the user wants Tab to advance focus.
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      handleTypeahead(e.key);
    }
    // Escape is handled by AnchoredPopover.onDismiss → closePanel(true).
  }

  // Options mutated while open: keep focusedIndex valid, falling back to the first enabled.
  createEffect(() => {
    if (!open()) return;
    const idx = focusedIndex();
    if (idx === -1) return;
    if (idx >= props.options.length || props.options[idx]?.disabled) {
      const fallback = firstEnabledIndex();
      setFocusedIndex(fallback);
      if (fallback >= 0) afterPaint(refocusFocusedRow);
    }
  });

  // Disabling mid-open closes the panel. Focus can't return to a disabled
  // trigger, so none is restored — assumed to match a native select
  // (unverified across UAs).
  createEffect(() => {
    if (props.disabled && open()) closePanel(false);
  });

  // <For> re-creates a row whose option object is replaced; removing the focused row drops
  // focus to <body>, where panel keys never arrive. Residual: focus elsewhere in the panel
  // also moves.
  createEffect(
    on(
      () => props.options.slice(),
      () => {
        if (!open() || focusedIndex() < 0) return;
        afterPaint(refocusFocusedRow);
      },
      { defer: true },
    ),
  );

  const label = (): string => selectedLabel();
  const showPlaceholder = (): boolean => label() === '';

  return { open, anchor, focusedIndex, setFocusedIndex, panelId, onTriggerClick, onTriggerKeyDown, onPanelKeyDown, selectOption, focusOptionAt, closePanel, label, showPlaceholder, setAnchor,
    get listEl() { return listEl; },
    set listEl(el: HTMLUListElement | undefined) { listEl = el; },
    get triggerEl() { return triggerEl; },
    set triggerEl(el: HTMLButtonElement | undefined) { triggerEl = el; },
  };
}
