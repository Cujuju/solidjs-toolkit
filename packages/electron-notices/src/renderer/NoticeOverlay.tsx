import { createEffect, createSignal, Match, on, onCleanup, onMount, Show, Switch } from 'solid-js';
import {
  BASIC_TONES, DEFAULT_NOTICE_CONFIG, deliversTo, isSticky, noticeDuration,
  type Notice, type NoticeBridge, type NoticePlacement, type NoticeView,
} from '../types';
import { hasNoticeElement, watchPointer, watchSize } from './_internal/overlayDom';
import { ConsoleTail } from './ConsoleTail';
import type { NoticeIcon } from './NoticeGlyph';
import { createNoticeQueue } from './queue';
import { TopDrip } from './TopDrip';
import { TrayDrip, type NoticeContentRenderer } from './TrayDrip';

/** Painted surfaces that take clicks; the window's transparent rest passes them through. */
const INTERACTIVE = '.cuj-notices-card, .cuj-notices-tray-more, .cuj-notices-console, .cuj-notices-drip';
/** Before main's first view arrives; the overlay never paints with it in practice. */
const INITIAL_VIEW: NoticeView = { config: DEFAULT_NOTICE_CONFIG, appearance: { vars: {} }, tones: BASIC_TONES };
const INITIAL_PLACEMENT: NoticePlacement = 'bottom-right';

export interface NoticeOverlayProps {
  /** createNoticeBridge (overlay window) or createLocalNoticeHost().bridge (inline). */
  bridge: NoticeBridge;
  /** Icon components keyed by icon name (notice, tone, or action icon). */
  icons?: Record<string, NoticeIcon>;
  /** Content renderers keyed by NoticeContent.kind; tray cards draw them below the title. */
  renderers?: Record<string, NoticeContentRenderer>;
  /** Console's header, such as the app's name. */
  label?: string;
  /** Inside an app window: fixed to the viewport at the view's placement, page styles untouched. */
  inline?: boolean;
}

/** The notice surface: renders the configured style, acknowledges each notice it shows, and reports overlay size to main. */
export function NoticeOverlay(props: NoticeOverlayProps) {
  const bridge = props.bridge;
  const [view, setView] = createSignal<NoticeView>(INITIAL_VIEW);
  const [placement, setPlacement] = createSignal<NoticePlacement>(INITIAL_PLACEMENT);
  const [latest, setLatest] = createSignal<Notice | null>(null);
  const queue = createNoticeQueue(
    (n) => noticeDuration(n, view()),
    (id) => {
      unacked.delete(id);
      bridge.closed(id);
      if (latest()?.id === id) setLatest(null);
    },
    () => view().config.maxKept,
  );
  onCleanup(() => queue.dispose());
  // Ack only what is on the page: a host may push before mount or inside batch(), and a throwing renderer leaves no element.
  let root: HTMLDivElement | undefined;
  const unacked = new Set<number>();
  const ackRendered = () => {
    if (!root) return;
    for (const id of unacked) if (hasNoticeElement(root, id)) { unacked.delete(id); bridge.ack(id); }
  };
  onCleanup(bridge.onView((v, p) => {
    setView(v);
    setPlacement(p);
  }));
  onCleanup(bridge.onNotice((n) => {
    queue.push(n);
    setLatest(n);
    unacked.add(n.id);
    queueMicrotask(ackRendered);
  }));
  onCleanup(bridge.onWithdraw((ref) => queue.withdraw(ref)));
  // Listeners are attached; main sends the view and pending notices only after this.
  bridge.ready();

  const config = () => view().config;
  // Turning the overlay off retires its notices (each reports closed), so turning it back on cannot resurrect them.
  createEffect(on(() => deliversTo(config().delivery).overlay, (shown) => { if (!shown) queue.clear(); }));
  const sticky = (n: Notice) => isSticky(n, view());
  const open = (n: Notice) => {
    bridge.open(n.id);
    queue.dismiss(n.id);
  };
  const pin = (n: Notice, pinned: boolean) => {
    queue.pin(n.id, pinned);
    bridge.pin(n.id, pinned);
  };

  onMount(() => {
    ackRendered();
    if (props.inline || !root) return;
    const el = root;
    onCleanup(watchSize(el, (width, height) => bridge.resize(width, height)));
    onCleanup(watchPointer(INTERACTIVE, (over) => bridge.pointer(over)));
  });

  const list = () => ({
    items: queue.items(), tones: view().tones, icons: props.icons, sticky,
    onOpen: open, onDismiss: queue.dismiss, onClear: queue.clear,
  });

  return (
    <div
      ref={root}
      class="cuj-notices"
      data-inline={props.inline ? '' : undefined}
      data-placement={placement()}
      style={{ ...view().appearance.vars, 'color-scheme': view().appearance.colorScheme }}
      onMouseEnter={() => queue.pause()}
      onMouseLeave={() => queue.resume()}
    >
      <Show when={deliversTo(config().delivery).overlay}>
        <Switch>
          <Match when={config().style === 'tray'}>
            <TrayDrip {...list()} visible={config().trayVisible} renderers={props.renderers} onAction={(n, a) => bridge.action(n.id, a)} onPin={pin} />
          </Match>
          <Match when={config().style === 'console'}>
            <ConsoleTail {...list()} lines={config().consoleLines} label={props.label ?? 'notifications'} />
          </Match>
          <Match when={config().style === 'drip'}>
            <TopDrip latest={latest()} lip={config().dripLip} vars={view().appearance.dripVars} tones={view().tones} icons={props.icons} sticky={sticky} onOpen={open} />
          </Match>
        </Switch>
      </Show>
    </div>
  );
}
