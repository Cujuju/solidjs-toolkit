import { createSignal, Match, onCleanup, onMount, Show, Switch } from 'solid-js';
import { DEFAULT_NOTICE_CONFIG, deliversTo, type Notice, type NoticeBridge, type NoticeView } from '../types';
import { watchPointer, watchSize } from './_internal/overlayDom';
import { ConsoleTail } from './ConsoleTail';
import type { NoticeIcon } from './NoticeGlyph';
import { createNoticeQueue } from './queue';
import { TopDrip } from './TopDrip';
import { TrayDrip } from './TrayDrip';

/** Painted surfaces that take clicks; the window's transparent rest passes them through. */
const INTERACTIVE = '.cuj-notices-card, .cuj-notices-tray-more, .cuj-notices-console, .cuj-notices-drip';

export interface NoticeOverlayProps {
  /** The preload's bridge (createNoticeBridge). */
  bridge: NoticeBridge;
  /** Icon components keyed by NoticeInput.icon; notices without one get their tone's icon. */
  icons?: Record<string, NoticeIcon>;
  /** Console's header, such as the app's name. */
  label?: string;
}

/** The overlay page: renders the configured style and reports its size to main (zero hides the window). */
export function NoticeOverlay(props: NoticeOverlayProps) {
  const bridge = props.bridge;
  const [view, setView] = createSignal<NoticeView>({ config: DEFAULT_NOTICE_CONFIG, appearance: { vars: {} } });
  const [latest, setLatest] = createSignal<Notice | null>(null);
  const queue = createNoticeQueue();
  onCleanup(bridge.onView(setView));
  onCleanup(bridge.onNotice((n) => {
    queue.push(n);
    setLatest(n);
  }));

  const config = () => view().config;
  const open = (n: Notice) => {
    bridge.open(n.target);
    queue.dismiss(n.id);
  };

  let root!: HTMLDivElement;
  onMount(() => {
    onCleanup(watchSize(root, (width, height) => bridge.resize(width, height)));
    onCleanup(watchPointer(INTERACTIVE, (over) => bridge.pointer(over)));
  });

  return (
    <div
      ref={root}
      class="cuj-notices"
      style={{ ...view().appearance.vars, 'color-scheme': view().appearance.colorScheme }}
      onMouseEnter={() => queue.pause()}
      onMouseLeave={() => queue.resume()}
    >
      <Show when={deliversTo(config().delivery).overlay}>
        <Switch>
          <Match when={config().style === 'tray'}>
            <TrayDrip items={queue.items()} icons={props.icons} onOpen={open} onDismiss={queue.dismiss} onClear={queue.clear} />
          </Match>
          <Match when={config().style === 'console'}>
            <ConsoleTail items={queue.items()} lines={config().consoleLines} label={props.label ?? 'notifications'} icons={props.icons} onOpen={open} onDismiss={queue.dismiss} onClear={queue.clear} />
          </Match>
          <Match when={config().style === 'drip'}>
            <TopDrip latest={latest()} lip={config().dripLip} vars={view().appearance.dripVars} icons={props.icons} onOpen={open} />
          </Match>
        </Switch>
      </Show>
    </div>
  );
}
