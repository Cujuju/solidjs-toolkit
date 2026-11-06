import { describe, expect, it, vi } from 'vitest';
import { createNotifier } from '../notifier';
import type { NoticeInput } from '../types';
const input: NoticeInput = { tone: 'error', target: 'proxy', title: 'Proxy stopped', body: 'Exit code 1', short: 'Proxy stopped' };
describe('notify', () => {
  it.each([['overlay', 0, 1], ['system', 1, 0], ['both', 1, 1]] as const)('%s delivery', (delivery, systemCount, overlayCount) => {
    const system = vi.fn(), show = vi.fn();
    createNotifier({ overlay: { show }, delivery: () => delivery, system }).notify(input);
    expect(system).toHaveBeenCalledTimes(systemCount);
    expect(show).toHaveBeenCalledTimes(overlayCount);
  });
  it('assigns consecutive ids and a timestamp', () => {
    const show = vi.fn();
    const n = createNotifier({ overlay: { show }, delivery: () => 'overlay' });
    n.notify(input); n.notify(input);
    expect(show.mock.calls[0][0]).toMatchObject({ ...input, id: 1, at: expect.any(Number) });
    expect(show.mock.calls[1][0].id).toBe(2);
  });
});
