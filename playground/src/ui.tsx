import { For, Show, createSignal, type Accessor, type JSX } from 'solid-js';

/**
 * Playground chrome — the bits every package page reuses.
 *
 * Two things in here are load-bearing, and both exist because a control rendered alone on an
 * empty canvas proves nothing:
 *
 *   1. The HOSTILE ANCESTOR boxes. Nearly every floating surface in the toolkit (pop-outs,
 *      flyouts, tooltips, menus) is correct in isolation and broken inside a clipping or
 *      scrolling parent — which is exactly where a real app puts it. So: put it in the box
 *      that breaks it.
 *   2. The EVENT LOG. It is the only way to prove a component did NOT emit. "It looks right"
 *      cannot distinguish a control that fired once from one that fired on every frame.
 */

// ── Layout ──────────────────────────────────────────────────────────────────

export function Card(props: { cap: string; wide?: boolean; children: JSX.Element }): JSX.Element {
  return (
    <div class="card" classList={{ 'card--wide': props.wide }}>
      <div class="cap">{props.cap}</div>
      <div class="body">{props.children}</div>
    </div>
  );
}

export function Note(props: { children: JSX.Element }): JSX.Element {
  return <p class="note">{props.children}</p>;
}

/**
 * Copy-pasteable source next to the live control it produces.
 *
 * The playground's job is not only "does it look right" but "how do I get
 * this" — a demo whose markup is only visible by reading the page's own
 * source makes the reader reverse-engineer the API. Pair every non-obvious
 * demo with the snippet that renders it.
 */
export function Code(props: { children: string; cap?: string }): JSX.Element {
  return (
    <div class="code">
      <Show when={props.cap}>
        <div class="code-cap">{props.cap}</div>
      </Show>
      <pre>{props.children.replace(/^\n/, '').replace(/\s+$/, '')}</pre>
    </div>
  );
}

export function H2(props: { children: JSX.Element }): JSX.Element {
  return <h2>{props.children}</h2>;
}

export function Row(props: { children: JSX.Element }): JSX.Element {
  return <div class="row">{props.children}</div>;
}

/**
 * A labelled cell for a state matrix.
 *
 * The matrix is the Tier-2 equivalent of the hostile-ancestor box: a size that drifted, or a
 * disabled state that lost its opacity, is invisible on its own and obvious next to its
 * siblings. So every state gets rendered TOGETHER, each under its own label.
 */
export function Cell(props: { label: string; children: JSX.Element }): JSX.Element {
  return (
    <div class="cell">
      <div class="cell-label">{props.label}</div>
      <div class="cell-body">{props.children}</div>
    </div>
  );
}

/** Grid of `Cell`s. `cols` is a hint; the grid wraps rather than overflowing. */
export function Grid(props: { children: JSX.Element }): JSX.Element {
  return <div class="grid">{props.children}</div>;
}

// ── Hostile ancestors ───────────────────────────────────────────────────────

/** `overflow: hidden` — clips an in-flow expansion dead. */
export function ClipBox(props: { width?: string; children: JSX.Element }): JSX.Element {
  return (
    <div class="clip" style={{ width: props.width ?? '150px' }}>
      {props.children}
    </div>
  );
}

/**
 * `overflow-y: auto` — clips, AND scrolls the anchor out from under a fixed-positioned panel.
 *
 * This is the box that finds bugs. A panel must do ONE of two things when this scrolls:
 * follow its anchor (which needs a scroll listener registered in the CAPTURE phase — scroll
 * does not bubble from an element, so a bubbling listener on `window` never hears this box),
 * or dismiss itself. A panel that does neither is left floating over unrelated content, still
 * pointing at an anchor that has moved.
 *
 * The filler is deliberate: a scroll box that cannot actually scroll tests nothing.
 */
export function ScrollBox(props: {
  width?: string;
  height?: string;
  /** Rows of filler appended after the children. Enough to guarantee a real scrollbar. */
  fill?: number;
  children: JSX.Element;
}): JSX.Element {
  const rows = (): number[] => Array.from({ length: props.fill ?? 12 }, (_, i) => i + 1);
  return (
    <div
      class="scrollbox"
      style={{ width: props.width ?? '210px', 'max-height': props.height ?? '150px' }}
    >
      {props.children}
      <div class="scrollfill">
        <div class="scrollfill-hint">↓ open a panel above, then scroll me ↓</div>
        <For each={rows()}>{(n) => <div class="scrollfill-row">filler row {n}</div>}</For>
      </div>
    </div>
  );
}

/**
 * Flush against the RIGHT VIEWPORT EDGE — not merely right-aligned in a card.
 *
 * The distinction matters: a panel is almost always wider than the anchor it hangs off (it
 * carries the content the trigger was hiding), so it is the real viewport boundary, not a
 * card boundary, that forces the clamp. This spans the full page column, which is why `.page`
 * carries no `max-width`.
 */
export function EdgeRight(props: { children: JSX.Element }): JSX.Element {
  return <div class="edge-right">{props.children}</div>;
}

/** Vertical spacer, to push a control to the bottom of the scroll and force an upward flip. */
export function Tall(): JSX.Element {
  return <div class="tall" />;
}

/**
 * A deliberately BUSY backdrop.
 *
 * A glass surface over a flat colour is indistinguishable from an opaque one — blur has
 * nothing to blur and saturate has nothing to saturate. Text, edges and colour behind the
 * surface are the only way to see what the tint knobs are actually doing.
 */
export function BusyBackdrop(props: { height?: string; children: JSX.Element }): JSX.Element {
  return (
    <div class="busy" style={{ 'min-height': props.height ?? '260px' }}>
      <div class="busy-art" aria-hidden="true">
        <For each={Array.from({ length: 14 }, (_, i) => i)}>
          {(i) => (
            <div class="busy-line">
              {i % 2 === 0
                ? 'SPY 612.40 +1.2%  ·  QQQ 548.11 −0.4%  ·  NVDA 182.03 +3.8%  ·  ES 6210.25'
                : 'the quick brown fox jumps over the lazy dog 0123456789 ▓▒░ ████ ▲▼ ●○'}
            </div>
          )}
        </For>
      </div>
      <div class="busy-content">{props.children}</div>
    </div>
  );
}

// ── Event log ───────────────────────────────────────────────────────────────

/**
 * Bounded so wheel-spam or an auto-repeat hold cannot grow the log without limit — an
 * unbounded log in a page you leave open is a slow leak, and the oldest entries are never the
 * ones you are looking at anyway.
 */
const EVENT_LOG_MAX_ENTRIES = 300;

export interface EventLogEntry {
  seq: number;
  /** Wall-clock, to the millisecond — a burst of "did that fire twice?" is a timing question. */
  at: string;
  name: string;
  detail: string;
}

export interface EventLogApi {
  entries: Accessor<EventLogEntry[]>;
  log: (name: string, payload?: unknown) => void;
  clear: () => void;
}

/** Compact one-line rendering of a payload. Long values are cut rather than wrapped — the log
 *  is a scan surface, and a payload that reflows the whole panel defeats it. */
const DETAIL_MAX_CHARS = 90;

function serialise(payload: unknown): string {
  if (payload === undefined) return '';
  if (payload === null) return 'null';
  if (typeof payload === 'string') return payload;
  if (typeof payload === 'number' || typeof payload === 'boolean') return String(payload);
  let text: string;
  try {
    text = JSON.stringify(payload) ?? String(payload);
  } catch {
    // A payload with a cycle (a DOM node, a store proxy) must not take the page down. The log
    // is a debugging aid; it does not get to throw.
    text = '[unserialisable]';
  }
  return text.length > DETAIL_MAX_CHARS ? `${text.slice(0, DETAIL_MAX_CHARS)}…` : text;
}

function stamp(d: Date): string {
  const pad = (n: number, w = 2): string => String(n).padStart(w, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

export function createEventLog(): EventLogApi {
  const [entries, setEntries] = createSignal<EventLogEntry[]>([]);
  let seq = 0;

  return {
    entries,
    log: (name, payload) => {
      seq += 1;
      const entry: EventLogEntry = {
        seq,
        at: stamp(new Date()),
        name,
        detail: serialise(payload),
      };
      // NEWEST FIRST, on every page. The event you just caused is the one you are looking for,
      // and a log that appends downward makes you chase it past the fold.
      setEntries((prev) => [entry, ...prev].slice(0, EVENT_LOG_MAX_ENTRIES));
    },
    clear: () => {
      setEntries([]);
      seq = 0;
    },
  };
}

/**
 * The log panel.
 *
 * ALWAYS rendered, even when empty — silence is a result, not an absence. Half the assertions
 * on these pages are of the form "this must NOT emit while you do X" (a picker that is silent
 * until commit, a group that does not re-fire on a re-click of the active option), and you
 * cannot read that off a widget that is not on screen.
 */
export function EventLog(props: { log: EventLogApi; hint?: string }): JSX.Element {
  return (
    <div class="evlog">
      <div class="evlog-head">
        <span class="evlog-title">event log</span>
        <span class="evlog-count">{props.log.entries().length}</span>
        <button class="evlog-clear" onClick={() => props.log.clear()}>
          clear
        </button>
      </div>
      <Show when={props.hint}>
        <div class="evlog-hint">{props.hint}</div>
      </Show>
      <div class="evlog-body">
        <Show
          when={props.log.entries().length > 0}
          fallback={<div class="evlog-empty">— no events — (silence is a result)</div>}
        >
          <For each={props.log.entries()}>
            {(e) => (
              <div class="evlog-row">
                <span class="evlog-seq">{e.seq}</span>
                <span class="evlog-at">{e.at}</span>
                <span class="evlog-name">{e.name}</span>
                <span class="evlog-detail">{e.detail}</span>
              </div>
            )}
          </For>
        </Show>
      </div>
    </div>
  );
}
