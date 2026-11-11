import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@solidjs/testing-library';
import { createLocalNoticeHost } from '../local.js';
import { NoticeOverlay } from '../renderer/index.js';
import { BASIC_TONES, DEFAULT_NOTICE_CONFIG, type Notice, type NoticeView } from '../types.js';

const view: NoticeView = { config: DEFAULT_NOTICE_CONFIG, appearance: { vars: {}, iconPx: { glyph: 16, tool: 14 } }, tones: BASIC_TONES };
const LIFE_MS = 5000;
const Head = (p: { notice: Notice }) => <span data-testid="head">head {p.notice.title}</span>;
const Foot = () => <span data-testid="foot">Acct 1234</span>;
const Body = () => <span data-testid="body">legs</span>;
/** Host icons swap whole elements when the key changes, as an app's icon components do. */
const hostIcon = (name: string) => (p: { size?: number }) => <svg data-icon={name} width={p.size} height={p.size} />;
const ICONS = { pin: hostIcon('pin'), 'pin-off': hostIcon('pin-off') };
let nextId = 1;
const notice = (n: Omit<Notice, 'id' | 'at' | 'pinned'>): Notice => ({ id: nextId++, at: 0, pinned: false, ...n });
const order = (): Notice => notice({
  title: 'Order placed', tone: 'info', durationMs: LIFE_MS, content: { kind: 'order', data: null }, pinnable: true,
  actions: [{ id: 'view', label: 'View', icon: 'pin' }, { id: 'cancel', label: 'Cancel', variant: 'danger' }],
});

afterEach(cleanup);

const mount = (onAction = vi.fn()) => {
  const host = createLocalNoticeHost({ view: () => view, onAction });
  const r = render(() => <NoticeOverlay bridge={host.bridge} inline icons={ICONS} renderers={{ order: { head: Head, body: Body, foot: Foot } }} />);
  return { host, ...r, card: () => r.container.querySelector('.cuj-notices-card') as HTMLElement | null };
};

describe('tray card', () => {
  it('lets a content kind draw the head, body and footer meta', async () => {
    const { host, container, getByTestId } = mount();
    await host.show(order());
    expect(getByTestId('head').textContent).toBe('head Order placed');
    expect(container.querySelector('.cuj-notices-card-title')).toBeNull();
    expect(getByTestId('body')).toBeTruthy();
    expect(container.querySelector('.cuj-notices-card-meta')?.contains(getByTestId('foot'))).toBe(true);
  });

  it('draws danger actions as labelled buttons below the footer, the rest as footer tools', async () => {
    const onAction = vi.fn();
    const { host, container, card } = mount(onAction);
    await host.show(order());
    const button = container.querySelector('.cuj-notices-card-buttons .cuj-notices-action[data-variant="danger"]') as HTMLButtonElement;
    expect(button.textContent).toBe('Cancel');
    expect(container.querySelectorAll('.cuj-notices-card-tools .cuj-notices-tool')).toHaveLength(2);
    fireEvent.click(button);
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ title: 'Order placed' }), 'cancel');
    expect(card()).not.toBeNull();
  });

  it('opens the notice from a click anywhere off its controls', async () => {
    const { host, getByTestId, card } = mount();
    await host.show(order());
    fireEvent.click(getByTestId('body'));
    // It plays its exit before leaving the page.
    expect(card()?.hasAttribute('data-leaving')).toBe(true);
  });

  it('times a card\'s own fade from its duration; never-expiring and pinned cards do not fade', async () => {
    const { host, container, card } = mount();
    await host.show(order());
    expect(card()?.hasAttribute('data-life')).toBe(true);
    expect(card()?.style.getPropertyValue('--_life')).toBe(`${LIFE_MS}ms`);
    expect(card()?.style.getPropertyValue('--_spent')).toBe('0ms');
    // Click the icon: pinning swaps it, detaching the click target before the card sees the event.
    fireEvent.click(container.querySelector('[aria-label="Pin"] svg')!);
    expect(card()?.hasAttribute('data-leaving')).toBe(false);
    expect(card()?.hasAttribute('data-life')).toBe(false);
    expect(container.querySelector('[aria-label="Unpin"]')?.getAttribute('aria-pressed')).toBe('true');
    await host.show(notice({ title: 'sticky', tone: 'info', durationMs: 0 }));
    expect(container.querySelectorAll('.cuj-notices-card[data-life]')).toHaveLength(0);
  });

  it('stacks title over body without a clock time', async () => {
    const { host, container } = mount();
    await host.show(notice({ title: 'Streamer lost', body: 'Reconnecting', tone: 'warn' }));
    const text = container.querySelector('.cuj-notices-card-text')!;
    expect([...text.children].map((c) => c.className)).toEqual(['cuj-notices-card-title', 'cuj-notices-card-body']);
    expect(container.querySelector('.cuj-notices-time')).toBeNull();
  });
});
