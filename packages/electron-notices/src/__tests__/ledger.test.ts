import { afterEach, expect, it, vi } from 'vitest';
import { createNoticeLedger } from '../_internal/ledger';
import { BASIC_TONES, DEFAULT_NOTICE_CONFIG, MAX_KEPT_NOTICES } from '../types';

afterEach(() => vi.useRealTimers());
it.each(['ack', 'timeout', 'withdraw', 'gone', 'destroy'] as const)('settles superseded pending deliveries with the replacement on %s', async (end) => {
  vi.useFakeTimers();
  const ledger = createNoticeLedger({
    view: () => ({ config: DEFAULT_NOTICE_CONFIG, appearance: { vars: {} }, tones: BASIC_TONES }),
    ackTimeoutMs: 1000, send: vi.fn(), withdraw: vi.fn(),
  });
  const notice = (id: number) => ({ id, at: 0, pinned: false, title: 't', tone: 'info', key: 'connection' });
  const settled = vi.fn();
  const first = ledger.show(notice(1)); first.then(settled);
  vi.advanceTimersByTime(500);
  const second = ledger.show(notice(2));
  vi.advanceTimersByTime(500);
  const third = ledger.show(notice(3));
  ledger.ack(1); ledger.closed(1);
  await Promise.resolve();
  expect(settled).not.toHaveBeenCalled();
  if (end === 'ack') ledger.ack(3);
  else if (end === 'timeout') vi.advanceTimersByTime(1000);
  else if (end === 'withdraw') ledger.withdraw({ key: 'connection' });
  else ledger[end]();
  expect(await Promise.all([first, second, third])).toEqual(Array.from({ length: 3 }, () => ({ delivered: end === 'ack' })));
  ledger.destroy();
});


it.each(['closed', 'withdraw', 'timeout', 'eviction', 'replace', 'gone', 'destroy', 'expired'] as const)('calls onClose exactly once per entry dropped by %s', async (path) => {
  vi.useFakeTimers();
  const onClose = vi.fn();
  const ledger = createNoticeLedger({
    view: () => ({ config: DEFAULT_NOTICE_CONFIG, appearance: { vars: {} }, tones: BASIC_TONES }),
    ackTimeoutMs: 1000, send: vi.fn(), withdraw: vi.fn(), onClose,
  });
  const notice = (id: number) => ({ id, at: 0, pinned: false, title: 't', tone: 'info' });
  const first = { ...notice(1), key: 'replace' };
  const result = ledger.show(first);
  if (path === 'closed') ledger.closed(1);
  else if (path === 'withdraw') ledger.withdraw({ id: 1 });
  else if (path === 'timeout') vi.advanceTimersByTime(1000);
  else if (path === 'replace') void ledger.show({ ...notice(2), key: first.key });
  else if (path === 'eviction') {
    for (let id = 2; id <= MAX_KEPT_NOTICES + 1; id++) void ledger.show(notice(id));
  } else if (path === 'expired') {
    ledger.ack(1); vi.advanceTimersByTime(DEFAULT_NOTICE_CONFIG.durationMs); ledger.replay();
  } else ledger[path]();
  expect(onClose.mock.calls.filter(([n]) => n.id === 1)).toEqual([[first]]);
  ledger.closed(1); ledger.withdraw({ id: 1 }); ledger.gone(); ledger.destroy();
  vi.runAllTimers();
  expect(onClose.mock.calls.filter(([n]) => n.id === 1)).toEqual([[first]]);
  await result;
});
