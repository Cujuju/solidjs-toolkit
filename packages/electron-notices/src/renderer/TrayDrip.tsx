import { createMemo, For, Show, type Component } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import type { Notice, NoticeTones } from '../types';
import { clockTime } from './_internal/overlayDom';
import { toneVars } from './_internal/tone';
import { DismissButton, NoticeGlyph, PinMark, ToolButton, type NoticeIcon } from './NoticeGlyph';

/** Draws a notice's `content` for one `content.kind`; `data` is that content's payload. */
export type NoticeContentRenderer = Component<{ notice: Notice; data: unknown }>;

/** Kinds already reported missing, so a bad kind warns once. */
const reportedKinds = new Set<string>();

export interface NoticeListProps {
  items: Notice[];
  tones: NoticeTones;
  icons?: Record<string, NoticeIcon>;
  sticky: (n: Notice) => boolean;
  onOpen: (n: Notice) => void;
  onDismiss: (id: number) => void;
  onClear: () => void;
}

export interface TrayDripProps extends NoticeListProps {
  /** Cards on screen at once; older notices fold into the counter. */
  visible: number;
  renderers?: Record<string, NoticeContentRenderer>;
  onAction: (n: Notice, actionId: string) => void;
  onPin: (n: Notice, pinned: boolean) => void;
}

/** Tray drip: rounded cards stacked from the screen edge, newest nearest it. Hover expands a card's text. */
export function TrayDrip(props: TrayDripProps) {
  const shown = () => props.items.slice(-props.visible);
  const hidden = () => props.items.length - shown().length;
  const shownIds = createMemo(() => shown().map((n) => n.id), undefined, { equals: (a, b) => a.length === b.length && a.every((id, k) => id === b[k]) });
  const byId = (id: number) => props.items.find((n) => n.id === id);
  const renderer = (n: Notice): NoticeContentRenderer | undefined => {
    const kind = n.content?.kind;
    if (kind === undefined) return undefined;
    const r = props.renderers?.[kind];
    if (!r && !reportedKinds.has(kind)) {
      reportedKinds.add(kind);
      console.warn(`[electron-notices] no renderer for content kind "${kind}"; showing title and body only`);
    }
    return r;
  };
  return (
    <Show when={props.items.length > 0}>
      <div class="cuj-notices-tray">
        <Show when={hidden() > 0}>
          <div class="cuj-notices-tray-more">
            <span>{hidden()} earlier</span>
            <button type="button" onClick={() => props.onClear()}>Clear all</button>
          </div>
        </Show>
        {/* Keyed by id: pinning replaces the notice object, and a remount would replay the entry animation. */}
        <For each={shownIds()}>
          {(id, i) => (
            <Show when={byId(id)}>
              {(n) => (
                <div
                  class="cuj-notices-card"
                  data-notice-id={n().id}
                  data-sticky={props.sticky(n()) ? '' : undefined}
                  style={{ ...toneVars(n().tone, props.tones), '--_age': String(shownIds().length - 1 - i()) }}
                >
                  <div class="cuj-notices-card-head">
                    <button type="button" class="cuj-notices-card-main" onClick={() => props.onOpen(n())}>
                      <NoticeGlyph notice={n()} tones={props.tones} icons={props.icons} />
                      <span class="cuj-notices-card-text">
                        <span class="cuj-notices-card-title">{n().title}</span>
                        <Show when={n().body}><span class="cuj-notices-card-body">{n().body}</span></Show>
                      </span>
                      <Show when={n().pinned}><PinMark /></Show>
                      <span class="cuj-notices-time">{clockTime(n().at)}</span>
                    </button>
                    <DismissButton onClick={() => props.onDismiss(n().id)} />
                  </div>
                  <Show when={renderer(n())}>
                    {(r) => <div class="cuj-notices-card-content"><Dynamic component={r()} notice={n()} data={n().content?.data} /></div>}
                  </Show>
                  <Show when={(n().actions?.length ?? 0) > 0 || n().pinnable}>
                    <div class="cuj-notices-card-actions">
                      <For each={n().actions ?? []}>
                        {(a) => <ToolButton label={a.label} icon={a.icon} icons={props.icons} onClick={() => props.onAction(n(), a.id)} />}
                      </For>
                      <Show when={n().pinnable}>
                        <ToolButton label={n().pinned ? 'Unpin' : 'Pin'} icon="pin" icons={props.icons} pressed={n().pinned} onClick={() => props.onPin(n(), !n().pinned)} />
                      </Show>
                    </div>
                  </Show>
                </div>
              )}
            </Show>
          )}
        </For>
      </div>
    </Show>
  );
}
