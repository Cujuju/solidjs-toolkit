import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'solid-js';
import { MAX_CONSOLE_LINES, type Notice, type NoticeTone } from '../types';
import { createNoticeQueue } from '../renderer/queue';

const VISIBLE_MS = 1000;
let nextId = 1;
const notice = (tone: NoticeTone = 'warn'): Notice => ({ id: nextId++, at: 0, tone, title: 't', body: 'b', short: 's', target: 'window' });
const ids = (q: ReturnType<typeof createNoticeQueue>) => q.items().map((n) => n.id);

describe('createNoticeQueue', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('expires notices but keeps errors until dismissed', () => createRoot((dispose) => {
    const q = createNoticeQueue(VISIBLE_MS);
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
    const q = createNoticeQueue(VISIBLE_MS);
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
    const q = createNoticeQueue(VISIBLE_MS);
    const pushed = Array.from({ length: MAX_CONSOLE_LINES + 2 }, () => notice('error'));
    for (const n of pushed) q.push(n);
    expect(ids(q)).toEqual(pushed.slice(-MAX_CONSOLE_LINES).map((n) => n.id));
    dispose();
  }));
});
