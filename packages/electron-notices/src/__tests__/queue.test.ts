import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'solid-js';
import { MAX_CONSOLE_LINES, type Notice } from '../types';
import { createNoticeQueue } from '../renderer/queue';

const VISIBLE_MS = 1000;
let nextId = 1;
const notice = (tone: string = 'warn'): Notice => ({ id: nextId++, at: 0, pinned: false, tone, title: 't', body: 'b', short: 's', target: 'window' });
const ids = (q: ReturnType<typeof createNoticeQueue>) => q.items().map((n) => n.id);

describe('createNoticeQueue', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('expires notices but keeps errors until dismissed', () => createRoot((dispose) => {
    const q = createNoticeQueue((n) => n.tone === 'error' ? 0 : VISIBLE_MS);
    const info = notice('info');
    const error = notice('error');
    q.push(info);
    q.push(error);
    vi.advanceTimersByTime(VISIBLE_MS);
    expect(ids(q)).toEqual([error.id]);
    q.dismiss(error.id);
    expect(ids(q)).toEqual([]);
    dispose();
  }));

  it('holds notices while paused and resumes with the time left', () => createRoot((dispose) => {
    const q = createNoticeQueue((n) => n.tone === 'error' ? 0 : VISIBLE_MS);
    const n = notice();
    q.push(n);
    vi.advanceTimersByTime(VISIBLE_MS * 0.75);
    q.pause();
    vi.advanceTimersByTime(VISIBLE_MS * 5);
    expect(ids(q)).toEqual([n.id]);
    q.resume();
    vi.advanceTimersByTime(VISIBLE_MS * 0.25);
    expect(ids(q)).toEqual([]);
    dispose();
  }));

  it('keeps only the newest console tail', () => createRoot((dispose) => {
    const q = createNoticeQueue((n) => n.tone === 'error' ? 0 : VISIBLE_MS);
    const pushed = Array.from({ length: MAX_CONSOLE_LINES + 2 }, () => notice('error'));
    for (const n of pushed) q.push(n);
    expect(ids(q)).toEqual(pushed.slice(-MAX_CONSOLE_LINES).map((n) => n.id));
    dispose();
  }));
});
it('appends keyed replacements and closes each removed id once', () => {
  vi.useFakeTimers();
  const closed = vi.fn(), q = createNoticeQueue(() => 1000, closed);
  const a = { ...notice(), key: 'a' }, b = notice(), c = { ...notice(), key: 'a' };
  q.push(a); q.push(b); q.push(c);
  expect(ids(q)).toEqual([b.id, c.id]);
  q.withdraw({ key: 'a' }); q.dismiss(c.id); q.clear(); q.clear();
  expect(closed.mock.calls).toEqual([[a.id], [c.id], [b.id]]);
  vi.useRealTimers();
});
it('disposes timers and items without closing notices', () => {
  vi.useFakeTimers();
  const closed = vi.fn(), q = createNoticeQueue(() => 1000, closed);
  q.push(notice()); q.push({ ...notice(), pinned: true });
  q.dispose(); q.resume();
  expect(ids(q)).toEqual([]);
  expect(vi.getTimerCount()).toBe(0);
  vi.advanceTimersByTime(1000);
  expect(closed).not.toHaveBeenCalled();
  vi.useRealTimers();
});
it('evicts the oldest unpinned, then the oldest when all are pinned', () => {
  const closed = vi.fn(), q = createNoticeQueue(() => 0, closed);
  const ns = Array.from({ length: MAX_CONSOLE_LINES }, () => ({ ...notice(), pinned: true }));
  ns.forEach(q.push); const unpinned = notice(); q.push(unpinned); q.push(notice());
  expect(closed.mock.calls).toEqual([[ns[0].id], [unpinned.id]]); q.clear();
});
it('uses remaining time once and restarts a full duration after unpin', () => {
  vi.useFakeTimers();
  const closed = vi.fn(), q = createNoticeQueue(() => 1000, closed), n = { ...notice(), remainingMs: 100 };
  q.push(n); vi.advanceTimersByTime(50); q.pin(n.id, true);
  expect(q.items()[0]).not.toBe(n);
  vi.advanceTimersByTime(500); q.pin(n.id, false); vi.advanceTimersByTime(999);
  expect(ids(q)).toEqual([n.id]); vi.advanceTimersByTime(1);
  expect(closed.mock.calls).toEqual([[n.id]]);
  q.push({ ...notice(), remainingMs: 100 }); vi.advanceTimersByTime(100); expect(ids(q)).toEqual([]);
  vi.useRealTimers();
});
