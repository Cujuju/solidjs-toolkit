import { deliversTo, MAX_KEPT_NOTICES, noticeDuration, type Notice, type NoticeDeliveryResult, type NoticeRef, type NoticeView } from '../types';
import type { NoticeHostEvents } from '../overlay';
interface Entry {
  notice: Notice; delivered: boolean; deadline?: number;
  timer?: ReturnType<typeof setTimeout>; resolvers: Array<(result: NoticeDeliveryResult) => void>;
}
interface LedgerOptions extends NoticeHostEvents {
  view(): NoticeView; ackTimeoutMs: number; send(n: Notice): void; withdraw(ref: NoticeRef): void;
}
export function createNoticeLedger(o: LedgerOptions) {
  const entries = new Map<number, Entry>();
  function drop(id: number): void {
    const e = entries.get(id);
    if (!e) return;
    clearTimeout(e.timer); entries.delete(id);
    if (!e.delivered) for (const resolve of e.resolvers) resolve({ delivered: false });
  }
  function withdraw(ref: NoticeRef): void {
    for (const [id, e] of entries) if ('id' in ref ? id === ref.id : e.notice.key === ref.key) drop(id);
    o.withdraw(ref);
  }
  function deadline(e: Entry, ms: number): void { e.deadline = ms === 0 || e.notice.pinned ? undefined : Date.now() + ms; }
  return {
    show(n: Notice): Promise<NoticeDeliveryResult> {
      if (!deliversTo(o.view().config.delivery).overlay) return Promise.resolve({ delivered: false });
      const pending: Entry['resolvers'] = [];
      if (n.key !== undefined) for (const [id, e] of entries) if (e.notice.key === n.key) {
        if (!e.delivered) pending.push(...e.resolvers);
        clearTimeout(e.timer); entries.delete(id);
      }
      if (entries.size >= MAX_KEPT_NOTICES) {
        const oldest = [...entries.values()].find((e) => !e.notice.pinned) ?? entries.values().next().value!;
        withdraw({ id: oldest.notice.id });
      }
      return new Promise((resolve) => {
        const e: Entry = { notice: n, delivered: false, resolvers: [...pending, resolve] };
        entries.set(n.id, e);
        e.timer = setTimeout(() => withdraw({ id: n.id }), o.ackTimeoutMs);
        o.send(n);
      });
    },
    ack(id: unknown): void {
      const e = typeof id === 'number' ? entries.get(id) : undefined;
      if (!e || e.delivered) return;
      clearTimeout(e.timer); e.delivered = true;
      deadline(e, e.notice.remainingMs ?? noticeDuration(e.notice, o.view()));
      for (const resolve of e.resolvers) resolve({ delivered: true });
    },
    pin(id: unknown, pinned: unknown): void {
      const e = typeof id === 'number' ? entries.get(id) : undefined;
      if (!e || typeof pinned !== 'boolean') return;
      e.notice = { ...e.notice, pinned };
      deadline(e, noticeDuration(e.notice, o.view()));
    },
    closed(id: unknown): void { if (typeof id === 'number') drop(id); },
    open(id: unknown): void { const e = typeof id === 'number' ? entries.get(id) : undefined; if (e) o.onOpen?.(e.notice); },
    action(id: unknown, actionId: unknown): void {
      const e = typeof id === 'number' ? entries.get(id) : undefined;
      if (e && typeof actionId === 'string' && e.notice.actions?.some((a) => a.id === actionId)) o.onAction?.(e.notice, actionId);
    },
    withdraw,
    gone(): void { for (const [id, e] of entries) if (!e.delivered) drop(id); },
    replay(): void {
      const now = Date.now();
      for (const [id, e] of entries) {
        if (!e.delivered) continue;
        if (e.deadline !== undefined && e.deadline <= now) { drop(id); continue; }
        const { remainingMs: _remaining, ...n } = e.notice;
        o.send(e.deadline === undefined ? n : { ...n, remainingMs: e.deadline - now });
      }
      for (const e of entries.values()) if (!e.delivered) o.send(e.notice);
    },
    destroy(): void { for (const id of entries.keys()) drop(id); },
  };
}
