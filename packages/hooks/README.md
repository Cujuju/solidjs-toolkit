# @cujuju/solidjs-hooks

Generic SolidJS utility hooks — zero dependencies, accessor-style APIs.

## Install

```
pnpm add @cujuju/solidjs-hooks
```

## Hooks

### `useClickOutside(isInside, handler, options?)`

Fires `handler` on `pointerdown` outside the floating UI's interactive surface.

The surface is described by a predicate `(target: Node) => boolean`. The companion
helper `contains(...)` covers the common ref-based cases:

```tsx
import { useClickOutside, contains } from '@cujuju/solidjs-hooks';

let menuEl: HTMLDivElement | undefined;
const [open, setOpen] = createSignal(false);

// Single ref
useClickOutside(contains(() => menuEl), () => setOpen(false), { enabled: open });

// Multi-ref (button trigger + portaled panel both count as "inside")
useClickOutside(contains(() => [buttonEl, panelEl]), close, { enabled: open });

// Selector-based (e.g., portal-rendered subtree)
useClickOutside((t) => (t as Element).closest('[data-flyout]') !== null, close);
```

**Behavior:**
- Listens on `pointerdown` (capture phase) — covers mouse, touch, and pen with one trigger.
  Capture phase means a child calling `e.stopPropagation()` cannot silently break the hook.
- Suppresses events whose `timeStamp` predates listener attachment — the gesture that
  opened the floating UI (e.g., a `contextmenu` or `click`) cannot immediately close it.
  Replaces the per-callsite `setTimeout` defenses common in hand-rolled outside-click code.
- `options.enabled` gate is checked on every event; safe to leave the listener attached
  for the lifetime of the component.

### `useEscapeKey(handler, enabled?)`

Fires on Escape keydown.

```tsx
useEscapeKey(() => setOpen(false), open);
```

### `useHotkey(combo, handler, options?)`

Keyboard shortcuts. Combo syntax: modifiers (`ctrl`, `shift`, `alt`, `meta`) separated by `+`, then the key. Case-insensitive. `cmd`/`command` alias `meta`; `option` aliases `alt`. Modifier-only combos never match.

```tsx
useHotkey('ctrl+k', () => openSearch());
useHotkey('shift+?', () => showHelp());
useHotkey('escape', () => close(), { enabled: () => modalOpen() });
useHotkey('up', () => focusPrev());          // alias for arrowup
useHotkey('shift+plus', () => zoomIn());     // 'plus' alias — '+' is the combo separator
```

**Key aliases** (additive — direct names like `'arrowup'` / `'enter'` continue to work):

| Alias | Resolves to (`KeyboardEvent.key`) |
|---|---|
| `up` / `down` / `left` / `right` | `ArrowUp` / `ArrowDown` / `ArrowLeft` / `ArrowRight` |
| `return` | `Enter` |
| `esc` | `Escape` |
| `space` | `' '` (single space character) |
| `plus` | `+` |

### `useLocalStorage(key, defaultValue)`

Reactive JSON-serialized localStorage signal. Same shape as `createSignal`.

```tsx
const [theme, setTheme] = useLocalStorage('theme', 'dark');
setTheme('light');
```

### `usePersistedSet<T>(key, options?)`

`Set<T>` backed by localStorage. Defaults to `Set<string>`.

```tsx
const expanded = usePersistedSet<string>('myapp:expanded');
expanded.toggle('panel-1');
expanded.set(); // accessor — reactive
```

For non-string values, provide serializers:

```tsx
const ids = usePersistedSet<number>('myapp:ids', { serialize: String, deserialize: Number });
```

### `usePersistedMap<K, V>(key, options?)`

`Map<K, V>` backed by localStorage.

```tsx
const prefs = usePersistedMap<string, string>('myapp:prefs');
prefs.set('view', 'compact');
prefs.get('view'); // 'compact'
```

### `useMediaQuery(query)`

Reactive media query matcher.

```tsx
const isWide = useMediaQuery('(min-width: 768px)');
<Show when={isWide()}>Wide layout</Show>
```

### `useResizeObserver(elAccessor, handler)`

Observes element size changes.

```tsx
useResizeObserver(() => containerEl, (entry) => {
  setWidth(entry.contentRect.width);
});
```

### `useIntersectionObserver(elAccessor, handler, options?)`

Observes viewport intersection.

```tsx
useIntersectionObserver(() => targetEl, (entry) => {
  if (entry.isIntersecting) loadMore();
}, { threshold: 0.5 });
```

### `useDebounce(source, ms)`

Returns a debounced accessor. Rapid `source` changes reset the delay.

```tsx
const [query, setQuery] = createSignal('');
const debouncedQuery = useDebounce(query, 300);
createEffect(() => search(debouncedQuery()));
```

### `useDebouncedCallback(fn, ms)`

Wraps a callback so repeated calls collapse to one invocation after `ms` ms of stillness. Pending calls are cancelled on dispose. `isPending` is a reactive accessor — true between a `call()` and the firing of `fn` (or the intervening `cancel()` / `flush()`); useful for "saving…" indicators.

```tsx
const { call, cancel, flush, isPending } = useDebouncedCallback(saveToServer, 3000);
textarea.addEventListener('input', (e) => call(e.target.value));
// In JSX:
<Show when={isPending()}><span class="text-muted">Saving…</span></Show>
```

`isPending` flips back to false even if `fn` throws — it describes scheduling, not the in-flight call.

### `useDocumentVisibility()`

Reactive `document.visibilityState`.

```tsx
const visible = useDocumentVisibility();
createEffect(() => {
  if (visible() === 'hidden') pauseUpdates();
});
```

### `useAsyncStatus(fn, options?)`

State machine for async actions with timed auto-reset: `idle → loading → done/error → idle`. Useful for buttons that flash "done" or "error" briefly.

```tsx
const { status, run } = useAsyncStatus(async () => {
  return await saveData();
}, { resetMs: 2000 });

<button
  onClick={() => run()}
  disabled={status() === 'loading'}
>
  {status() === 'loading' ? 'Saving...' :
   status() === 'done' ? 'Saved!' :
   status() === 'error' ? 'Error' :
   'Save'}
</button>
```

## Convention: accessor style

Element-tracking hooks (`useResizeObserver`, `useIntersectionObserver`, and the `contains()` helper for `useClickOutside`) take an **element accessor** (`() => HTMLElement | undefined`), not a returned ref. The accessor is re-read on every callback, so refs that mount later (e.g., portaled panels) are picked up automatically.

For reactive gating, use `options.enabled` rather than returning `undefined` from the accessor:

```tsx
useClickOutside(contains(() => menuEl), close, { enabled: open });
```

## License

MIT
