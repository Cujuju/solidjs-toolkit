import { Show, type Component, type JSX } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import type { NoticeInput, NoticeTones } from '../types';
import { iconKey, toneVars } from './_internal/tone';

/** A host icon component, such as a lucide-solid icon. */
export type NoticeIcon = Component<{ size?: number }>;

/** Icons sit at about half the glyph tile. */
const ICON_PX = 13;
const TOOL_ICON_PX = 12;
/** Smaller than a tool icon: it marks state beside the time, it is not a control. */
const PIN_MARK_PX = 10;

/** Built-in icons, used when the host supplies none for a key. Factories, since a JSX node sits in one place only. */
const BUILT_IN: Record<string, () => JSX.Element> = {
  info: () => <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
  ok: () => <path d="M5 12.5l4.5 4.5L19 7.5" />,
  warn: () => <><path d="M12 3l10 18H2z" /><path d="M12 10v4M12 17.5h.01" /></>,
  error: () => <><circle cx="12" cy="12" r="9" /><path d="M9 9l6 6M15 9l-6 6" /></>,
  pin: () => <><path d="M12 17v5" /><path d="M5 17h14v-1.8a2 2 0 0 0-1.1-1.8l-1.8-.9a2 2 0 0 1-1.1-1.8V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.8a2 2 0 0 1-1.1 1.8l-1.8.9A2 2 0 0 0 5 15.2z" /></>,
  dismiss: () => <path d="M6 6l12 12M18 6L6 18" />,
  /** Neutral mark for a notice whose icon key resolves to nothing. */
  dot: () => <circle cx="12" cy="12" r="3" />,
};

export function StrokeIcon(props: { size: number; children: JSX.Element }) {
  return (
    <svg class="cuj-notices-icon" width={props.size} height={props.size} viewBox="0 0 24 24" aria-hidden="true">
      {props.children}
    </svg>
  );
}

/** The host's icon for `name`, else the built-in one; renders `fallback` when neither exists. */
function KeyedIcon(props: { name: string | undefined; icons?: Record<string, NoticeIcon>; size: number; fallback?: JSX.Element }) {
  const host = () => (props.name ? props.icons?.[props.name] : undefined);
  const builtIn = () => (props.name ? BUILT_IN[props.name] : undefined);
  return (
    <Show when={host()} fallback={<Show when={builtIn()} fallback={props.fallback}>{(paths) => <StrokeIcon size={props.size}>{paths()()}</StrokeIcon>}</Show>}>
      {(icon) => <Dynamic component={icon()} size={props.size} aria-hidden="true" />}
    </Show>
  );
}

/** The tinted tile at the start of a notice: its icon, else its tone's, else a neutral dot. */
export function NoticeGlyph(props: { notice: NoticeInput; tones: NoticeTones; icons?: Record<string, NoticeIcon> }) {
  return (
    <span class="cuj-notices-glyph" style={toneVars(props.notice.tone, props.tones)}>
      <KeyedIcon name={iconKey(props.notice, props.tones)} icons={props.icons} size={ICON_PX} fallback={<StrokeIcon size={ICON_PX}>{BUILT_IN.dot!()}</StrokeIcon>} />
    </span>
  );
}

export function DismissButton(props: { onClick: () => void }) {
  return (
    <button type="button" class="cuj-notices-dismiss" aria-label="Dismiss" onClick={() => props.onClick()}>
      <StrokeIcon size={TOOL_ICON_PX}>{BUILT_IN.dismiss!()}</StrokeIcon>
    </button>
  );
}

/** A footer button: icon-only when its icon resolves (label becomes the tooltip), else its label as text. */
export function ToolButton(props: { label: string; icon?: string; icons?: Record<string, NoticeIcon>; pressed?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      class="cuj-notices-tool"
      title={props.label}
      aria-label={props.label}
      aria-pressed={props.pressed}
      onClick={() => props.onClick()}
    >
      <KeyedIcon name={props.icon} icons={props.icons} size={TOOL_ICON_PX} fallback={<span class="cuj-notices-tool-text">{props.label}</span>} />
    </button>
  );
}

/** The small mark beside a pinned card's time. */
export function PinMark() {
  return <span class="cuj-notices-pin-mark"><StrokeIcon size={PIN_MARK_PX}>{BUILT_IN.pin!()}</StrokeIcon></span>;
}
