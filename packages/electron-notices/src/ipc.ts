import { NOTICE_CHANNELS, type Notice, type NoticeBridge, type NoticePlacement, type NoticeRef, type NoticeView } from './types';
import type { NoticeOverlay } from './overlay';
export interface IpcMainLike { handle(channel: string, listener: (event: unknown, ...args: unknown[]) => unknown): void }
export function handleNoticeIpc(ipcMain: IpcMainLike, overlay: NoticeOverlay): void {
  ipcMain.handle(NOTICE_CHANNELS.resize, (_e, width, height) => overlay.resize(width, height));
  ipcMain.handle(NOTICE_CHANNELS.pointer, (_e, over) => overlay.pointer(over));
  ipcMain.handle(NOTICE_CHANNELS.ack, (_e, id) => overlay.ack(id));
  ipcMain.handle(NOTICE_CHANNELS.open, (_e, id) => overlay.open(id));
  ipcMain.handle(NOTICE_CHANNELS.action, (_e, id, actionId) => overlay.action(id, actionId));
  ipcMain.handle(NOTICE_CHANNELS.pin, (_e, id, pinned) => overlay.pin(id, pinned));
  ipcMain.handle(NOTICE_CHANNELS.closed, (_e, id) => overlay.closed(id));
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
    onNotice: (cb) => on<[Notice]>(NOTICE_CHANNELS.notice, cb),
    onView: (cb) => on<[NoticeView, NoticePlacement]>(NOTICE_CHANNELS.view, cb),
    onWithdraw: (cb) => on<[NoticeRef]>(NOTICE_CHANNELS.withdraw, cb),
    resize: (width, height) => invoke(NOTICE_CHANNELS.resize, width, height),
    pointer: (over) => invoke(NOTICE_CHANNELS.pointer, over),
    ack: (id) => invoke(NOTICE_CHANNELS.ack, id),
    open: (id) => invoke(NOTICE_CHANNELS.open, id),
    action: (id, actionId) => invoke(NOTICE_CHANNELS.action, id, actionId),
    pin: (id, pinned) => invoke(NOTICE_CHANNELS.pin, id, pinned),
    closed: (id) => invoke(NOTICE_CHANNELS.closed, id),
  };
}
