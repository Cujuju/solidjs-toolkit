import { type Accessor } from 'solid-js';
import { safeAddEventListener, getGlobalTarget } from './_internal/safeEvent';

export interface CreateHotkeyOptions {
  enabled?: Accessor<boolean>;
  preventDefault?: boolean;
  target?: 'document' | 'window';
  event?: 'keydown' | 'keyup';
}

interface ParsedCombo {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
  key: string;
}

/**
 * Aliases for keys whose `KeyboardEvent.key` differs from common names: space is ' ', and '+' is
 * the combo separator. Direct names still work.
 */
const KEY_ALIASES: Record<string, string> = {
  up: 'arrowup',
  down: 'arrowdown',
  left: 'arrowleft',
  right: 'arrowright',
  return: 'enter',
  esc: 'escape',
  space: ' ',
  plus: '+',
};

// Case-insensitive, any modifier order; 'cmd' → 'meta', 'option' → 'alt', plus KEY_ALIASES.
function parseCombo(combo: string): ParsedCombo {
  const parts = combo
    .toLowerCase()
    .split('+')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const parsed: ParsedCombo = { ctrl: false, shift: false, alt: false, meta: false, key: '' };
  for (const part of parts) {
    if (part === 'ctrl' || part === 'control') parsed.ctrl = true;
    else if (part === 'shift') parsed.shift = true;
    else if (part === 'alt' || part === 'option') parsed.alt = true;
    else if (part === 'meta' || part === 'cmd' || part === 'command') parsed.meta = true;
    else parsed.key = part;
  }
  parsed.key = KEY_ALIASES[parsed.key] ?? parsed.key;
  return parsed;
}

function matchesCombo(e: KeyboardEvent, combo: ParsedCombo): boolean {
  if (!combo.key) return false; // modifier-only combos never match
  if (e.ctrlKey !== combo.ctrl) return false;
  if (e.shiftKey !== combo.shift) return false;
  if (e.altKey !== combo.alt) return false;
  if (e.metaKey !== combo.meta) return false;
  return e.key.toLowerCase() === combo.key;
}

/**
 * Fires `handler` on a combo like `'ctrl+k'` or `'shift+?'`: case-insensitive modifiers joined
 * by `+`; `cmd` aliases `meta`, `option` aliases `alt`.
 */
export function createHotkey(
  combo: string,
  handler: (e: KeyboardEvent) => void,
  options: CreateHotkeyOptions = {},
): void {
  const parsed = parseCombo(combo);
  const enabled = options.enabled ?? (() => true);
  const preventDefault = options.preventDefault ?? true;
  const eventName = options.event ?? 'keydown';
  const target = getGlobalTarget(options.target ?? 'document');

  const listener = (e: Event): void => {
    if (!enabled()) return;
    const ke = e as KeyboardEvent;
    if (!matchesCombo(ke, parsed)) return;
    if (preventDefault) ke.preventDefault();
    handler(ke);
  };

  safeAddEventListener(target, eventName, listener);
}
