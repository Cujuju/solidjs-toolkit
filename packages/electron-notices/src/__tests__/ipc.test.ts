import { expect, it, vi } from 'vitest';
import { createNoticeBridge, handleNoticeIpc } from '../ipc';
import { NOTICE_CHANNELS } from '../types';
it('bridges all channels and unsubscribes', async () => {
  const ipc = { on: vi.fn(), removeListener: vi.fn(), invoke: vi.fn().mockRejectedValue(new Error('closed')) };
  const b = createNoticeBridge(ipc), cb = vi.fn();
  const off = b.onNotice(cb); ipc.on.mock.calls[0][1](null, { id: 1 }); expect(cb).toHaveBeenLastCalledWith({ id: 1 });
  off(); expect(ipc.removeListener).toHaveBeenCalledWith(NOTICE_CHANNELS.notice, ipc.on.mock.calls[0][1]);
  b.onView(cb); ipc.on.mock.calls[1][1](null, {}, 'top-center'); expect(cb).toHaveBeenLastCalledWith({}, 'top-center');
  b.onWithdraw(cb); ipc.on.mock.calls[2][1](null, { key: 'a' }); expect(cb).toHaveBeenLastCalledWith({ key: 'a' });
  b.ready(); b.resize(10, 20); b.pointer(true); b.ack(1); b.open(1); b.action(1, 'a'); b.pin(1, true); b.closed(1);
  expect(ipc.invoke.mock.calls).toEqual([
    ['notices:ready'], ['notices:resize', 10, 20], ['notices:pointer', true], ['notices:ack', 1], ['notices:open', 1],
    ['notices:action', 1, 'a'], ['notices:pin', 1, true], ['notices:closed', 1],
  ]); await Promise.resolve();
});
it('routes main IPC methods only for the overlay sender', () => {
  const owner = {};
  const overlay = { ready: vi.fn(), resize: vi.fn(), pointer: vi.fn(), ack: vi.fn(), open: vi.fn(), action: vi.fn(), pin: vi.fn(), closed: vi.fn(),
    warm: vi.fn(), owns: (sender: unknown) => sender === owner, refresh: vi.fn(), show: vi.fn(), withdraw: vi.fn(), destroy: vi.fn() };
  const handle = vi.fn(); handleNoticeIpc({ handle }, overlay);
  for (const [channel, listener] of handle.mock.calls) {
    listener({}, 1, 'a');
    const method = channel.split(':')[1] as 'resize';
    expect(overlay[method]).not.toHaveBeenCalled();
    listener({ sender: {} }, 1, 'a');
    expect(overlay[method]).not.toHaveBeenCalled();
    listener({ sender: owner }, 1, 'a');
    expect(overlay[method]).toHaveBeenCalled();
  }
});
