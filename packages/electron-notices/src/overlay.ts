import { NOTICE_CHANNELS, deliversTo, type Notice, type NoticeView, type NoticeDeliveryResult, type NoticeRef } from './types';
import { createNoticeLedger } from './_internal/ledger';
import { resolvePlacement, overlayBounds, type Rect, type DisplayArea } from './placement';

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
    on(event: 'did-finish-load' | 'render-process-gone', listener: () => void): unknown;
    setWindowOpenHandler(handler: () => { action: 'deny' }): void;
  };
}
/** Assumption: covers a cold overlay window create and page load; not measured. */
export const NOTICE_ACK_TIMEOUT_MS = 5000;
export interface NoticeSink {
  refresh(): void; show(n: Notice): Promise<NoticeDeliveryResult>; withdraw(ref: NoticeRef): void; destroy(): void;
}
export interface NoticeHostEvents { onOpen?(n: Notice): void; onAction?(n: Notice, actionId: string): void }
export interface NoticeOverlayOptions extends NoticeHostEvents {
  createWindow(): OverlayWindow; primaryDisplay(): DisplayArea; view(): NoticeView; platform: string; ackTimeoutMs?: number;
}
export interface NoticeOverlay extends NoticeSink {
  resize(w: unknown, h: unknown): void; pointer(over: unknown): void; ack(id: unknown): void;
  open(id: unknown): void; action(id: unknown, actionId: unknown): void;
  pin(id: unknown, pinned: unknown): void; closed(id: unknown): void;
}
export function createNoticeOverlay(o: NoticeOverlayOptions): NoticeOverlay {
  let win: OverlayWindow | null = null;
  let loaded = false;
  let content = { width: 0, height: 0 };
  const live = () => win && !win.isDestroyed() ? win : null;
  const placement = () => resolvePlacement(o.view().config.style, o.view().config.position, o.primaryDisplay());
  const ledger = createNoticeLedger({ ...o, ackTimeoutMs: o.ackTimeoutMs ?? NOTICE_ACK_TIMEOUT_MS,
    send: (n) => { if (loaded) live()?.webContents.send(NOTICE_CHANNELS.notice, n); },
    withdraw: (ref) => { if (loaded) live()?.webContents.send(NOTICE_CHANNELS.withdraw, ref); },
  });
  function sendView(): void { live()?.webContents.send(NOTICE_CHANNELS.view, o.view(), placement()); }
  function reset(w: OverlayWindow): void {
    if (win !== w) return;
    win = null; loaded = false; content = { width: 0, height: 0 };
    ledger.gone();
  }
  function create(): OverlayWindow {
    const w = o.createWindow();
    w.setAlwaysOnTop(true, 'screen-saver');
    if (o.platform === 'darwin') w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    if (o.platform !== 'linux') w.setIgnoreMouseEvents(true, { forward: true });
    w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    w.webContents.on('did-finish-load', () => {
      if (win !== w) return;
      loaded = true; sendView(); ledger.replay();
    });
    w.webContents.on('render-process-gone', () => { reset(w); if (!w.isDestroyed()) w.destroy(); });
    w.on('closed', () => reset(w));
    return w;
  }
  const ensure = () => live() ?? (win = create());
  function place(): void {
    const w = live();
    if (!w) return;
    if (content.width <= 0 || content.height <= 0) { w.hide(); return; }
    w.setBounds(overlayBounds(placement(), content, o.primaryDisplay()));
    if (!w.isVisible()) w.showInactive();
  }
  return {
    refresh() {
      const n = o.view().config;
      if (deliversTo(n.delivery).overlay && n.style === 'drip' && n.dripLip) ensure();
      if (live() && loaded) sendView();
      place();
    },
    show(n) {
      if (!deliversTo(o.view().config.delivery).overlay) return Promise.resolve({ delivered: false });
      ensure(); return ledger.show(n);
    },
    withdraw: ledger.withdraw, ack: ledger.ack, open: ledger.open, action: ledger.action, pin: ledger.pin, closed: ledger.closed,
    resize(width, height) {
      const valid = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0;
      content = { width: valid(width), height: valid(height) }; place();
    },
    pointer(over) { if (o.platform !== 'linux') live()?.setIgnoreMouseEvents(!(over === true), { forward: true }); },
    destroy() { ledger.destroy(); live()?.destroy(); },
  };
}
