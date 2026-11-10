import { createNoticeLedger } from './_internal/ledger.js';
import { NOTICE_ACK_TIMEOUT_MS, type NoticeHostEvents, type NoticeSink } from './overlay.js';
import { resolvePlacement } from './placement.js';
import type { Notice, NoticeBridge, NoticePlacement, NoticeRef, NoticeView } from './types.js';
export interface LocalNoticeHostOptions extends NoticeHostEvents { view(): NoticeView; ackTimeoutMs?: number }
export interface LocalNoticeHost extends NoticeSink { bridge: NoticeBridge }
export function createLocalNoticeHost(o: LocalNoticeHostOptions): LocalNoticeHost {
  const notices = new Set<(n: Notice) => void>();
  const views = new Set<(v: NoticeView, placement: NoticePlacement) => void>();
  const withdrawals = new Set<(ref: NoticeRef) => void>();
  const ledger = createNoticeLedger({ ...o, ackTimeoutMs: o.ackTimeoutMs ?? NOTICE_ACK_TIMEOUT_MS,
    send: (n) => { for (const cb of notices) cb(n); },
    withdraw: (ref) => { for (const cb of withdrawals) cb(ref); },
  });
  const emitView = (cb: (v: NoticeView, placement: NoticePlacement) => void) => {
    const v = o.view(); cb(v, resolvePlacement(v.config.style, v.config.position));
  };
  return {
    show: ledger.show, withdraw: ledger.withdraw,
    refresh() { for (const cb of views) emitView(cb); },
    destroy() { ledger.destroy(); notices.clear(); views.clear(); withdrawals.clear(); },
    bridge: {
      onNotice(cb) { const remount = notices.size === 0; notices.add(cb); if (remount) ledger.replay(); return () => { notices.delete(cb); }; },
      onView(cb) { views.add(cb); emitView(cb); return () => { views.delete(cb); }; },
      onWithdraw(cb) { withdrawals.add(cb); return () => { withdrawals.delete(cb); }; },
      ready() {}, resize() {}, pointer() {}, ack: ledger.ack, open: ledger.open, action: ledger.action, pin: ledger.pin, closed: ledger.closed,
    },
  };
}
