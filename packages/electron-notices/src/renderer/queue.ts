import { createSignal, type Accessor } from 'solid-js';
import { MAX_KEPT_NOTICES, type Notice, type NoticeRef } from '../types.js';
export { NOTICE_VISIBLE_MS } from '../types.js';

interface Clock { timer: ReturnType<typeof setTimeout> | null; deadline: number; remaining: number }

export interface NoticeQueue {
  items: Accessor<Notice[]>;
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
export function createNoticeQueue(
  durationOf: (n: Notice) => number, onClosed?: (id: number) => void, maxKept: () => number = () => MAX_KEPT_NOTICES,
): NoticeQueue {
  const [items, setItems] = createSignal<Notice[]>([]);
  const clocks = new Map<number, Clock>();
  let paused = false;

  const stop = (id: number) => {
    const c = clocks.get(id);
    if (c?.timer) clearTimeout(c.timer);
    clocks.delete(id);
  };
  const run = (id: number, ms: number) => {
    clocks.set(id, { timer: paused ? null : setTimeout(() => dismiss(id), ms), deadline: Date.now() + ms, remaining: ms });
  };
  function dismiss(id: number): void {
    if (!items().some((n) => n.id === id)) return;
    stop(id);
    setItems((xs) => xs.filter((x) => x.id !== id));
    onClosed?.(id);
  }

  return {
    items,
    push(n) {
      const old = n.key === undefined ? undefined : items().find((x) => x.key === n.key);
      if (old) dismiss(old.id);
      const xs = items();
      if (xs.length >= maxKept()) dismiss((xs.find((x) => !x.pinned) ?? xs[0]).id);
      setItems((kept) => [...kept, n]);
      const ms = n.remainingMs ?? durationOf(n);
      if (!n.pinned && ms !== 0) run(n.id, ms);
    },
    dismiss,
    withdraw(ref) { for (const n of items()) if ('id' in ref ? n.id === ref.id : n.key === ref.key) dismiss(n.id); },
    pin(id, pinned) {
      const n = items().find((x) => x.id === id);
      if (!n) return;
      stop(id);
      const next = { ...n, pinned };
      setItems((xs) => xs.map((x) => x.id === id ? next : x));
      const ms = durationOf(next);
      if (!pinned && ms !== 0) run(id, ms);
    },
    clear() { for (const n of items()) dismiss(n.id); },
    dispose() { for (const id of clocks.keys()) stop(id); setItems([]); },
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
