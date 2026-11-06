export type NoticeTone = 'info' | 'ok' | 'warn' | 'error';
export const NOTICE_DELIVERIES = ['overlay', 'system', 'both'] as const;
export type NoticeDelivery = (typeof NOTICE_DELIVERIES)[number];
export const NOTICE_STYLES = ['tray', 'drip', 'console'] as const;
export type NoticeStyle = (typeof NOTICE_STYLES)[number];
export const MIN_CONSOLE_LINES = 2;
export const MAX_CONSOLE_LINES = 8;
export interface NoticeConfig { delivery: NoticeDelivery; style: NoticeStyle; dripLip: boolean; consoleLines: number }
export const DEFAULT_NOTICE_CONFIG: NoticeConfig = { delivery: 'overlay', style: 'tray', dripLip: false, consoleLines: 3 };
export function normalizeNoticeConfig(raw: unknown, fallback = DEFAULT_NOTICE_CONFIG): NoticeConfig {
  const r = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  return {
    delivery: NOTICE_DELIVERIES.includes(r.delivery as NoticeDelivery) ? r.delivery as NoticeDelivery : fallback.delivery,
    style: NOTICE_STYLES.includes(r.style as NoticeStyle) ? r.style as NoticeStyle : fallback.style,
    dripLip: typeof r.dripLip === 'boolean' ? r.dripLip : fallback.dripLip,
    consoleLines: typeof r.consoleLines === 'number' && Number.isFinite(r.consoleLines)
      ? Math.max(MIN_CONSOLE_LINES, Math.min(MAX_CONSOLE_LINES, Math.round(r.consoleLines))) : fallback.consoleLines,
  };
}
export interface NoticeInput { title: string; body?: string; short?: string; tone: NoticeTone; icon?: string; tag?: string; sticky?: boolean; target?: string }
export interface Notice extends NoticeInput { id: number; at: number }
export const isSticky = (n: NoticeInput): boolean => n.sticky ?? n.tone === 'error';
export const deliversTo = (d: NoticeDelivery): { system: boolean; overlay: boolean } => ({ system: d !== 'overlay', overlay: d !== 'system' });
export interface NoticeAppearance { vars: Record<string, string>; dripVars?: Record<string, string>; colorScheme?: 'light' | 'dark' }
export interface NoticeView { config: NoticeConfig; appearance: NoticeAppearance }
export const NOTICE_CHANNELS = { notice: 'notices:notice', view: 'notices:view', resize: 'notices:resize', pointer: 'notices:pointer', open: 'notices:open' } as const;
export interface NoticeBridge {
  onNotice(cb: (n: Notice) => void): () => void;
  onView(cb: (v: NoticeView) => void): () => void;
  resize(width: number, height: number): void;
  pointer(over: boolean): void;
  open(target: string | undefined): void;
}
