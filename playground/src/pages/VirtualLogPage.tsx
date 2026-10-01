import { createEffect, createSignal, onMount, type JSX } from 'solid-js';
import { createVirtualLog, VirtualLog } from '@cujuju/solidjs-virtual-log';
import { Code } from '../ui';

/** A synthetic chat: rows vary in length; some carry "media" that grows once loaded, as an unsized image does. */
type Msg = { key: string; n: number; text: string; mediaPx: number };

const TOTAL = 2000;
const PAGE = 100;
const WORDS = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore'.split(' ');

/** Deterministic per index, so a test can name rows. */
function msg(n: number): Msg {
  const words = 3 + ((n * 7919) % 40);
  const text = Array.from({ length: words }, (_, i) => WORDS[(n + i) % WORDS.length]).join(' ');
  return { key: `m${n}`, n, text, mediaPx: n % 5 === 0 ? 80 + ((n * 31) % 160) : 0 };
}

/** Media that has no size until it "loads", MEDIA_MS after it is drawn. */
function Media(props: { px: number; delayMs: number }): JSX.Element {
  const [loaded, setLoaded] = createSignal(false);
  onMount(() => setTimeout(() => setLoaded(true), props.delayMs));
  return <div data-media style={{ height: `${loaded() ? props.px : 0}px`, background: '#3a4a6a', 'border-radius': '6px', 'margin-top': '4px' }} />;
}

declare global {
  interface Window {
    __vlog?: ReturnType<typeof createVirtualLog<Msg>>;
    __vlogCtl?: { append: () => void; olderDelayMs: (ms: number) => void; mediaDelayMs: (ms: number) => void; following: (v: boolean) => void };
  }
}

export function VirtualLogPage(): JSX.Element {
  // The newest page, as a chat opens.
  const [oldest, setOldest] = createSignal(TOTAL - PAGE);
  const [newest, setNewest] = createSignal(TOTAL);
  const rows = () => Array.from({ length: newest() - oldest() }, (_, i) => msg(oldest() + i));
  let olderDelay = 300;
  let mediaDelay = 250;
  // Follows the newest row while the view is at it; a test can turn following off outright.
  const [followAllowed, setFollowAllowed] = createSignal(true);
  const [atNewest, setAtNewest] = createSignal(true);
  const following = (): boolean => followAllowed() && atNewest();

  const loadOlder = async (): Promise<void> => {
    if (oldest() === 0) return;
    await new Promise((r) => setTimeout(r, olderDelay));
    setOldest((o) => Math.max(0, o - PAGE));
  };
  const log = createVirtualLog<Msg>({
    rows,
    estimateSize: 44,
    endPadding: 12,
    hasOlder: () => oldest() > 0,
    loadOlder,
    following,
  });
  createEffect(() => setAtNewest(log.distanceFromBottom() < 2));
  window.__vlog = log;
  window.__vlogCtl = {
    append: () => setNewest((n) => n + 1),
    olderDelayMs: (ms) => (olderDelay = ms),
    mediaDelayMs: (ms) => (mediaDelay = ms),
    following: setFollowAllowed,
  };

  return (
    <>
      <h1>@cujuju/solidjs-virtual-log</h1>
      <p class="note">
        A bottom-anchored log: {TOTAL} synthetic messages, paged {PAGE} at a time (older pages arrive after a delay), and
        every fifth row carries media that grows when it "loads". Scroll, fling, and append: the rows you are reading
        should never move on their own.
      </p>
      <Code cap="usage">{`
const log = createVirtualLog({ rows, estimateSize: 44, hasOlder, loadOlder, following });
<div ref={log.ref} style={{ height: '480px', 'overflow-y': 'auto' }}>
  <VirtualLog log={log}>{(row) => <Message msg={row()} />}</VirtualLog>
</div>`}</Code>
      <div style={{ display: 'flex', gap: '8px', margin: '8px 0' }}>
        <button onClick={() => window.__vlogCtl!.append()}>Append</button>
        <button onClick={() => log.scrollToBottom()}>Newest</button>
        <button onClick={() => log.holdRow(`m${oldest() + 20}`)}>Hold an older row</button>
      </div>
      <div
        data-testid="vlog-scroller"
        ref={log.ref}
        style={{ height: '480px', width: '420px', 'overflow-y': 'auto', border: '1px solid #444', 'border-radius': '8px' }}
      >
        <VirtualLog log={log}>
          {(row) => (
            <div data-msg={row().n} style={{ padding: '6px 10px', 'border-bottom': '1px solid #2a2a2a', 'font-size': '14px', 'line-height': '1.4' }}>
              <b>#{row().n}</b> {row().text}
              {row().mediaPx > 0 && <Media px={row().mediaPx} delayMs={mediaDelay} />}
            </div>
          )}
        </VirtualLog>
      </div>
    </>
  );
}
