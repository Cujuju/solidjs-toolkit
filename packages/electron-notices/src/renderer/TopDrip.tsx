import { createEffect, createSignal, on, onCleanup, Show } from 'solid-js';
import type { Notice, NoticeTones } from '../types.js';
import { toneVars } from './_internal/tone.js';
import { NoticeGlyph, type NoticeIcon } from './NoticeGlyph.js';

/** How long a notice stays open before the drip settles. */
const DRIP_SETTLE_MS = 4000;
/** The open/settle morph; styles.css reads it as --_drip-morph. */
const DRIP_MORPH_MS = 320;

/** open: a notice; chip: an unhandled error; lip: the optional resting lip; none: nothing on screen. */
type Shape = 'open' | 'chip' | 'lip' | 'none';
/** Compact on purpose: open is about half a Windows toast. A chip's radius is half its height. */
const SIZE: Record<Shape, { width: number; height: number; radius: number }> = {
  open: { width: 340, height: 52, radius: 18 },
  chip: { width: 200, height: 26, radius: 13 },
  lip: { width: 120, height: 8, radius: 4 },
  none: { width: 0, height: 0, radius: 0 },
};
const area = (s: Shape) => SIZE[s].width * SIZE[s].height;
const px = (n: number) => `${n}px`;

export interface TopDripProps {
  latest: Notice | null;
  lip: boolean;
  /** The drip's own palette (NoticeAppearance.dripVars); it reads as dark in every theme. */
  vars?: Record<string, string>;
  tones: NoticeTones;
  icons?: Record<string, NoticeIcon>;
  sticky: (n: Notice) => boolean;
  onOpen: (n: Notice) => void;
}

/** Top drip: a lip hanging from the top edge that opens for a notice, then settles back. */
export function TopDrip(props: TopDripProps) {
  const [open, setOpen] = createSignal(false);
  const [handled, setHandled] = createSignal<number | null>(null);
  let settle: ReturnType<typeof setTimeout> | undefined;
  const settleLater = () => {
    clearTimeout(settle);
    settle = setTimeout(() => setOpen(false), DRIP_SETTLE_MS);
  };
  onCleanup(() => clearTimeout(settle));

  createEffect(on(() => props.latest?.id, (id) => {
    if (id === undefined) return;
    setOpen(true);
    settleLater();
  }));

  const unhandledError = () => {
    const n = props.latest;
    return n && props.sticky(n) && handled() !== n.id ? n : null;
  };
  const shape = (): Shape => (open() && props.latest ? 'open' : unhandledError() ? 'chip' : props.lip ? 'lip' : 'none');

  // The window grows before the drip opens and shrinks after it settles, so the morph is never clipped.
  const [frame, setFrame] = createSignal<Shape>(shape());
  createEffect(on(shape, (next) => {
    if (area(next) >= area(frame())) return void setFrame(next);
    const t = setTimeout(() => setFrame(next), DRIP_MORPH_MS);
    onCleanup(() => clearTimeout(t));
  }));

  function click(): void {
    const n = props.latest;
    if (!n) return;
    if (shape() !== 'open') {
      setOpen(true);
      settleLater();
      return;
    }
    props.onOpen(n);
    setHandled(n.id);
    clearTimeout(settle);
    setOpen(false);
  }

  return (
    <div class="cuj-notices-drip-frame" style={{ width: px(SIZE[frame()].width), height: px(SIZE[frame()].height), '--_drip-morph': `${DRIP_MORPH_MS}ms` }}>
      <Show when={frame() !== 'none'}>
        <button
          type="button"
          class="cuj-notices-drip"
          data-shape={shape()}
          data-notice-id={props.latest?.id}
          aria-label={props.latest ? `${props.latest.title}. ${shape() === 'open' ? 'Open' : 'Show'}` : 'Notifications'}
          style={{ ...props.vars, width: px(SIZE[shape()].width), height: px(SIZE[shape()].height), '--_drip-radius': px(SIZE[shape()].radius) }}
          onClick={click}
          onMouseEnter={() => clearTimeout(settle)}
          onMouseLeave={() => { if (open()) settleLater(); }}
        >
          <Show when={shape() === 'open' && props.latest}>
            {(n) => (
              <span class="cuj-notices-drip-open">
                <NoticeGlyph notice={n()} tones={props.tones} icons={props.icons} />
                <span class="cuj-notices-drip-text">
                  <span class="cuj-notices-drip-title">{n().title}</span>
                  <Show when={n().body}><span class="cuj-notices-drip-body">{n().body}</span></Show>
                </span>
              </span>
            )}
          </Show>
          <Show when={shape() === 'chip' && unhandledError()}>
            {(n) => (
              <span class="cuj-notices-drip-chip" style={toneVars(n().tone, props.tones)}>
                <span class="cuj-notices-drip-dot" />
                {n().short ?? n().title}
              </span>
            )}
          </Show>
        </button>
      </Show>
    </div>
  );
}
