import { For, Show } from 'solid-js';
import { clockTime } from './_internal/overlayDom';
import { toneTag, toneVars } from './_internal/tone';
import { DismissButton } from './NoticeGlyph';
import type { NoticeListProps } from './TrayDrip';

/** Console: notices as log lines, newest at the bottom; sticky lines stay highlighted until handled. Lines carry no actions or content. */
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
            <div class="cuj-notices-console-row" data-notice-id={n.id} style={toneVars(n.tone, props.tones)} classList={{ 'cuj-notices-sticky': props.sticky(n) }}>
              <button type="button" class="cuj-notices-console-line" onClick={() => props.onOpen(n)}>
                <span class="cuj-notices-time">{clockTime(n.at)}</span>
                <span class="cuj-notices-console-tag">{toneTag(n, props.tones)}</span>
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
