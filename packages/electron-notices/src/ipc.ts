import { NOTICE_CHANNELS, type Notice, type NoticeBridge, type NoticePlacement, type NoticeRef, type NoticeView } from './types.js';
import type { NoticeOverlay } from './overlay.js';
import type { Rect } from './placement.js';
export interface IpcMainLike { handle(channel: string, listener: (event: { sender?: unknown }, ...args: unknown[]) => unknown): void }
export function handleNoticeIpc(ipcMain: IpcMainLike, overlay: NoticeOverlay): void {
  ipcMain.handle(NOTICE_CHANNELS.ready, (e) => { if (overlay.owns(e.sender)) overlay.ready(); });
  ipcMain.handle(NOTICE_CHANNELS.resize, (e, width, height, rects) => { if (overlay.owns(e.sender)) overlay.resize(width, height, rects); });
  ipcMain.handle(NOTICE_CHANNELS.pointer, (e, over) => { if (overlay.owns(e.sender)) overlay.pointer(over); });
  ipcMain.handle(NOTICE_CHANNELS.ack, (e, id) => { if (overlay.owns(e.sender)) overlay.ack(id); });
  ipcMain.handle(NOTICE_CHANNELS.open, (e, id) => { if (overlay.owns(e.sender)) overlay.open(id); });
  ipcMain.handle(NOTICE_CHANNELS.action, (e, id, actionId) => { if (overlay.owns(e.sender)) overlay.action(id, actionId); });
  ipcMain.handle(NOTICE_CHANNELS.pin, (e, id, pinned) => { if (overlay.owns(e.sender)) overlay.pin(id, pinned); });
  ipcMain.handle(NOTICE_CHANNELS.closed, (e, id) => { if (overlay.owns(e.sender)) overlay.closed(id); });
}
export interface IpcRendererLike {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  on(channel: string, listener: (event: unknown, ...args: unknown[]) => void): unknown;
  removeListener(channel: string, listener: (...args: unknown[]) => void): unknown;
}
export function createNoticeBridge(ipcRenderer: IpcRendererLike): NoticeBridge {
  function on<T extends unknown[]>(channel: string, cb: (...args: T) => void): () => void {
    const listener = (_event: unknown, ...args: unknown[]) => cb(...args as T);
    ipcRenderer.on(channel, listener);
    return () => { ipcRenderer.removeListener(channel, listener); };
  }
  const invoke = (channel: string, ...args: unknown[]) => { void ipcRenderer.invoke(channel, ...args).catch(() => undefined); };
  return {
    ready: () => invoke(NOTICE_CHANNELS.ready),
    onNotice: (cb) => on<[Notice]>(NOTICE_CHANNELS.notice, cb),
    onView: (cb) => on<[NoticeView, NoticePlacement, number?, boolean?]>(NOTICE_CHANNELS.view, cb),
    onWithdraw: (cb) => on<[NoticeRef]>(NOTICE_CHANNELS.withdraw, cb),
    resize: (width, height, rects?: Rect[]) =>
      rects ? invoke(NOTICE_CHANNELS.resize, width, height, rects) : invoke(NOTICE_CHANNELS.resize, width, height),
    pointer: (over) => invoke(NOTICE_CHANNELS.pointer, over),
    ack: (id) => invoke(NOTICE_CHANNELS.ack, id),
    open: (id) => invoke(NOTICE_CHANNELS.open, id),
    action: (id, actionId) => invoke(NOTICE_CHANNELS.action, id, actionId),
    pin: (id, pinned) => invoke(NOTICE_CHANNELS.pin, id, pinned),
    closed: (id) => invoke(NOTICE_CHANNELS.closed, id),
  };
}
