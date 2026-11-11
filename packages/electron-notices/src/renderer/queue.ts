import { createSignal, type Accessor } from 'solid-js';
import { MAX_KEPT_NOTICES, type Notice, type NoticeRef } from '../types.js';
export { NOTICE_VISIBLE_MS } from '../types.js';

interface Clock { timer: ReturnType<typeof setTimeout> | null; deadline: number; remaining: number }

export interface NoticeQueue {
  /** On screen, oldest first; includes notices playing their exit. */
  items: Accessor<Notice[]>;
  /** Ids playing their exit: dismissed, removed once `exitMs` passes. */
  leaving: Accessor<ReadonlySet<number>>;
  push(n: Notice): void;
  dismiss(id: number): void;
  withdraw(ref: NoticeRef): void;
  pin(id: number, pinned: boolean): void;
  clear(): void;
  dispose(): void;
  /** Hover holds every notice on screen; leaving restarts each with the time it had left. */
  pause(): void;
  resume(): void;
}

/** Notices on screen, oldest first. */
/** `maxKept`: read on each push; past it the oldest unpinned notice is dismissed. */
/** `exitMs`: read on each dismiss; a dismissed notice stays this long for its exit animation. Zero removes at once. */
export function createNoticeQueue(
  durationOf: (n: Notice) => number, onClosed?: (id: number) => void, maxKept: () => number = () => MAX_KEPT_NOTICES,
  exitMs: () => number = () => 0,
): NoticeQueue {
  const [items, setItems] = createSignal<Notice[]>([]);
  const [leaving, setLeaving] = createSignal<ReadonlySet<number>>(new Set());
  const clocks = new Map<number, Clock>();
  const exits = new Map<number, ReturnType<typeof setTimeout>>();
  let paused = false;

  const stop = (id: number) => {
    const c = clocks.get(id);
    if (c?.timer) clearTimeout(c.timer);
    clocks.delete(id);
  };
  const run = (id: number, ms: number) => {
    clocks.set(id, { timer: paused ? null : setTimeout(() => dismiss(id), ms), deadline: Date.now() + ms, remaining: ms });
  };
  const remove = (id: number) => {
    exits.delete(id);
    setLeaving((s) => { const next = new Set(s); next.delete(id); return next; });
    setItems((xs) => xs.filter((x) => x.id !== id));
    onClosed?.(id);
  };
  function dismiss(id: number): void {
    if (exits.has(id) || !items().some((n) => n.id === id)) return;
    stop(id);
    const ms = exitMs();
    if (ms <= 0) { remove(id); return; }
    setLeaving((s) => new Set(s).add(id));
    exits.set(id, setTimeout(() => remove(id), ms));
  }
  /** Not playing an exit. */
  const live = () => items().filter((x) => !exits.has(x.id));

  return {
    items,
    leaving,
    push(n) {
      const old = n.key === undefined ? undefined : live().find((x) => x.key === n.key);
      if (old) dismiss(old.id);
      const xs = live();
      if (xs.length >= maxKept()) dismiss((xs.find((x) => !x.pinned) ?? xs[0]).id);
      setItems((kept) => [...kept, n]);
      const ms = n.remainingMs ?? durationOf(n);
      if (!n.pinned && ms !== 0) run(n.id, ms);
    },
    dismiss,
    withdraw(ref) { for (const n of live()) if ('id' in ref ? n.id === ref.id : n.key === ref.key) dismiss(n.id); },
    pin(id, pinned) {
      const n = live().find((x) => x.id === id);
      if (!n) return;
      stop(id);
      // The replay's remaining time applied to the first timer only.
      const { remainingMs: _replayed, ...rest } = n;
      const next = { ...rest, pinned };
      setItems((xs) => xs.map((x) => x.id === id ? next : x));
      const ms = durationOf(next);
      if (!pinned && ms !== 0) run(id, ms);
    },
    clear() { for (const n of live()) dismiss(n.id); },
    dispose() {
      for (const id of clocks.keys()) stop(id);
      for (const t of exits.values()) clearTimeout(t);
      exits.clear();
      setLeaving(new Set<number>());
      setItems([]);
    },
    pause() {
      if (paused) return;
      paused = true;
      const now = Date.now();
      for (const c of clocks.values()) {
        if (c.timer) clearTimeout(c.timer);
        c.timer = null;
        c.remaining = Math.max(0, c.deadline - now);
      }
    },
    resume() {
      if (!paused) return;
      paused = false;
      for (const [id, c] of [...clocks]) run(id, c.remaining);
    },
  };
}
