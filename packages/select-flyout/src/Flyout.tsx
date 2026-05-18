/**
 * Flyout — custom-rendered alternative to the native HTML `<select>`
 * element. Native UA-rendered `<option>` lists cannot accept
 * `backdrop-filter` or other modern CSS effects (the OS owns the popup
 * chrome), so any "glass-styled select" needs a fully author-rendered
 * panel.
 *
 * Architecture:
 *   - Trigger is a real `<button type="button">` (not a div) so default
 *     focus + Space/Enter activation work without extra wiring.
 *   - Dropdown panel is rendered through `AnchoredPopover`
 *     (`@cujuju/solidjs-anchored-popover`) — positioning, outside-click
 *     dismiss, Escape dismiss, viewport clamping, and the
 *     cascade-trap-proof shell live there.
 *   - Roving focus inside the panel: ArrowDown/Up move focus among
 *     non-disabled options, Enter selects the focused option, Escape
 *     dismisses (handled by AnchoredPopover) and we restore focus to
 *     the trigger via the dismiss callback.
 *   - Type-ahead: typing letters within ~500ms idle window jumps focus
 *     to the first option whose label starts with the buffer
 *     (case-insensitive). Mirrors native-select behavior.
 *
 * Out of scope:
 *   - Multi-select. `value` is `string`; if multi-select arrives, fork.
 *   - Async / virtualized option lists (>320px max-height scrolls; the
 *     consumer is expected to keep the option count modest, like a
 *     native select).
 *   - Search / filter input. If a consumer needs it, a chip-flyout or a
 *     bespoke combobox is the right primitive.
 *   - Form-association. Native `<select name=...>` contributes its
 *     value to surrounding `<form>` FormData on submit; this trigger
 *     is a `<button type="button">` with no hidden input, so the
 *     value lives ONLY in the controlled `value`/`onChange` pair. If
 *     a future consumer drops this into a real `<form>`, add a
 *     `name` prop here and render a hidden `<input>` mirror.
 */
import {
  createSignal,
  createEffect,
  createUniqueId,
  onCleanup,
  For,
  Show,
  type JSX,
} from 'solid-js';
import { GlassMenu } from '@cujuju/solidjs-glass-menu';
import AnchoredPopover from '@cujuju/solidjs-anchored-popover';
import { createAfterPaint } from '@cujuju/solidjs-hooks';

/** Type-ahead buffer reset window in ms. Matches native-select feel —
 *  long enough to type a multi-character prefix ("st" → "Star…"),
 *  short enough that an idle return resets the buffer instead of
 *  appending to the previous prefix. */
const TYPEAHEAD_RESET_MS = 500;

/** Join class fragments, dropping falsy entries — a tiny inline
 *  stand-in for `clsx`, sufficient for the `(string, bool && string)`
 *  forms used here. */
function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/** Development-only console warning. `import.meta.env` is statically
 *  replaced by Vite at build time; the optional chain keeps this safe
 *  in a published `dist` bundle consumed by a non-Vite bundler that
 *  leaves `import.meta.env` undefined. */
function devWarn(...args: unknown[]): void {
  const env = (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env;
  if (env?.DEV) {
    // eslint-disable-next-line no-console
    console.warn(...args);
  }
}

/** Inline `chevron-down` glyph (lucide geometry) — avoids an icon-lib
 *  dependency for a single 14px icon. */
function ChevronDownIcon(): JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export interface FlyoutOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface FlyoutProps {
  options: FlyoutOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  /** Class applied to the trigger button. Use to set width / margin
   *  / etc. without overriding the trigger's own structural styles
   *  (height, padding, chevron room) — author rules at equal
   *  specificity merge as expected. */
  class?: string;
  /** Trigger ID — useful when an external `<label for=...>` references it. */
  id?: string;
}

export function Flyout(props: FlyoutProps): JSX.Element {
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

  // Type-ahead buffer + reset timer. Module-private to this component
  // instance; resets after TYPEAHEAD_RESET_MS of keypress idleness.
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

  /** Index of the option matching props.value, or -1 if no match. */
  function selectedIndex(): number {
    return props.options.findIndex((o) => o.value === props.value);
  }

  /** Display label for the trigger. Empty string when value matches no
   *  option — caller can supply `placeholder` to fill that void.
   *  Warns in dev when `value` is non-empty AND no option matches:
   *  silent drift means the trigger renders blank while the user
   *  expects their saved selection to display, with no console signal. */
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

  /** Focus the option button at `index`. No-op if index is out of
   *  range. Caller is responsible for picking a non-disabled index. */
  function focusOptionAt(index: number): void {
    if (!listEl) return;
    const buttons = listEl.querySelectorAll<HTMLButtonElement>('button[role="option"]');
    const btn = buttons[index];
    if (btn) btn.focus();
  }

  /** First non-disabled index, or -1 if every option is disabled. */
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
    // No focusable option = panel would mount with focus stuck on the
    // listbox itself, Tab would close-and-restore (working as designed)
    // but the user sees an empty popover for one frame. Skip the open
    // entirely — same UX as a disabled select.
    if (props.options.every((o) => o.disabled)) return;
    setOpen(true);
    // After the panel mounts, focus the selected option (or the first
    // enabled one if no current selection).
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
      closePanel(false);
    } else {
      openPanel();
    }
  }

  function onTriggerKeyDown(e: KeyboardEvent): void {
    if (props.disabled) return;
    // Native-select parity: ArrowDown / ArrowUp / Enter / Space open the
    // panel from a closed state.
    if (!open()) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openPanel();
      }
    }
  }

  function selectOption(index: number): void {
    const opt = props.options[index];
    if (!opt || opt.disabled) return;
    props.onChange(opt.value);
    closePanel(true);
  }

  /** Append `char` to the type-ahead buffer, reset the idle timer,
   *  and jump focus to the first option whose label starts with the
   *  buffer (case-insensitive). No-op when no match. */
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
      // Native <select> traps Tab while its option list is open. We
      // can't trap browser Tab on the panel (focus would escape into
      // unrelated document content while aria-expanded stays true,
      // leaving the combobox in a stuck-open ARIA state). Close the
      // panel first, restore focus to the trigger, then let the
      // default Tab navigation continue from there. Shift+Tab gets
      // the same treatment — close, restore, let the next Tab
      // direction proceed.
      closePanel(true);
      // Don't preventDefault — the user wants Tab to advance focus.
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // Single printable character → type-ahead jump.
      handleTypeahead(e.key);
    }
    // Escape is handled by AnchoredPopover.onDismiss → closePanel(true).
  }

  // Keep focusedIndex in sync if options change while open (rare —
  // selects don't usually mutate options under the user — but if a
  // consumer does, fall back to first enabled).
  createEffect(() => {
    if (!open()) return;
    const idx = focusedIndex();
    if (idx === -1) return;
    if (idx >= props.options.length || props.options[idx]?.disabled) {
      const fallback = firstEnabledIndex();
      setFocusedIndex(fallback);
      if (fallback >= 0) afterPaint(() => focusOptionAt(fallback));
    }
  });

  const label = (): string => selectedLabel();
  const showPlaceholder = (): boolean => label() === '';

  return (
    <>
      <button
        ref={(el) => {
          triggerEl = el;
          setAnchor(el);
        }}
        type="button"
        id={props.id}
        class={cx(
          'cujuju-select-flyout-trigger',
          open() && 'cujuju-select-flyout-trigger-open',
          props.class,
        )}
        disabled={props.disabled}
        onClick={onTriggerClick}
        onKeyDown={onTriggerKeyDown}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open()}
        aria-controls={panelId}
        aria-disabled={props.disabled}
        aria-label={props.ariaLabel}
      >
        <span
          class={cx(
            'cujuju-select-flyout-label',
            showPlaceholder() && 'cujuju-select-flyout-placeholder',
          )}
        >
          {showPlaceholder() ? (props.placeholder ?? '') : label()}
        </span>
        <span class="cujuju-select-flyout-chevron" aria-hidden="true">
          <ChevronDownIcon />
        </span>
      </button>

      {/* AnchoredPopover positions; GlassMenu paints the glass surface
          (headerless — no title/action/close). The inner <ul> is the
          listbox itself; `panelId` lands on GlassMenu's root, which is
          the combobox's `aria-controls` target. */}
      <AnchoredPopover
        open={open}
        anchor={anchor}
        onDismiss={() => closePanel(true)}
        placement="below-start"
      >
        <GlassMenu class="cujuju-select-flyout-panel" id={panelId}>
          <ul
            ref={(el) => (listEl = el)}
            role="listbox"
            aria-label={props.ariaLabel}
            onKeyDown={onPanelKeyDown}
            class="cujuju-select-flyout-list"
          >
          <For each={props.options}>
            {(opt, index) => {
              const isSelected = (): boolean => opt.value === props.value;
              const isFocused = (): boolean => focusedIndex() === index();
              return (
                <li>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected()}
                    aria-disabled={opt.disabled}
                    class={cx(
                      'cujuju-select-flyout-option',
                      isSelected() && 'cujuju-select-flyout-option-selected',
                      isFocused() && 'cujuju-select-flyout-option-focused',
                    )}
                    disabled={opt.disabled}
                    tabIndex={isFocused() ? 0 : -1}
                    onClick={() => selectOption(index())}
                    onMouseEnter={() => {
                      if (!opt.disabled) setFocusedIndex(index());
                    }}
                  >
                    <span class="cujuju-select-flyout-check" aria-hidden="true">
                      <Show when={isSelected()}>•</Show>
                    </span>
                    <span>{opt.label}</span>
                  </button>
                </li>
              );
            }}
          </For>
          </ul>
        </GlassMenu>
      </AnchoredPopover>
    </>
  );
}
