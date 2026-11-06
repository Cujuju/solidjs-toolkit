import { NOTICE_CHANNELS, deliversTo, type Notice, type NoticeView } from './types';
import { overlayBounds, type Rect, type DisplayArea } from './placement';

export const OVERLAY_WINDOW_OPTIONS = {
  width: 1, height: 1, show: false, frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false,
  resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false,
  focusable: false, skipTaskbar: true, alwaysOnTop: true,
};
export interface OverlayWindow {
  setBounds(bounds: Rect): void;
  showInactive(): void;
  hide(): void;
  isVisible(): boolean;
  isDestroyed(): boolean;
  destroy(): void;
  setAlwaysOnTop(flag: boolean, level: 'screen-saver'): void;
  setVisibleOnAllWorkspaces(flag: boolean, opts: { visibleOnFullScreen: boolean }): void;
  setIgnoreMouseEvents(ignore: boolean, opts: { forward: boolean }): void;
  on(event: 'closed', listener: () => void): unknown;
  webContents: {
    send(channel: string, ...args: unknown[]): void;
    on(event: 'did-finish-load', listener: () => void): unknown;
    setWindowOpenHandler(handler: () => { action: 'deny' }): void;
  };
}
export interface NoticeOverlayOptions { createWindow(): OverlayWindow; primaryDisplay(): DisplayArea; view(): NoticeView; platform: string }
export interface NoticeOverlay {
  refresh(): void;
  show(n: Notice): void;
  resize(width: unknown, height: unknown): void;
  pointer(over: unknown): void;
  destroy(): void;
}
export function createNoticeOverlay(o: NoticeOverlayOptions): NoticeOverlay {
  let win: OverlayWindow | null = null;
  let loaded = false;
  const queued: Notice[] = [];
  let content = { width: 0, height: 0 };
  const live = () => win && !win.isDestroyed() ? win : null;
  function create(): OverlayWindow {
    const w = o.createWindow();
    w.setAlwaysOnTop(true, 'screen-saver');
    if (o.platform === 'darwin') w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    if (o.platform !== 'linux') w.setIgnoreMouseEvents(true, { forward: true });
    w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    w.webContents.on('did-finish-load', () => {
      loaded = true;
      w.webContents.send(NOTICE_CHANNELS.view, o.view());
      for (const n of queued.splice(0)) w.webContents.send(NOTICE_CHANNELS.notice, n);
    });
    w.on('closed', () => { win = null; loaded = false; content = { width: 0, height: 0 }; });
    return w;
  }
  const ensure = () => live() ?? (win = create());
  function place(): void {
    const w = live();
    if (!w) return;
    if (content.width <= 0 || content.height <= 0) { w.hide(); return; }
    w.setBounds(overlayBounds(o.view().config.style, content, o.primaryDisplay()));
    if (!w.isVisible()) w.showInactive();
  }
  return {
    refresh() {
      const n = o.view().config;
      if (deliversTo(n.delivery).overlay && n.style === 'drip' && n.dripLip) ensure();
      const w = live();
      if (w && loaded) w.webContents.send(NOTICE_CHANNELS.view, o.view());
      place();
    },
    show(n) { const w = ensure(); if (loaded) w.webContents.send(NOTICE_CHANNELS.notice, n); else queued.push(n); },
    resize(width, height) {
      const valid = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0;
      content = { width: valid(width), height: valid(height) };
      place();
    },
    pointer(over) { if (o.platform !== 'linux') live()?.setIgnoreMouseEvents(!(over === true), { forward: true }); },
    destroy() { live()?.destroy(); },
  };
}
