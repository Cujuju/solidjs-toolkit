import type { NoticeInput, NoticeTones } from '../../types.js';

/** Tones already reported missing, so a bad tone warns once instead of on every render. */
const reported = new Set<string>();

/** The tone's colour; an unknown tone warns once and paints in the accent colour. */
export function toneColor(tone: string, tones: NoticeTones): string {
  const def = tones[tone];
  if (def) return def.color;
  if (!reported.has(tone)) {
    reported.add(tone);
    console.warn(`[electron-notices] unknown tone "${tone}"; add it to NoticeView.tones`);
  }
  return 'var(--notice-accent)';
}

/** Inline `--_tone` for an element that paints in its notice's tone. */
export const toneVars = (tone: string, tones: NoticeTones): Record<string, string> => ({ '--_tone': toneColor(tone, tones) });

/** Console tag: the notice's, else its tone's, else the tone's name. */
export const toneTag = (n: NoticeInput, tones: NoticeTones): string => n.tag ?? tones[n.tone]?.tag ?? n.tone.toUpperCase();

/** Icon key: the notice's, else its tone's. */
export const iconKey = (n: NoticeInput, tones: NoticeTones): string | undefined => n.icon ?? tones[n.tone]?.icon;
