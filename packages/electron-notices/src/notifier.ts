import { deliversTo, type NoticeDelivery, type NoticeInput } from './types';
import type { NoticeOverlay } from './overlay';
export interface NotifierOptions { overlay: Pick<NoticeOverlay, 'show'>; delivery(): NoticeDelivery; system?(n: NoticeInput): void }
export function createNotifier(o: NotifierOptions): { notify(input: NoticeInput): void } {
  let nextId = 1;
  return { notify(input) {
    const to = deliversTo(o.delivery());
    if (to.system) o.system?.(input);
    if (to.overlay) o.overlay.show({ ...input, id: nextId++, at: Date.now() });
  } };
}
