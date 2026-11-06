import { For, Show } from 'solid-js';
import { isSticky, type NoticeTone } from '../types';
import { clockTime } from './_internal/overlayDom';
import { DismissButton } from './NoticeGlyph';
import type { NoticeListProps } from './TrayDrip';

/** Tag when a notice names none. */
const TONE_TAG: Record<NoticeTone, string> = { info: 'INFO', ok: 'OK', warn: 'WARN', error: 'ERROR' };

/** Console: notices as log lines, newest at the bottom; errors stay highlighted until handled. */
export function ConsoleTail(props: NoticeListProps & { lines: number; label: string }) {
  const shown = () => props.items.slice(-props.lines);
  return (
    <Show when={props.items.length > 0}>
      <div class="cuj-notices-console" role="log">
        <div class="cuj-notices-console-head">
          <span>{props.label}</span>
          <button type="button" onClick={() => props.onClear()}>clear</button>
        </div>
        <For each={shown()}>
          {(n) => (
            <div class="cuj-notices-console-row" data-tone={n.tone} classList={{ 'cuj-notices-sticky': isSticky(n) }}>
              <button type="button" class="cuj-notices-console-line" onClick={() => props.onOpen(n)}>
                <span class="cuj-notices-time">{clockTime(n.at)}</span>
                <span class="cuj-notices-console-tag">{n.tag ?? TONE_TAG[n.tone]}</span>
                <span class="cuj-notices-console-msg">
                  {n.title}
                  <Show when={n.body}><span class="cuj-notices-console-body"> · {n.body}</span></Show>
                </span>
              </button>
              <DismissButton onClick={() => props.onDismiss(n.id)} />
            </div>
          )}
        </For>
      </div>
    </Show>
  );
}
