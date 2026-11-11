import { createMemo, For, Show, type Component } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import type { Notice, NoticeAction, NoticeIconSizes, NoticeTones } from '../types.js';
import { toneVars } from './_internal/tone.js';
import { NoticeGlyph, ToolButton, type NoticeIcon } from './NoticeGlyph.js';

/** Draws a notice's `content` for one `content.kind`; `data` is that content's payload. */
export type NoticeContentRenderer = Component<{ notice: Notice; data: unknown }>;
/** Card parts one content kind draws. `head` replaces the glyph, title and body; `body` sits below the head; `foot` leads the footer row. */
export interface NoticeContentParts { head?: NoticeContentRenderer; body?: NoticeContentRenderer; foot?: NoticeContentRenderer }
/** A bare renderer draws the body part. */
export type NoticeRendererEntry = NoticeContentRenderer | NoticeContentParts;

/** Kinds already reported missing, so a bad kind warns once. */
const reportedKinds = new Set<string>();
/** Controls inside a card; a click anywhere else on it opens the notice. */
const CARD_CONTROLS = '.cuj-notices-tool, .cuj-notices-action';

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
  renderers?: Record<string, NoticeRendererEntry>;
  /** A notice's full on-screen time; zero never expires. Drives the card's own fade. */
  durationOf: (n: Notice) => number;
  /** Ids playing their exit animation. */
  leaving: ReadonlySet<number>;
  iconPx?: NoticeIconSizes;
  onAction: (n: Notice, actionId: string) => void;
  onPin: (n: Notice, pinned: boolean) => void;
}

/** Tray drip: cards stacked from the screen edge, newest nearest it. Each card fades on its own timer. */
export function TrayDrip(props: TrayDripProps) {
  const shown = () => props.items.slice(-props.visible);
  const hidden = () => props.items.length - shown().length;
  const shownIds = createMemo(() => shown().map((n) => n.id), undefined, { equals: (a, b) => a.length === b.length && a.every((id, k) => id === b[k]) });
  const byId = (id: number) => props.items.find((n) => n.id === id);
  const parts = (n: Notice): NoticeContentParts => {
    const kind = n.content?.kind;
    if (kind === undefined) return {};
    const r = props.renderers?.[kind];
    if (!r && !reportedKinds.has(kind)) {
      reportedKinds.add(kind);
      console.warn(`[electron-notices] no renderer for content kind "${kind}"; showing title and body only`);
    }
    return typeof r === 'function' ? { body: r } : r ?? {};
  };
  const tools = (n: Notice) => (n.actions ?? []).filter((a) => a.variant !== 'danger');
  const buttons = (n: Notice) => (n.actions ?? []).filter((a) => a.variant === 'danger');
  // Timed cards carry their duration and the time a replay already spent, so the fade lines up with the timer.
  const lifeVars = (n: Notice): Record<string, string> => {
    const ms = props.durationOf(n);
    return ms > 0 ? { '--_life': `${ms}ms`, '--_spent': `${ms - (n.remainingMs ?? ms)}ms` } : {};
  };
  const part = (r: NoticeContentRenderer | undefined, n: Notice) => (
    <Show when={r}>{(c) => <Dynamic component={c()} notice={n} data={n.content?.data} />}</Show>
  );
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
          {(id) => (
            <Show when={byId(id)}>
              {(n) => (
                <div
                  class="cuj-notices-card"
                  data-notice-id={n().id}
                  data-sticky={props.sticky(n()) ? '' : undefined}
                  data-life={props.durationOf(n()) > 0 ? '' : undefined}
                  data-leaving={props.leaving.has(n().id) ? '' : undefined}
                  style={{ ...toneVars(n().tone, props.tones), ...lifeVars(n()) }}
                  onClick={(e) => { if (!(e.target as Element).closest(CARD_CONTROLS)) props.onOpen(n()); }}
                >
                  {/* A button for keyboard users; its click bubbles to the card. */}
                  <button type="button" class="cuj-notices-card-head">
                    <Show when={parts(n()).head} fallback={
                      <>
                        <NoticeGlyph notice={n()} tones={props.tones} icons={props.icons} size={props.iconPx?.glyph} />
                        <span class="cuj-notices-card-text">
                          <span class="cuj-notices-card-title">{n().title}</span>
                          <Show when={n().body}><span class="cuj-notices-card-body">{n().body}</span></Show>
                        </span>
                      </>
                    }>
                      {part(parts(n()).head, n())}
                    </Show>
                  </button>
                  <Show when={parts(n()).body}><div class="cuj-notices-card-content">{part(parts(n()).body, n())}</div></Show>
                  <Show when={parts(n()).foot || tools(n()).length > 0 || n().pinnable}>
                    <div class="cuj-notices-card-foot">
                      <div class="cuj-notices-card-meta">{part(parts(n()).foot, n())}</div>
                      <div class="cuj-notices-card-tools">
                        <For each={tools(n())}>
                          {(a) => <ToolButton label={a.label} icon={a.icon} icons={props.icons} size={props.iconPx?.tool} onClick={() => props.onAction(n(), a.id)} />}
                        </For>
                        <Show when={n().pinnable}>
                          <ToolButton
                            label={n().pinned ? 'Unpin' : 'Pin'} icon={n().pinned ? 'pin-off' : 'pin'} icons={props.icons}
                            size={props.iconPx?.tool} pressed={n().pinned} onClick={() => props.onPin(n(), !n().pinned)}
                          />
                        </Show>
                      </div>
                    </div>
                  </Show>
                  <Show when={buttons(n()).length > 0}>
                    <div class="cuj-notices-card-buttons">
                      <For each={buttons(n())}>{(a) => <ActionButton action={a} onClick={() => props.onAction(n(), a.id)} />}</For>
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

/** A labelled action button, painted by its variant. */
function ActionButton(props: { action: NoticeAction; onClick: () => void }) {
  return (
    <button type="button" class="cuj-notices-action" data-variant={props.action.variant} onClick={() => props.onClick()}>
      {props.action.label}
    </button>
  );
}
