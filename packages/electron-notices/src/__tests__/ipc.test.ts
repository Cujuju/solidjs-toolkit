import { expect, it, vi } from 'vitest';
import { createNoticeBridge, handleNoticeIpc } from '../ipc';
import { NOTICE_CHANNELS } from '../types';
it('bridges events, unsubscribe and fire-and-forget invokes', async () => {
  const ipc = { on: vi.fn(), removeListener: vi.fn(), invoke: vi.fn().mockRejectedValue(new Error('closed')) };
  const bridge = createNoticeBridge(ipc), cb = vi.fn();
  const off = bridge.onNotice(cb);
  ipc.on.mock.calls[0][1](null, { id: 1 });
  expect(cb).toHaveBeenCalledWith({ id: 1 });
  off(); expect(ipc.removeListener).toHaveBeenCalledWith(NOTICE_CHANNELS.notice, ipc.on.mock.calls[0][1]);
  bridge.onView(cb); expect(ipc.on.mock.calls[1][0]).toBe(NOTICE_CHANNELS.view);
  bridge.resize(10, 20); bridge.pointer(true); bridge.open('target');
  expect(ipc.invoke.mock.calls).toEqual([[NOTICE_CHANNELS.resize, 10, 20], [NOTICE_CHANNELS.pointer, true], [NOTICE_CHANNELS.open, 'target']]);
  await Promise.resolve();
});
it('routes main IPC and rejects non-string targets', () => {
  const handle = vi.fn(), open = vi.fn();
  const overlay = { resize: vi.fn(), pointer: vi.fn(), refresh: vi.fn(), show: vi.fn(), destroy: vi.fn() };
  handleNoticeIpc({ handle }, overlay, open);
  handle.mock.calls[0][1](null, 10, 20); handle.mock.calls[1][1](null, true);
  handle.mock.calls[2][1](null, 'target'); handle.mock.calls[2][1](null, {});
  expect(overlay.resize).toHaveBeenCalledWith(10, 20);
  expect(overlay.pointer).toHaveBeenCalledWith(true);
  expect(open.mock.calls).toEqual([['target'], [undefined]]);
});
