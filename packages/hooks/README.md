# @cujuju/solidjs-hooks

Generic SolidJS utility hooks — zero dependencies, accessor-style APIs.

## Install

```
pnpm add @cujuju/solidjs-hooks
```

## Hooks

### `createClickOutside(isInside, handler, options?)`

Fires `handler` on `pointerdown` outside the floating UI's interactive surface.

The surface is described by a predicate `(target: Node) => boolean`. The companion
helper `contains(...)` covers the common ref-based cases:

```tsx
import { createClickOutside, contains } from '@cujuju/solidjs-hooks';

let menuEl: HTMLDivElement | undefined;
const [open, setOpen] = createSignal(false);

// Single ref
createClickOutside(contains(() => menuEl), () => setOpen(false), { enabled: open });

// Multi-ref (button trigger + portaled panel both count as "inside")
createClickOutside(contains(() => [buttonEl, panelEl]), close, { enabled: open });

// Selector-based (e.g., portal-rendered subtree)
createClickOutside((t) => (t as Element).closest('[data-flyout]') !== null, close);
```

**Behavior:**
- Listens on `pointerdown` (capture phase) — covers mouse, touch, and pen with one trigger.
  Capture phase means a child calling `e.stopPropagation()` cannot silently break the hook.
- Suppresses events whose `timeStamp` predates listener attachment — the gesture that
  opened the floating UI (e.g., a `contextmenu` or `click`) cannot immediately close it.
  Replaces the per-callsite `setTimeout` defenses common in hand-rolled outside-click code.
- `options.enabled` gate is checked on every event; safe to leave the listener attached
  for the lifetime of the component.

### `createEscapeKey(handler, options?)`

Fires on Escape keydown.

```tsx
createEscapeKey(() => setOpen(false), { enabled: open });
```

### `createHotkey(combo, handler, options?)`

Keyboard shortcuts. Combo syntax: modifiers (`ctrl`, `shift`, `alt`, `meta`) separated by `+`, then the key. Case-insensitive. `cmd`/`command` alias `meta`; `option` aliases `alt`. Modifier-only combos never match.

```tsx
createHotkey('ctrl+k', () => openSearch());
createHotkey('shift+?', () => showHelp());
createHotkey('escape', () => close(), { enabled: () => modalOpen() });
createHotkey('up', () => focusPrev());          // alias for arrowup
createHotkey('shift+plus', () => zoomIn());     // 'plus' alias — '+' is the combo separator
```

**Key aliases** (additive — direct names like `'arrowup'` / `'enter'` continue to work):

| Alias | Resolves to (`KeyboardEvent.key`) |
|---|---|
| `up` / `down` / `left` / `right` | `ArrowUp` / `ArrowDown` / `ArrowLeft` / `ArrowRight` |
| `return` | `Enter` |
| `esc` | `Escape` |
| `space` | `' '` (single space character) |
| `plus` | `+` |

### `createLocalStorage(key, defaultValue)`

Reactive JSON-serialized localStorage signal. Same shape as `createSignal`.

```tsx
const [theme, setTheme] = createLocalStorage('theme', 'dark');
setTheme('light');
```

### `createPersistedSet<T>(key, options?)`

`Set<T>` backed by localStorage. Defaults to `Set<string>`.

```tsx
const expanded = createPersistedSet<string>('myapp:expanded');
expanded.toggle('panel-1');
expanded.set(); // accessor — reactive
```

For non-string values, provide serializers:

```tsx
const ids = createPersistedSet<number>('myapp:ids', { serialize: String, deserialize: Number });
```

### `createPersistedMap<K, V>(key, options?)`

`Map<K, V>` backed by localStorage.

```tsx
const prefs = createPersistedMap<string, string>('myapp:prefs');
prefs.set('view', 'compact');
prefs.get('view'); // 'compact'
```

### `createMediaQuery(query)`

Reactive media query matcher.

```tsx
const isWide = createMediaQuery('(min-width: 768px)');
<Show when={isWide()}>Wide layout</Show>
```

### `createResizeObserver(elAccessor, handler)`

Observes element size changes.

```tsx
createResizeObserver(() => containerEl, (entry) => {
  setWidth(entry.contentRect.width);
});
```

### `createIntersectionObserver(elAccessor, handler, options?)`

Observes viewport intersection.

```tsx
createIntersectionObserver(() => targetEl, (entry) => {
  if (entry.isIntersecting) loadMore();
}, { threshold: 0.5 });
```

### `createDebounce(source, ms)`

Returns a debounced accessor. Rapid `source` changes reset the delay.

```tsx
const [query, setQuery] = createSignal('');
const debouncedQuery = createDebounce(query, 300);
createEffect(() => search(debouncedQuery()));
```

### `createDebouncedCallback(fn, ms)`

Wraps a callback so repeated calls collapse to one invocation after `ms` ms of stillness. Pending calls are cancelled on dispose. `isPending` is a reactive accessor — true between a `call()` and the firing of `fn` (or the intervening `cancel()` / `flush()`); useful for "saving…" indicators.

```tsx
const { call, cancel, flush, isPending } = createDebouncedCallback(saveToServer, 3000);
textarea.addEventListener('input', (e) => call(e.target.value));
// In JSX:
<Show when={isPending()}><span class="text-muted">Saving…</span></Show>
```

`isPending` flips back to false even if `fn` throws — it describes scheduling, not the in-flight call.

### `createDocumentVisibility()`

Reactive `document.visibilityState`.

```tsx
const visible = createDocumentVisibility();
createEffect(() => {
  if (visible() === 'hidden') pauseUpdates();
});
```

### `createAsyncStatus(fn, options?)`

State machine for async actions with timed auto-reset: `idle → loading → done/error → idle`. Useful for buttons that flash "done" or "error" briefly.

```tsx
const { status, run } = createAsyncStatus(async () => {
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

### `createAfterPaint()`

Returns `schedule(fn)` that runs `fn` on the next animation frame. A second
`schedule()` call before the first fires cancels the pending frame (supersede).
Component cleanup cancels any still-pending frame.

Use inside `createEffect` / `onMount` when you need post-DOM-flush measurement:
popover positioning, focus-after-mount, scroll-indicator update,
ResizeObserver-driven reposition. Replaces bare `requestAnimationFrame(fn)`,
which leaks a pending callback past component disposal.

```tsx
const afterPaint = createAfterPaint();
createEffect(() => {
  if (open()) afterPaint(clampToViewport);
});
```

### `createOutsideScrollDismiss(getOpen, getPanelEl, onDismiss, shouldSuppress?)`

Dismiss a popover/flyout when the page scrolls outside it. Anchored panels
desynchronize from their anchor when the page scrolls; closing on scroll is
the conventional fix.

Scrolls whose target lives inside `getPanelEl()` are ignored (so a scrollable
list inside the panel can wheel without dismissing). `shouldSuppress` extends
the in-panel filter to descendant surfaces that live OUTSIDE `panelEl` in the
DOM (Portal'd popovers, modal dialogs) — pass a predicate matching your own
descendant convention.

`capture: true` is used so non-window scroll containers also dismiss; the
listener is gated on `getOpen()` so closed panels pay zero per-frame cost.

```tsx
const [open, setOpen] = createSignal(false);
let panelEl: HTMLDivElement | undefined;
createOutsideScrollDismiss(open, () => panelEl, () => setOpen(false));
```

## Convention: accessor style

Element-tracking hooks (`createResizeObserver`, `createIntersectionObserver`, and the `contains()` helper for `createClickOutside`) take an **element accessor** (`() => HTMLElement | undefined`), not a returned ref. The accessor is re-read on every callback, so refs that mount later (e.g., portaled panels) are picked up automatically.

For reactive gating, use `options.enabled` rather than returning `undefined` from the accessor:

```tsx
createClickOutside(contains(() => menuEl), close, { enabled: open });
```

## 2.0.0 migration

All hooks renamed from `use*` to `create*` to match SolidJS idiomatic convention
(`createSignal`, `createMemo`, solid-primitives library). Drop-in rename:

| Old (1.x) | New (2.x) |
|---|---|
| `useClickOutside` | `createClickOutside` |
| `useEscapeKey` | `createEscapeKey` |
| `useHotkey` | `createHotkey` |
| `useLocalStorage` | `createLocalStorage` |
| `useMediaQuery` | `createMediaQuery` |
| `useResizeObserver` | `createResizeObserver` |
| `useIntersectionObserver` | `createIntersectionObserver` |
| `useDebounce` | `createDebounce` |
| `useDebouncedCallback` | `createDebouncedCallback` |
| `useDocumentVisibility` | `createDocumentVisibility` |
| `useAsyncStatus` | `createAsyncStatus` |
| `usePersistedSet` | `createPersistedSet` |
| `usePersistedMap` | `createPersistedMap` |

Option / return interface type names follow the same pattern: `UseHotkeyOptions` →
`CreateHotkeyOptions`, etc.

The `contains` utility is **not** renamed (it isn't a hook).

## License

MIT
