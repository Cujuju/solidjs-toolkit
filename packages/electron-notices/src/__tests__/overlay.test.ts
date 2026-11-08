import { afterEach, expect, it, vi } from 'vitest';
import { createNoticeOverlay } from '../overlay';
import { BASIC_TONES, DEFAULT_NOTICE_CONFIG, NOTICE_CHANNELS, type NoticeView } from '../types';
function setup(platform = 'win32') {
  const events: Record<string, () => void> = {};
  const w = { setBounds: vi.fn(), showInactive: vi.fn(), hide: vi.fn(), isVisible: () => false, isDestroyed: () => false,
    destroy: vi.fn(() => events.closed()), setAlwaysOnTop: vi.fn(), setVisibleOnAllWorkspaces: vi.fn(), setIgnoreMouseEvents: vi.fn(),
    on: (name: string, cb: () => void) => { events[name] = cb; },
    webContents: { send: vi.fn(), on: (name: string, cb: () => void) => { events[name] = cb; }, setWindowOpenHandler: vi.fn() } };
  const view: NoticeView = { config: { ...DEFAULT_NOTICE_CONFIG }, appearance: { vars: {} }, tones: BASIC_TONES };
  const createWindow = vi.fn(() => w), onOpen = vi.fn(), onAction = vi.fn();
  const area = { x: 0, y: 0, width: 1000, height: 800 };
  const overlay = createNoticeOverlay({ createWindow, primaryDisplay: () => ({ bounds: area, workArea: area }), view: () => view, platform, onOpen, onAction });
  return { overlay, w, view, events, createWindow, onOpen, onAction };
}
it('creates lazily, sends view before queued notices and resets on close', async () => {
  const { overlay, w, view, events, createWindow } = setup();
  overlay.refresh(); expect(createWindow).not.toHaveBeenCalled();
  const n = { id: 1, at: 0, pinned: false, title: 't', tone: 'info' as const };
  const result = overlay.show(n); expect(w.webContents.send).not.toHaveBeenCalled();
  events['did-finish-load']?.();
  expect(w.webContents.send).not.toHaveBeenCalled();
  overlay.ready();
  expect(w.webContents.send.mock.calls).toEqual([[NOTICE_CHANNELS.view, view, 'bottom-right'], [NOTICE_CHANNELS.notice, n]]);
  overlay.ack(1); expect(await result).toEqual({ delivered: true });
  overlay.resize(300, 100); expect(w.setBounds).toHaveBeenCalledWith({ x: 700, y: 700, width: 300, height: 100 });
  expect(w.showInactive).toHaveBeenCalled();
  overlay.resize(NaN, 100); expect(w.hide).toHaveBeenCalled();
  overlay.pointer(true); expect(w.setIgnoreMouseEvents).toHaveBeenLastCalledWith(false, { forward: true });
  overlay.pointer('true'); expect(w.setIgnoreMouseEvents).toHaveBeenLastCalledWith(true, { forward: true });
  overlay.destroy(); const again = overlay.show(n); expect(createWindow).toHaveBeenCalledTimes(2); overlay.destroy(); await again;
});
it.each(['darwin', 'linux'])('applies platform policy for %s and creates the resting lip', (platform) => {
  const { overlay, w, view, events } = setup(platform);
  view.config.style = 'drip'; view.config.dripLip = true; overlay.refresh();
  expect(w.setAlwaysOnTop).toHaveBeenCalledWith(true, 'screen-saver');
  expect(w.setVisibleOnAllWorkspaces).toHaveBeenCalledTimes(platform === 'darwin' ? 1 : 0);
  overlay.pointer(true); expect(w.setIgnoreMouseEvents).toHaveBeenCalledTimes(platform === 'linux' ? 0 : 2);
  expect(w.webContents.setWindowOpenHandler.mock.calls[0][0]()).toEqual({ action: 'deny' });
  overlay.ready(); overlay.refresh(); expect(w.webContents.send).toHaveBeenLastCalledWith(NOTICE_CHANNELS.view, view, 'top-center');
});

afterEach(() => vi.useRealTimers());
const notice = (id: number) => ({ id, at: 0, pinned: false, tone: 'info', title: 't' });
it('times out, withdraws and ignores late acknowledgments', async () => {
  vi.useFakeTimers(); const { overlay, w, events } = setup();
  const result = overlay.show(notice(1)); overlay.ready();
  vi.advanceTimersByTime(5000); expect(await result).toEqual({ delivered: false });
  expect(w.webContents.send).toHaveBeenLastCalledWith(NOTICE_CHANNELS.withdraw, { id: 1 });
  overlay.ack(1); overlay.ready();
  expect(w.webContents.send).toHaveBeenLastCalledWith(NOTICE_CHANNELS.view, expect.anything(), 'bottom-right'); overlay.destroy();
});
it('does not create an overlay for system delivery', async () => {
  const { overlay, view, createWindow } = setup(); view.config.delivery = 'system';
  expect(await overlay.show(notice(1))).toEqual({ delivered: false }); expect(createWindow).not.toHaveBeenCalled();
});
it('fails pending on renderer crash and replays delivered notices with time left', async () => {
  vi.useFakeTimers(); const { overlay, w, events, createWindow } = setup();
  const first = overlay.show(notice(1)); overlay.ready(); overlay.ack(1); await first;
  const pending = overlay.show(notice(2)); vi.advanceTimersByTime(1000); events['render-process-gone']();
  expect(await pending).toEqual({ delivered: false });
  const next = overlay.show(notice(3)); expect(createWindow).toHaveBeenCalledTimes(2);
  w.webContents.send.mockClear(); overlay.ready();
  expect(w.webContents.send.mock.calls).toEqual([
    [NOTICE_CHANNELS.view, expect.anything(), 'bottom-right'],
    [NOTICE_CHANNELS.notice, { ...notice(1), remainingMs: 5000 }], [NOTICE_CHANNELS.notice, notice(3)],
  ]); overlay.destroy(); await next;
});
it('withdraws live notices', async () => {
  const { overlay, w, events } = setup(); const result = overlay.show({ ...notice(1), key: 'a' }); overlay.ready();
  overlay.withdraw({ key: 'a' }); expect(await result).toEqual({ delivered: false });
  expect(w.webContents.send).toHaveBeenLastCalledWith(NOTICE_CHANNELS.withdraw, { key: 'a' }); overlay.destroy();
});
it('opens live ids and filters actions against the notice actions', async () => {
  const { overlay, events, onOpen, onAction } = setup();
  const n = { ...notice(1), actions: [{ id: 'retry', label: 'Retry' }] };
  const result = overlay.show(n); overlay.ready(); overlay.ack(1); await result;
  overlay.open('1'); overlay.open(99); overlay.open(1);
  overlay.action(1, 'bad'); overlay.action(99, 'retry'); overlay.action(1, 'retry');
  expect(onOpen.mock.calls).toEqual([[n]]); expect(onAction.mock.calls).toEqual([[n, 'retry']]);
  overlay.destroy();
});

it('warms once and owns only its live window sender', () => {
  const { overlay, w, events, createWindow } = setup();
  expect(overlay.owns(w.webContents)).toBe(false);
  overlay.warm(); overlay.warm();
  expect(createWindow).toHaveBeenCalledOnce();
  expect(overlay.owns(w.webContents)).toBe(true);
  expect(overlay.owns({})).toBe(false);
  events.closed();
  expect(overlay.owns(w.webContents)).toBe(false);
  overlay.destroy();
});
