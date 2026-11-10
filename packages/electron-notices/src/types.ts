export const NOTICE_DELIVERIES = ['overlay', 'system', 'both'] as const;
export type NoticeDelivery = (typeof NOTICE_DELIVERIES)[number];
export const NOTICE_STYLES = ['tray', 'drip', 'console'] as const;
export type NoticeStyle = (typeof NOTICE_STYLES)[number];
export const NOTICE_PLACEMENTS = ['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right'] as const;
export type NoticePlacement = (typeof NOTICE_PLACEMENTS)[number];
export const NOTICE_POSITIONS = ['auto', ...NOTICE_PLACEMENTS] as const;
export type NoticePosition = (typeof NOTICE_POSITIONS)[number];
export const MIN_CONSOLE_LINES = 2;
export const MAX_CONSOLE_LINES = 8;
/** Default `config.maxKept`. */
export const MAX_KEPT_NOTICES = MAX_CONSOLE_LINES;
/** Upper bound on `config.maxKept`: past this a tray is a log, not notices. */
export const MAX_KEPT_LIMIT = 50;
export const MIN_TRAY_VISIBLE = 1;
/** Windows' default toast time (5 s) plus a second for the slide-in. */
export const NOTICE_VISIBLE_MS = 6000;
export interface NoticeConfig {
  delivery: NoticeDelivery; style: NoticeStyle; dripLip: boolean; consoleLines: number;
  position: NoticePosition; trayVisible: number; durationMs: number;
  /** Notices kept at once; past it the oldest unpinned is evicted. */
  maxKept: number;
}
export const DEFAULT_NOTICE_CONFIG: NoticeConfig = {
  delivery: 'overlay', style: 'tray', dripLip: false, consoleLines: 3,
  position: 'auto', trayVisible: 3, durationMs: NOTICE_VISIBLE_MS, maxKept: MAX_KEPT_NOTICES,
};
export function normalizeNoticeConfig(raw: unknown, fallback = DEFAULT_NOTICE_CONFIG): NoticeConfig {
  const r = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const maxKept = typeof r.maxKept === 'number' && Number.isFinite(r.maxKept)
    ? Math.max(MIN_TRAY_VISIBLE, Math.min(MAX_KEPT_LIMIT, Math.round(r.maxKept))) : fallback.maxKept;
  return {
    delivery: NOTICE_DELIVERIES.includes(r.delivery as NoticeDelivery) ? r.delivery as NoticeDelivery : fallback.delivery,
    style: NOTICE_STYLES.includes(r.style as NoticeStyle) ? r.style as NoticeStyle : fallback.style,
    dripLip: typeof r.dripLip === 'boolean' ? r.dripLip : fallback.dripLip,
    consoleLines: typeof r.consoleLines === 'number' && Number.isFinite(r.consoleLines)
      ? Math.max(MIN_CONSOLE_LINES, Math.min(MAX_CONSOLE_LINES, Math.round(r.consoleLines))) : fallback.consoleLines,
    position: NOTICE_POSITIONS.includes(r.position as NoticePosition) ? r.position as NoticePosition : fallback.position,
    trayVisible: typeof r.trayVisible === 'number' && Number.isFinite(r.trayVisible)
      ? Math.max(MIN_TRAY_VISIBLE, Math.min(maxKept, Math.round(r.trayVisible))) : Math.min(maxKept, fallback.trayVisible),
    durationMs: typeof r.durationMs === 'number' && Number.isFinite(r.durationMs) && r.durationMs >= 0 ? r.durationMs : fallback.durationMs,
    maxKept,
  };
}
export interface NoticeToneDef { color: string; durationMs?: number; tag?: string; icon?: string }
export type NoticeTones = Record<string, NoticeToneDef>;
export const BASIC_TONES: NoticeTones = {
  info: { color: 'var(--notice-info)', tag: 'INFO', icon: 'info' },
  ok: { color: 'var(--notice-ok)', tag: 'OK', icon: 'ok' },
  warn: { color: 'var(--notice-warn)', tag: 'WARN', icon: 'warn' },
  error: { color: 'var(--notice-error)', tag: 'ERROR', icon: 'error', durationMs: 0 },
};
export interface NoticeAction { id: string; label: string; icon?: string }
/** Custom content data must be structured-clone safe. */
export interface NoticeContent { kind: string; data: unknown }
export interface NoticeInput {
  title: string; body?: string; short?: string; tone: string; icon?: string; tag?: string; target?: string;
  /** Zero keeps the notice until dismissed. */
  durationMs?: number;
  /** The same key replaces a live notice as the newest item. */
  key?: string;
  actions?: NoticeAction[]; pinnable?: boolean; content?: NoticeContent;
}
export interface Notice extends NoticeInput {
  id: number; at: number; pinned: boolean;
  /** Library-set on replay; applies to the first timer only. */
  remainingMs?: number;
}
export interface NoticeAppearance { vars: Record<string, string>; dripVars?: Record<string, string>; colorScheme?: 'light' | 'dark' }
export interface NoticeView { config: NoticeConfig; appearance: NoticeAppearance; tones: NoticeTones }
const warnedDurations = new Set<string>();
export function noticeDuration(n: NoticeInput & { pinned?: boolean }, view: NoticeView): number {
  if (n.pinned) return 0;
  const ms = n.durationMs ?? view.tones[n.tone]?.durationMs ?? view.config.durationMs;
  if (Number.isFinite(ms) && ms >= 0) return ms;
  const warning = String(ms);
  if (!warnedDurations.has(warning)) {
    warnedDurations.add(warning); console.warn('Invalid notice duration; keeping notice until dismissed:', ms);
  }
  return 0;
}
export const isSticky = (n: NoticeInput & { pinned?: boolean }, view: NoticeView): boolean => noticeDuration(n, view) === 0;
export const deliversTo = (d: NoticeDelivery): { system: boolean; overlay: boolean } => ({ system: d !== 'overlay', overlay: d !== 'system' });
export type NoticeRef = { key: string } | { id: number };
export interface NoticeDeliveryResult { delivered: boolean }
export const NOTICE_CHANNELS = {
  ready: 'notices:ready', notice: 'notices:notice', view: 'notices:view', withdraw: 'notices:withdraw', resize: 'notices:resize', pointer: 'notices:pointer',
  ack: 'notices:ack', open: 'notices:open', action: 'notices:action', pin: 'notices:pin', closed: 'notices:closed',
} as const;
export interface NoticeBridge {
  ready(): void;
  onNotice(cb: (n: Notice) => void): () => void;
  /** maxHeight: overlay window only, the display's work-area height the stack must fit; inline hosts omit it. */
  onView(cb: (v: NoticeView, placement: NoticePlacement, maxHeight?: number) => void): () => void;
  onWithdraw(cb: (ref: NoticeRef) => void): () => void;
  resize(width: number, height: number): void; pointer(over: boolean): void;
  ack(id: number): void; open(id: number): void; action(id: number, actionId: string): void;
  pin(id: number, pinned: boolean): void; closed(id: number): void;
}
