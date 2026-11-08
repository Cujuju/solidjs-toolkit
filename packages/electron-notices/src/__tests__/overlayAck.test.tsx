import { afterEach, describe, expect, it, vi } from 'vitest';
import { batch } from 'solid-js';
import { cleanup, render } from '@solidjs/testing-library';
import { createLocalNoticeHost } from '../local';
import { NoticeOverlay } from '../renderer';
import { BASIC_TONES, DEFAULT_NOTICE_CONFIG, type Notice, type NoticeView } from '../types';

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
