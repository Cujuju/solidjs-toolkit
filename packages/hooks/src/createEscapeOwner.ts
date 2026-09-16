import { createEffect, createMemo, onCleanup, type Accessor } from 'solid-js';
import { delegateEvents } from 'solid-js/web';

/**
 * ONE Escape-owner stack for the whole app. Every dismissible surface binds Escape at the
 * DOCUMENT, so without a shared owner one keypress closes two stacked surfaces, or the wrong one.
 */
// `Symbol.for`, not a module const: two inlined copies would otherwise hold two stacks.

// Survives HMR: a surface never disposed across a reload keeps its owner on top until a full reload.
export const ESCAPE_OWNERS_KEY = Symbol.for('@cujuju/solidjs-toolkit/escape-owners');

/** Per-node hook state, keyed by `Symbol.for` so every module copy shares one hook per node. */
const ROOT_HOOK_KEY = Symbol.for('@cujuju/solidjs-toolkit/escape-owner-root-hook');

/**
 * Couples to Solid's `$$<event>` delegation convention (identical in dev and prod builds; a Solid
 * major that drops `delegateEvents` breaks this import, not just the fallback).
 */
const DELEGATED_KEYDOWN = '$$keydown';

type DelegatedHandler = (this: Node, ...args: unknown[]) => void;

interface RootHook {
  hook: DelegatedHandler;
  prev: DelegatedHandler | undefined;
  /** Entries currently owning this node. */
  count: number;
}

type HookableNode = Node & {
  [DELEGATED_KEYDOWN]?: DelegatedHandler;
  [ROOT_HOOK_KEY]?: RootHook;
};

interface EscapeOwnerEntry {
  dismiss: () => void;
  owns: () => readonly (Node | null | undefined)[];
  /** Owned nodes hooked for this entry; unhooked on release. */
  hooked: Set<HookableNode>;
  /** Skipped by other entries' `isTop` — see `CreateEscapeOwnerOptions.transparent`. */
  transparent?: boolean;
}

interface EscapeOwnerRegistry {
  /** Open surfaces in push (show) order. The last entry owns Escape. */
  stack: EscapeOwnerEntry[];
  /** The one document listener pair. Held here so any module copy can remove it. */
  listener: ((e: Event) => void) | null;
  bubbleListener: ((e: Event) => void) | null;
  /** Depth of in-flight dismissals — see `isEscapeDismissing`. */
  dismissing: number;
}

const registry: EscapeOwnerRegistry = ((
  globalThis as unknown as Record<symbol, EscapeOwnerRegistry | undefined>
)[ESCAPE_OWNERS_KEY] ??= { stack: [], listener: null, bubbleListener: null, dismissing: 0 });

function startListening(): void {
  if (registry.listener || typeof window === 'undefined') return;
  // Capture: an Escape this stack consumes must be stopped BEFORE the surfaces below and any
  // ancestor handler run, not after. Bubble: the one case capture defers — see `ownsEvent`.
  registry.listener = onEscapeOwnerKeyDown;
  registry.bubbleListener = onEscapeOwnerKeyDownBubble;
  // Solid's delegated listener must precede the bubble fallback, so nested editors still go first.
  delegateEvents(['keydown']);
  document.addEventListener('keydown', registry.listener, true);
  document.addEventListener('keydown', registry.bubbleListener);
}

function stopListening(): void {
  if (!registry.listener) return;
  document.removeEventListener('keydown', registry.listener, true);
  if (registry.bubbleListener) document.removeEventListener('keydown', registry.bubbleListener);
  registry.listener = null;
  registry.bubbleListener = null;
}

/**
 * Hook `node` into Solid's delegated walk, chained after any handler already there. Descendant
 * handlers run first; enclosing ones (walked after this node) never see a consumed Escape.
 */
function hookRoot(entry: EscapeOwnerEntry, node: HookableNode): void {
  if (entry.hooked.has(node)) return;
  entry.hooked.add(node);
  const state = node[ROOT_HOOK_KEY];
  if (state && node[DELEGATED_KEYDOWN] === state.hook) {
    state.count += 1;
    return;
  }
  const prev = node[DELEGATED_KEYDOWN];
  const hook: DelegatedHandler = function (this: Node, ...args) {
    prev?.apply(this, args);
    // Solid passes `(data, e)` for array-form handlers, `(e)` otherwise.
    onOwnedRootKeyDown(args[args.length - 1] as KeyboardEvent, node);
  };
  node[ROOT_HOOK_KEY] = { hook, prev, count: 1 };
  node[DELEGATED_KEYDOWN] = hook;
}

function unhookRoot(node: HookableNode): void {
  const state = node[ROOT_HOOK_KEY];
  if (!state) return;
  state.count -= 1;
  if (state.count > 0) return;
  delete node[ROOT_HOOK_KEY];
  // Solid reassigned the slot while hooked (spread props): theirs wins, so leave it.
  if (node[DELEGATED_KEYDOWN] !== state.hook) return;
  if (state.prev) node[DELEGATED_KEYDOWN] = state.prev;
  else delete node[DELEGATED_KEYDOWN];
}

/** Idempotent: a second push of the same entry must not need two pops to clear. */
function acquire(entry: EscapeOwnerEntry): void {
  if (registry.stack.includes(entry)) return;
  if (registry.stack.length === 0) startListening();
  registry.stack.push(entry);
}

/** Idempotent, and order-independent: a non-LIFO close must not corrupt the stack. */
function release(entry: EscapeOwnerEntry): void {
  const at = registry.stack.lastIndexOf(entry);
  if (at === -1) return;
  registry.stack.splice(at, 1);
  for (const node of entry.hooked) unhookRoot(node);
  entry.hooked.clear();
  if (registry.stack.length === 0) stopListening();
}

/** Claimed by someone else: `preventDefault` (the documented claim) or `stopPropagation`. */
function isClaimed(e: KeyboardEvent): boolean {
  return e.defaultPrevented || e.cancelBubble;
}

/** The owned node of `entry` that contains `target`, if any. */
function ownedRootOf(entry: EscapeOwnerEntry, target: Node | null): Node | null {
  if (!target) return null;
  return entry.owns().find((node): node is Node => !!node && node.contains(target)) ?? null;
}

/** The top entry, when this Escape is one it should act on in `phase`. */
function ownsEvent(e: KeyboardEvent, phase: 'capture' | 'bubble'): EscapeOwnerEntry | null {
  if (e.key !== 'Escape') return null;
  // Already claimed: an earlier capture handler, or — in the bubble phase — a handler INSIDE
  // the top surface, such as an inline editor cancelling its own edit.
  if (isClaimed(e)) return null;
  const top = registry.stack[registry.stack.length - 1];
  if (!top) return null;
  // An Escape raised inside a node the top surface owns belongs to that node's handlers first,
  // so it is deferred to the delegated walk. Everything else is consumed in capture.
  const target = e.target as Node | null;
  const root = ownedRootOf(top, target);
  if (phase === 'capture' && root) {
    // Hooked before the walk starts, so a node that was not yet rendered at open is covered too.
    for (const node of top.owns()) if (node && node.contains(target)) hookRoot(top, node);
  }
  return !!root === (phase === 'bubble') ? top : null;
}

function dismissTop(e: KeyboardEvent, top: EscapeOwnerEntry): void {
  // Consume first: the surfaces below must not act on the same keypress, and the native
  // close-request must not close a popover we are about to dismiss ourselves.
  e.preventDefault();
  e.stopPropagation();
  registry.dismissing += 1;
  try {
    top.dismiss();
  } finally {
    registry.dismissing -= 1;
  }
  // A REFUSED dismissal (`open` still true) keeps the entry: the surface is still open, so the
  // key stays consumed and the next Escape asks again.
}

function onEscapeOwnerKeyDown(e: Event): void {
  const ke = e as KeyboardEvent;
  const top = ownsEvent(ke, 'capture');
  if (top) dismissTop(ke, top);
}

/** Inside Solid's walk, at an owned node: every descendant handler has had its turn. */
function onOwnedRootKeyDown(e: KeyboardEvent, node: Node): void {
  if (e.key !== 'Escape' || isClaimed(e)) return;
  const top = registry.stack[registry.stack.length - 1];
  if (!top || !top.owns().includes(node)) return;
  dismissTop(e, top);
}

/** Fallback only: the delegated hook was lost (slot reassigned) and nothing claimed the key. */
function onEscapeOwnerKeyDownBubble(e: Event): void {
  const ke = e as KeyboardEvent;
  const top = ownsEvent(ke, 'bubble');
  if (top) dismissTop(ke, top);
}

/**
 * True while a dismissal (and any synchronous refocus it causes) runs. Focus-out logic must
 * ignore moves seen inside it: Escape dismisses one layer.
 */
export function isEscapeDismissing(): boolean {
  return registry.dismissing > 0;
}

export interface CreateEscapeOwnerOptions {
  /** The entry is on the stack exactly while this returns true. */
  open: Accessor<boolean>;
  /** Escape reached this surface as the topmost open one. */
  onDismiss: () => void;
  /**
   * Nodes this surface owns (panel, anchor). Escape raised inside one reaches that node's own
   * handlers first; a nested editor keeps it via `preventDefault`. Omitted: always consumed.
   */
  owns?: () => readonly (Node | null | undefined)[];
  /**
   * Transparent to other entries' `isTop()`; still owns Escape when on top. For hint surfaces
   * (tooltips). Default `false`.
   */
  transparent?: boolean;
}

export interface CreateEscapeOwnerReturn {
  /** No non-transparent open surface is above this one — gate other document-level keys on it. */
  isTop: () => boolean;
}

/**
 * Claim Escape while `open`. Only the topmost entry is dismissed, and it consumes the event.
 * Released on close and on unmount — every path out.
 */
export function createEscapeOwner(options: CreateEscapeOwnerOptions): CreateEscapeOwnerReturn {
  const entry: EscapeOwnerEntry = {
    dismiss: () => options.onDismiss(),
    owns: () => options.owns?.() ?? [],
    hooked: new Set(),
    transparent: options.transparent ?? false,
  };
  // Deduped: a re-run while still open would release and re-push, moving the entry to the top.
  const isOpen = createMemo(() => !!options.open());

  createEffect(() => {
    if (!isOpen()) return;
    acquire(entry);
    onCleanup(() => release(entry));
  });
  onCleanup(() => release(entry));

  return { isTop: () => isTopOwner(entry) };
}

/** No opaque entry sits above `entry`. An entry without the field (older copy) is opaque. */
function isTopOwner(entry: EscapeOwnerEntry): boolean {
  for (let i = registry.stack.length - 1; i >= 0; i -= 1) {
    const above = registry.stack[i];
    if (above === entry) return true;
    if (!above.transparent) return false;
  }
  return false;
}
