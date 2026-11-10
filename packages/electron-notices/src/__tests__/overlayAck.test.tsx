import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { batch } from 'solid-js';
import { cleanup, render } from '@solidjs/testing-library';
import { createLocalNoticeHost } from '../local.js';
import { NoticeOverlay } from '../renderer/index.js';
import { BASIC_TONES, DEFAULT_NOTICE_CONFIG, type Notice, type NoticeView } from '../types.js';

const ACK_TIMEOUT_MS = 50;
const view: NoticeView = { config: DEFAULT_NOTICE_CONFIG, appearance: { vars: {} }, tones: BASIC_TONES };
const notice = (id: number, kind?: string): Notice => ({
  id, at: 0, pinned: false, title: `n${id}`, tone: 'info', ...(kind ? { content: { kind, data: null } } : {}),
});
const Throws = (): never => { throw new Error('renderer failed'); };

afterEach(cleanup);

describe('renderer acknowledgment', () => {
  it('acks a notice shown inside batch() once it is on the page', async () => {
    const host = createLocalNoticeHost({ view: () => view, ackTimeoutMs: ACK_TIMEOUT_MS });
    render(() => <NoticeOverlay bridge={host.bridge} inline />);
    let result!: Promise<{ delivered: boolean }>;
    batch(() => { result = host.show(notice(1)); });
    await expect(result).resolves.toEqual({ delivered: true });
  });

  it('does not ack a notice whose content renderer throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const host = createLocalNoticeHost({ view: () => view, ackTimeoutMs: ACK_TIMEOUT_MS });
    render(() => <NoticeOverlay bridge={host.bridge} inline renderers={{ bad: Throws }} />);
    let result!: Promise<{ delivered: boolean }>;
    // The render error surfaces when the batch flushes.
    try { batch(() => { result = host.show(notice(2, 'bad')); }); } catch { /* expected */ }
    await expect(result).resolves.toEqual({ delivered: false });
  });
});

describe('work-area height', () => {
  const WORK_AREA_HEIGHT = 900;
  const bridgeWithHeight = () => ({
    ...createLocalNoticeHost({ view: () => view }).bridge,
    onView: (cb: (v: NoticeView, p: 'bottom-right', h?: number) => void) => { cb(view, 'bottom-right', WORK_AREA_HEIGHT); return () => undefined; },
  });
  const maxHeightVar = (c: HTMLElement) => (c.querySelector('.cuj-notices') as HTMLElement).style.getPropertyValue('--notice-overlay-max-height');

  it('caps the overlay window stack at the height main sends', () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    onTestFinished(() => { vi.unstubAllGlobals(); });
    const { container } = render(() => <NoticeOverlay bridge={bridgeWithHeight()} />);
    expect(maxHeightVar(container)).toBe(`${WORK_AREA_HEIGHT}px`);
  });

  it('leaves the inline stack to its viewport rule', () => {
    const { container } = render(() => <NoticeOverlay bridge={bridgeWithHeight()} inline />);
    expect(maxHeightVar(container)).toBe('');
  });
});

describe('delivery off', () => {
  it('retires notices, and turning delivery back on does not restore them', async () => {
    let current = view;
    const onClose = vi.fn();
    const host = createLocalNoticeHost({ view: () => current, ackTimeoutMs: ACK_TIMEOUT_MS, onClose });
    const { container } = render(() => <NoticeOverlay bridge={host.bridge} inline />);
    await expect(host.show({ ...notice(3), durationMs: 0 })).resolves.toEqual({ delivered: true });
    current = { ...view, config: { ...view.config, delivery: 'system' } };
    host.refresh();
    expect(onClose).toHaveBeenCalledWith(expect.objectContaining({ id: 3 }));
    current = view;
    host.refresh();
    expect(container.querySelector('[data-notice-id="3"]')).toBeNull();
  });
});
