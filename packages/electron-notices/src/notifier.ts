import { deliversTo, type NoticeDelivery, type NoticeInput } from './types.js';
import type { NoticeSink } from './overlay.js';
export interface NotifierOptions { overlay: Pick<NoticeSink, 'show'>; delivery(): NoticeDelivery; system?(n: NoticeInput): void }
export function createNotifier(o: NotifierOptions): { notify(input: NoticeInput): Promise<{ id: number; delivered: boolean }> } {
  let nextId = 1;
  return { async notify(input) {
    const n = { ...input, id: nextId++, at: Date.now(), pinned: false };
    const to = deliversTo(o.delivery());
    if (to.system) o.system?.(input);
    const result = to.overlay ? await o.overlay.show(n) : { delivered: false };
    return { id: n.id, delivered: result.delivered };
  } };
}
