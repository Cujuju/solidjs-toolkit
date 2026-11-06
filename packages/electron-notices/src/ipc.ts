import { NOTICE_CHANNELS, type Notice, type NoticeBridge, type NoticeView } from './types';
import type { NoticeOverlay } from './overlay';
export interface IpcMainLike { handle(channel: string, listener: (event: unknown, ...args: unknown[]) => unknown): void }
export function handleNoticeIpc(ipcMain: IpcMainLike, overlay: NoticeOverlay, open: (target: string | undefined) => void): void {
  ipcMain.handle(NOTICE_CHANNELS.resize, (_e, width, height) => overlay.resize(width, height));
  ipcMain.handle(NOTICE_CHANNELS.pointer, (_e, over) => overlay.pointer(over));
  ipcMain.handle(NOTICE_CHANNELS.open, (_e, target) => open(typeof target === 'string' ? target : undefined));
}
export interface IpcRendererLike {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  on(channel: string, listener: (event: unknown, ...args: unknown[]) => void): unknown;
  removeListener(channel: string, listener: (...args: any[]) => void): unknown;
}
export function createNoticeBridge(ipcRenderer: IpcRendererLike): NoticeBridge {
  function on<T>(channel: string, cb: (value: T) => void): () => void {
    const listener = (_event: unknown, ...args: unknown[]) => cb(args[0] as T);
    ipcRenderer.on(channel, listener);
    return () => { ipcRenderer.removeListener(channel, listener); };
  }
  const invoke = (channel: string, ...args: unknown[]) => { void ipcRenderer.invoke(channel, ...args).catch(() => undefined); };
  return {
    onNotice: (cb) => on<Notice>(NOTICE_CHANNELS.notice, cb),
    onView: (cb) => on<NoticeView>(NOTICE_CHANNELS.view, cb),
    resize: (width, height) => invoke(NOTICE_CHANNELS.resize, width, height),
    pointer: (over) => invoke(NOTICE_CHANNELS.pointer, over),
    open: (target) => invoke(NOTICE_CHANNELS.open, target),
  };
}
