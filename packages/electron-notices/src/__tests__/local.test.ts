import { afterEach, expect, it, vi } from 'vitest';
import { createLocalNoticeHost } from '../local.js';
import { BASIC_TONES, DEFAULT_NOTICE_CONFIG, type Notice } from '../types.js';
const view = () => ({ config: DEFAULT_NOTICE_CONFIG, tones: BASIC_TONES, appearance: { vars: {} } });
const notice = (id: number): Notice => ({ id, at: 0, title: 't', tone: 'info', pinned: false });
afterEach(() => vi.useRealTimers());
it('holds pending notices until subscribe and replays remaining time on remount', async () => {
  vi.useFakeTimers(); const h = createLocalNoticeHost({ view });
  const result = h.show(notice(1)); const received = vi.fn((n: Notice) => h.bridge.ack(n.id));
  h.bridge.ready();
  const off = h.bridge.onNotice(received); expect(await result).toEqual({ delivered: true }); off();
  vi.advanceTimersByTime(1000); h.bridge.onNotice(received);
  expect(received).toHaveBeenLastCalledWith({ ...notice(1), remainingMs: 5000 });
  const v = vi.fn(); h.bridge.onView(v); h.refresh(); expect(v).toHaveBeenCalledTimes(2);
  expect(v).toHaveBeenLastCalledWith(view(), 'bottom-right'); h.destroy();
});
it('filters actions, opens live entries, and preserves pin state on replay', async () => {
  vi.useFakeTimers(); const onAction = vi.fn(), onOpen = vi.fn(), h = createLocalNoticeHost({ view, onAction, onOpen });
  let off = h.bridge.onNotice((n) => h.bridge.ack(n.id));
  const n = { ...notice(1), actions: [{ id: 'retry', label: 'Retry' }] }; await h.show(n);
  h.bridge.action(1, 'bad'); h.bridge.action(2, 'retry'); h.bridge.action(1, 'retry'); h.bridge.open(1);
  expect(onAction.mock.calls).toEqual([[n, 'retry']]); expect(onOpen).toHaveBeenCalledWith(n);
  h.bridge.pin(1, true); off(); vi.advanceTimersByTime(10000);
  const received = vi.fn(); off = h.bridge.onNotice(received);
  expect(received).toHaveBeenLastCalledWith({ ...n, pinned: true });
  h.bridge.pin(1, false); off(); vi.advanceTimersByTime(1000); h.bridge.onNotice(received);
  expect(received).toHaveBeenLastCalledWith({ ...n, remainingMs: 5000 }); h.destroy();
});
