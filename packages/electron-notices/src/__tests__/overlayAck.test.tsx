import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { batch, createSignal } from 'solid-js';
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

describe('overlay root attribute', () => {
  const stubResizeObserver = () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    onTestFinished(() => { vi.unstubAllGlobals(); });
  };

  it('sets data-cuj-notices-overlay while a non-inline overlay is mounted and ref-counts overlapping mounts', () => {
    stubResizeObserver();
    const hostA = createLocalNoticeHost({ view: () => view });
    const hostB = createLocalNoticeHost({ view: () => view });
    expect(document.documentElement.hasAttribute('data-cuj-notices-overlay')).toBe(false);

    const a = render(() => <NoticeOverlay bridge={hostA.bridge} />);
    expect(document.documentElement.hasAttribute('data-cuj-notices-overlay')).toBe(true);

    const b = render(() => <NoticeOverlay bridge={hostB.bridge} />);
    expect(document.documentElement.hasAttribute('data-cuj-notices-overlay')).toBe(true);

    a.unmount();
    expect(document.documentElement.hasAttribute('data-cuj-notices-overlay')).toBe(true);

    b.unmount();
    expect(document.documentElement.hasAttribute('data-cuj-notices-overlay')).toBe(false);
  });

  it('never sets data-cuj-notices-overlay for inline overlays', () => {
    const host = createLocalNoticeHost({ view: () => view });
    const inline = render(() => <NoticeOverlay bridge={host.bridge} inline />);
    expect(document.documentElement.hasAttribute('data-cuj-notices-overlay')).toBe(false);
    inline.unmount();
    expect(document.documentElement.hasAttribute('data-cuj-notices-overlay')).toBe(false);
  });

  it('starts and stops overlay watchers alongside the root attribute when inline toggles', () => {
    let observed = 0;
    let disconnected = 0;
    vi.stubGlobal('ResizeObserver', class {
      observe() { observed += 1; }
      disconnect() { disconnected += 1; }
    });
    onTestFinished(() => { vi.unstubAllGlobals(); });
    const resize = vi.fn();
    const bridge = { ...createLocalNoticeHost({ view: () => view }).bridge, resize };
    const [inline, setInline] = createSignal(true);

    render(() => <NoticeOverlay bridge={bridge} inline={inline()} />);
    expect(document.documentElement.hasAttribute('data-cuj-notices-overlay')).toBe(false);
    expect(observed).toBe(0);
    expect(resize).not.toHaveBeenCalled();

    setInline(false);
    expect(document.documentElement.hasAttribute('data-cuj-notices-overlay')).toBe(true);
    expect(observed).toBe(1);
    expect(resize).toHaveBeenCalledTimes(1);

    setInline(true);
    expect(document.documentElement.hasAttribute('data-cuj-notices-overlay')).toBe(false);
    expect(disconnected).toBe(1);
  });

  it('marks the rendered document root rather than the parent document when mounted into another document', () => {
    stubResizeObserver();
    const childDoc = document.implementation.createHTMLDocument('child');
    const mount = childDoc.createElement('div');
    childDoc.body.appendChild(mount);
    const host = createLocalNoticeHost({ view: () => view });

    const mounted = render(() => <NoticeOverlay bridge={host.bridge} />, { container: mount });
    expect(document.documentElement.hasAttribute('data-cuj-notices-overlay')).toBe(false);
    expect(childDoc.documentElement.hasAttribute('data-cuj-notices-overlay')).toBe(true);

    mounted.unmount();
    expect(childDoc.documentElement.hasAttribute('data-cuj-notices-overlay')).toBe(false);
  });

  it('follows live attach and detach transitions without remounting', async () => {
    stubResizeObserver();
    const mount = document.createElement('div');
    const host = createLocalNoticeHost({ view: () => view });

    const mounted = render(() => <NoticeOverlay bridge={host.bridge} />, { container: mount });
    expect(document.documentElement.hasAttribute('data-cuj-notices-overlay')).toBe(false);

    document.body.appendChild(mount);
    await Promise.resolve();
    expect(document.documentElement.hasAttribute('data-cuj-notices-overlay')).toBe(true);

    mount.remove();
    await Promise.resolve();
    expect(document.documentElement.hasAttribute('data-cuj-notices-overlay')).toBe(false);

    mounted.unmount();
    expect(document.documentElement.hasAttribute('data-cuj-notices-overlay')).toBe(false);
  });

  it('follows cross-document moves and detaches from the new document', async () => {
    stubResizeObserver();
    const otherDoc = document.implementation.createHTMLDocument('other');
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const host = createLocalNoticeHost({ view: () => view });

    const mounted = render(() => <NoticeOverlay bridge={host.bridge} />, { container: mount });
    expect(document.documentElement.hasAttribute('data-cuj-notices-overlay')).toBe(true);
    expect(otherDoc.documentElement.hasAttribute('data-cuj-notices-overlay')).toBe(false);

    otherDoc.body.appendChild(mount);
    await Promise.resolve();
    expect(document.documentElement.hasAttribute('data-cuj-notices-overlay')).toBe(false);
    expect(otherDoc.documentElement.hasAttribute('data-cuj-notices-overlay')).toBe(true);

    mount.remove();
    await Promise.resolve();
    expect(otherDoc.documentElement.hasAttribute('data-cuj-notices-overlay')).toBe(false);

    mounted.unmount();
  });

  it('does not mark the host document when rendered inside a shadow root', () => {
    stubResizeObserver();
    const hostEl = document.createElement('div');
    document.body.appendChild(hostEl);
    const shadow = hostEl.attachShadow({ mode: 'open' });
    const mount = document.createElement('div');
    shadow.appendChild(mount);
    const host = createLocalNoticeHost({ view: () => view });

    const mounted = render(() => <NoticeOverlay bridge={host.bridge} />, { container: mount });
    expect(document.documentElement.hasAttribute('data-cuj-notices-overlay')).toBe(false);
    mounted.unmount();
    hostEl.remove();
  });

  it('reports pointer(false) when switching to inline while hovering a notice card', async () => {
    stubResizeObserver();
    const pointer = vi.fn();
    const host = createLocalNoticeHost({ view: () => view, ackTimeoutMs: ACK_TIMEOUT_MS });
    const bridge = { ...host.bridge, pointer };
    const [inline, setInline] = createSignal(false);

    const { container } = render(() => <NoticeOverlay bridge={bridge} inline={inline()} />);
    await expect(host.show({ ...notice(9), durationMs: 0 })).resolves.toEqual({ delivered: true });
    const card = container.querySelector('.cuj-notices-card')!;
    card.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    expect(pointer).toHaveBeenLastCalledWith(true);

    setInline(true);
    expect(pointer).toHaveBeenLastCalledWith(false);
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
