# cujuju-solidjs-* — Contribution Conventions

Rules that apply to every `cujuju-solidjs-*` package. Keep them short; add a new rule only when drift has actually caused a bug.

---

## 1. DOM access goes through internal primitives

**Rule:** No hook or component calls `document.*` / `window.*` / `localStorage.*` / `addEventListener` / observer constructors directly below the package's `_internal/` layer. Adding a new direct call is a bug.

**Primitives:**
- `safeAddEventListener(target, event, listener, options?)` — in `cujuju-solidjs-hooks/_internal/safeEvent.ts` and duplicated in `cujuju-solidjs-hold-action/_internal/safeEvent.ts`. SSR-safe, auto-cleanup.
- `getGlobalTarget('document' | 'window')` — returns the global event target or `null` on SSR.
- `safeStorageRead<T>(key, deserialize, fallback)` / `safeStorageWrite(key, raw)` — in `cujuju-solidjs-hooks/_internal/safeStorage.ts`. Swallows SSR / quota / parse errors.

**Why:** Before these existed, the package had THREE different SSR strategies — some hooks used explicit guards, some used try/catch, some had no guard at all and crashed on SolidStart. Consolidating behind primitives guarantees consistent behaviour and one place to change policy.

---

## 2. DOM measurement — layout box vs. visual box

**Rule:**
- For **sizing** a child element based on a parent's dimensions, use `measureLayoutBox(el)` (returns `offsetWidth/offsetHeight` — the LAYOUT box, unscaled by CSS transforms).
- For **positioning** a child element relative to a parent's visual location, `getBoundingClientRect` is correct — it reflects transforms, which is usually what you want for placement.

**Why:** Host apps commonly apply `button:active { transform: scale(0.95) }` or similar. If an absolute-positioned child measures the parent's `getBoundingClientRect` and uses that as a size, the child gets sized to the already-scaled dimensions. The parent's transform then scales the child again, producing a visibly-smaller-than-expected render. Bug observed in `HoldIndicator` before this rule existed.

Primitive lives at `cujuju-solidjs-hold-action/_internal/measure.ts`. Duplicate if you need it in another package; unify into a shared package if/when drift becomes a problem.

---

## 3. Hook option-object convention

**Rule:** Hooks that accept configuration (most hooks with more than one tunable) take a trailing `options?: {...}` object. Not positional.

**Specifically:** the `enabled: Accessor<boolean>` gate, when present, lives at `options.enabled`. Not as a positional arg.

**Exception:** hooks with exactly one required input and no options stay bare — `useMediaQuery(query)`, `useDebounce(source, ms)`, etc.

**Why:** positional args don't scale. Each new option would force a signature change; options-object lets hooks grow without breaking callers.

---

## 4. Hook return-shape convention

**Rule:**
- **Bare accessor** (`Accessor<T>`) for hooks exposing a single reactive value with no actions. Examples: `useMediaQuery`, `useDocumentVisibility`.
- **Tuple `[Accessor, setter]`** for hooks that mirror `createSignal` semantics. Example: `useLocalStorage`.
- **Object `{ ...accessors, ...actions }`** for hooks with multiple actions, multiple state pieces, or where a named access is clearer. Examples: `usePersistedSet`, `useDebouncedCallback`, `useAsyncStatus`, `useHoldAction`, `useCollapsible`.

**Why:** bare accessors compose cleanly with `createMemo`; tuples mirror the Solid idiom for reads+writes; objects scale to rich APIs without bikeshedding argument order. Consumers pattern-match at call sites.

---

## 5. Package defaults in `@layer cujuju-defaults`

**Rule:** CSS files shipped with a package must wrap all `:root` default declarations in `@layer cujuju-defaults`. Consumer-supplied unlayered CSS must win regardless of stylesheet load order.

**Why:** package stylesheets are side-effect-imported by component JS, which runs after the host's bootstrap CSS. Without `@layer`, package defaults override consumer mappings. Bug observed when SegGroup colors reverted to the package's built-in green.

---

## 6. Peer dep convention

**Rule:** every package declares `"peerDependencies": { "solid-js": ">=1.7.0" }` and nothing else as a peer. If a package needs more peers (e.g., Sparkline would need `lightweight-charts`), document them explicitly and justify in the README.

---

## 7. No test-free pure logic

**Rule:** any pure function with branching (state machines, geometry math, parsers) gets a vitest suite under `src/__tests__/`. Pure logic embedded in a JSX component gets extracted to a helper first, then tested.

**Why:** visual components are smoke-tested in the host app; pure logic can regress silently. The PillToggle `dataAttr` type bug and the HoldIndicator SVG-thrash perf bug would both have been caught at this layer.

---

---

## 8. Package name matches primary export's PascalCase

**Rule:** Package names follow the kebab-case form of the primary export's PascalCase. For multi-export packages, the suffix is a noun describing the exported set:

| Package | Primary export(s) | Naming kind |
|---|---|---|
| `cujuju-solidjs-pill-toggle` | `PillToggle` | direct (PascalCase ↔ kebab-case) |
| `cujuju-solidjs-pill-number-picker` | `PillNumberPicker` | direct |
| `cujuju-solidjs-collapsible` | `Collapsible` | direct |
| `cujuju-solidjs-kv-tooltip` | `KvTooltip`, `KvTooltipPanel` | shared prefix |
| `cujuju-solidjs-hold-action` | `useHoldAction`, `HoldIndicator` | thematic suffix (`-action` for the holder/indicator pair) |
| `cujuju-solidjs-seg-buttons` | `SegGroup`, `SegButton` | collection plural (`-buttons`) |
| `cujuju-solidjs-color-picker` | `ColorSwatch`, `CompactColorPicker` | thematic (`-picker`) |
| `cujuju-solidjs-hooks` | many hooks | thematic plural (`-hooks`) |

**Why:** drift between package name and export name forces consumers to mentally translate at every import site (`import { PillToggle } from 'cujuju-solidjs-toggle-pill'` was the original case — word-order reversed). The rule was added after this drift was caught and fixed; preventing future drift is cheaper than fixing it post-publication.

**Exception:** when adding a second component to an existing single-export package, the suffix may not perfectly match the new export's name. That's fine; the package name stays stable across minor versions, but the README must clearly list all exports under "API" so the import isn't a surprise.

---

## When to add a new rule here

- A bug reproduced twice across different packages or hooks.
- A reviewer found the same class of issue in two different PRs.
- A naming or shape decision was made inconsistently in two places.

Don't add rules speculatively.
