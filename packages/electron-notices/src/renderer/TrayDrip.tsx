import { For, Show } from 'solid-js';
import type { Notice } from '../types';
import { clockTime } from './_internal/overlayDom';
import { DismissButton, NoticeGlyph, type NoticeIcon } from './NoticeGlyph';

/** Cards on screen at once; older notices fold into the counter above them. */
const TRAY_VISIBLE = 3;

export interface NoticeListProps {
  items: Notice[];
  icons?: Record<string, NoticeIcon>;
  onOpen: (n: Notice) => void;
  onDismiss: (id: number) => void;
  onClear: () => void;
}

/** Tray drip: one-line rounded cards stacked by the tray, newest nearest it. Hover expands a card. */
export function TrayDrip(props: NoticeListProps) {
  const shown = () => props.items.slice(-TRAY_VISIBLE);
  const hidden = () => props.items.length - shown().length;
  return (
    <Show when={props.items.length > 0}>
      <div class="cuj-notices-tray">
        <Show when={hidden() > 0}>
          <div class="cuj-notices-tray-more">
            <span>{hidden()} earlier</span>
            <button type="button" onClick={() => props.onClear()}>Clear all</button>
          </div>
        </Show>
        <For each={shown()}>
          {(n, i) => (
            <div class="cuj-notices-card" data-tone={n.tone} style={{ '--_age': String(shown().length - 1 - i()) }}>
              <button type="button" class="cuj-notices-card-main" onClick={() => props.onOpen(n)}>
                <NoticeGlyph notice={n} icons={props.icons} />
                <span class="cuj-notices-card-text">
                  <span class="cuj-notices-card-title">{n.title}</span>
                  <Show when={n.body}><span class="cuj-notices-card-body">{n.body}</span></Show>
                </span>
                <span class="cuj-notices-time">{clockTime(n.at)}</span>
              </button>
              <DismissButton onClick={() => props.onDismiss(n.id)} />
            </div>
          )}
        </For>
      </div>
    </Show>
  );
}
