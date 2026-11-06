import { expect, it, vi } from 'vitest';
import { createNoticeOverlay } from '../overlay';
import { DEFAULT_NOTICE_CONFIG, NOTICE_CHANNELS, type NoticeView } from '../types';
function setup(platform = 'win32') {
  const events: Record<string, () => void> = {};
  const w = { setBounds: vi.fn(), showInactive: vi.fn(), hide: vi.fn(), isVisible: () => false, isDestroyed: () => false,
    destroy: vi.fn(() => events.closed()), setAlwaysOnTop: vi.fn(), setVisibleOnAllWorkspaces: vi.fn(), setIgnoreMouseEvents: vi.fn(),
    on: (name: string, cb: () => void) => { events[name] = cb; },
    webContents: { send: vi.fn(), on: (name: string, cb: () => void) => { events[name] = cb; }, setWindowOpenHandler: vi.fn() } };
  const view: NoticeView = { config: { ...DEFAULT_NOTICE_CONFIG }, appearance: { vars: {} } };
  const createWindow = vi.fn(() => w);
  const area = { x: 0, y: 0, width: 1000, height: 800 };
  const overlay = createNoticeOverlay({ createWindow, primaryDisplay: () => ({ bounds: area, workArea: area }), view: () => view, platform });
  return { overlay, w, view, events, createWindow };
}
it('creates lazily, sends view before queued notices and resets on close', () => {
  const { overlay, w, view, events, createWindow } = setup();
  overlay.refresh(); expect(createWindow).not.toHaveBeenCalled();
  const n = { id: 1, at: 0, title: 't', tone: 'info' as const };
  overlay.show(n); expect(w.webContents.send).not.toHaveBeenCalled();
  events['did-finish-load']();
  expect(w.webContents.send.mock.calls).toEqual([[NOTICE_CHANNELS.view, view], [NOTICE_CHANNELS.notice, n]]);
  overlay.show(n); expect(w.webContents.send).toHaveBeenLastCalledWith(NOTICE_CHANNELS.notice, n);
  overlay.resize(300, 100); expect(w.setBounds).toHaveBeenCalledWith({ x: 700, y: 700, width: 300, height: 100 });
  expect(w.showInactive).toHaveBeenCalled();
  overlay.resize(NaN, 100); expect(w.hide).toHaveBeenCalled();
  overlay.pointer(true); expect(w.setIgnoreMouseEvents).toHaveBeenLastCalledWith(false, { forward: true });
  overlay.pointer('true'); expect(w.setIgnoreMouseEvents).toHaveBeenLastCalledWith(true, { forward: true });
  overlay.destroy(); overlay.show(n); expect(createWindow).toHaveBeenCalledTimes(2);
});
it.each(['darwin', 'linux'])('applies platform policy for %s and creates the resting lip', (platform) => {
  const { overlay, w, view, events } = setup(platform);
  view.config.style = 'drip'; view.config.dripLip = true; overlay.refresh();
  expect(w.setAlwaysOnTop).toHaveBeenCalledWith(true, 'screen-saver');
  expect(w.setVisibleOnAllWorkspaces).toHaveBeenCalledTimes(platform === 'darwin' ? 1 : 0);
  overlay.pointer(true); expect(w.setIgnoreMouseEvents).toHaveBeenCalledTimes(platform === 'linux' ? 0 : 2);
  expect(w.webContents.setWindowOpenHandler.mock.calls[0][0]()).toEqual({ action: 'deny' });
  events['did-finish-load'](); overlay.refresh(); expect(w.webContents.send).toHaveBeenLastCalledWith(NOTICE_CHANNELS.view, view);
});
