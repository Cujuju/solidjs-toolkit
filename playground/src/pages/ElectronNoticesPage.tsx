import { createEffect, createSignal, For, on, onCleanup, type JSX } from 'solid-js';
import {
  BASIC_TONES, createLocalNoticeHost, createNotifier, DEFAULT_NOTICE_CONFIG, NOTICE_STYLES, type NoticeStyle, type NoticeView,
} from '@cujuju/electron-notices';
import { NoticeOverlay } from '@cujuju/electron-notices/renderer';
import '@cujuju/electron-notices/styles.css';
import { Card, Code, createEventLog, EventLog } from '../ui';

/** Live inline demo: `createLocalNoticeHost` stands in for the overlay window and its IPC bridge. */

const USAGE = `
import { createLocalNoticeHost, createNotifier } from '@cujuju/electron-notices';
import { NoticeOverlay } from '@cujuju/electron-notices/renderer';
const host = createLocalNoticeHost({ view: () => currentView, onOpen, onAction });
const notifier = createNotifier({ overlay: host, delivery: () => 'overlay' });
<NoticeOverlay bridge={host.bridge} inline />;
await notifier.notify({ title: 'Saved', tone: 'ok' });
`;

export function ElectronNoticesPage(): JSX.Element {
  const events = createEventLog();
  const [style, setStyle] = createSignal<NoticeStyle>(DEFAULT_NOTICE_CONFIG.style);
  const view = (): NoticeView => ({ config: { ...DEFAULT_NOTICE_CONFIG, style: style() }, appearance: { vars: {} }, tones: BASIC_TONES });
  const host = createLocalNoticeHost({
    view,
    onOpen: (n) => events.log('onOpen', n.title),
    onAction: (n, actionId) => events.log('onAction', { title: n.title, actionId }),
    onClose: (n) => events.log('onClose', n.title),
  });
  const notifier = createNotifier({ overlay: host, delivery: () => 'overlay' });
  onCleanup(() => host.destroy());
  createEffect(on(style, () => host.refresh(), { defer: true }));

  let sent = 0;
  const notify = (tone: string): void => {
    sent += 1;
    void notifier
      .notify({ title: `${tone} notice ${sent}`, body: 'Click the card to open it.', tone, pinnable: true, actions: [{ id: 'retry', label: 'Retry' }] })
      .then((result) => events.log('notify', { tone, delivered: result.delivered }));
  };

  return (
    <>
      <h1>@cujuju/electron-notices</h1>
      <p class="note">
        Notification surfaces for Electron: Tray drip, Top drip and Console. In an app window they render inline, fixed to
        the viewport, which is what this page shows. The overlay window and system delivery need Electron's main process.
      </p>
      <Card cap="Send a notice in each tone. Errors stay until dismissed; hover pauses the timers. Switch the style to compare surfaces.">
        <div style={{ display: 'flex', 'flex-direction': 'column', gap: '8px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <For each={Object.keys(BASIC_TONES)}>{(tone) => <button class="demo-btn" onClick={() => notify(tone)}>{tone}</button>}</For>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <For each={NOTICE_STYLES}>{(option) => (
              <label><input type="radio" name="notice-style" checked={style() === option} onChange={() => setStyle(option)} /> {option}</label>
            )}</For>
          </div>
        </div>
      </Card>
      <NoticeOverlay bridge={host.bridge} inline label="Playground" />
      <EventLog log={events} />
      <Code cap="usage">{USAGE}</Code>
    </>
  );
}
