import { Show, type Component, type JSX } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import type { NoticeInput, NoticeTone } from '../types';

/** A host icon component, such as a lucide-solid icon. */
export type NoticeIcon = Component<{ size?: number }>;

/** Icons sit at about half the glyph tile. */
const ICON_PX = 13;

/** Tone icons for notices without a host icon: shape, not colour alone. Factories, since a JSX node sits in one place only. */
const TONE_PATHS: Record<NoticeTone, () => JSX.Element> = {
  info: () => <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
  ok: () => <path d="M5 12.5l4.5 4.5L19 7.5" />,
  warn: () => <><path d="M12 3l10 18H2z" /><path d="M12 10v4M12 17.5h.01" /></>,
  error: () => <><circle cx="12" cy="12" r="9" /><path d="M9 9l6 6M15 9l-6 6" /></>,
};

export function StrokeIcon(props: { size: number; children: JSX.Element }) {
  return (
    <svg class="cuj-notices-icon" width={props.size} height={props.size} viewBox="0 0 24 24" aria-hidden="true">
      {props.children}
    </svg>
  );
}

/** The tinted tile at the start of a notice: the host's icon for `notice.icon`, else the tone's. */
export function NoticeGlyph(props: { notice: NoticeInput; icons?: Record<string, NoticeIcon> }) {
  const custom = () => (props.notice.icon ? props.icons?.[props.notice.icon] : undefined);
  return (
    <span class="cuj-notices-glyph" data-tone={props.notice.tone}>
      <Show when={custom()} fallback={<StrokeIcon size={ICON_PX}>{TONE_PATHS[props.notice.tone]()}</StrokeIcon>}>
        {(icon) => <Dynamic component={icon()} size={ICON_PX} aria-hidden="true" />}
      </Show>
    </span>
  );
}

const DISMISS_ICON_PX = 12;

export function DismissButton(props: { onClick: () => void }) {
  return (
    <button type="button" class="cuj-notices-dismiss" aria-label="Dismiss" onClick={() => props.onClick()}>
      <StrokeIcon size={DISMISS_ICON_PX}><path d="M6 6l12 12M18 6L6 18" /></StrokeIcon>
    </button>
  );
}
