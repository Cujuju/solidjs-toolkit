import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  on,
  onCleanup,
  useContext,
  type JSX,
} from 'solid-js';
import { AccordionGroupContext, type AccordionGroupApi } from './context';
import {
  buildCrumbPath,
  elideCrumbs,
  type BreadcrumbEntry,
  type CrumbData,
} from './breadcrumbPath';

/**
 * MOCK — same status as the rest of this directory.
 *
 * The path across the open columns, for the Miller-column use of the dock:
 * `src › components › AppShell.tsx`. Clicking a crumb truncates the chain.
 *
 * It owns NO open state. Everything it draws comes from `buildCrumbPath`, which
 * is a pure read of `visualOpenIds()` + `meta()`; everything it does goes back
 * through `setOpen` / the consumer's `onTruncate`. A breadcrumb that cached what
 * was open would be a second source of truth about the dock, and the first thing
 * it would do is disagree with the columns next to it.
 *
 * The only local state is presentational: which crumb holds the roving tab stop,
 * and whether the user has expanded an elided middle.
 */

/** Default separator glyph. `›` rather than `/` or `>` because the dock's chrome
 *  is already dense and the light chevron reads as structure rather than as
 *  punctuation inside a filename. */
const DEFAULT_SEPARATOR = '›';

/**
 * Ref-map key for the elision button, so it can take part in arrow-key movement
 * alongside real crumbs (which are keyed by panel id).
 *
 * Residual failure mode, stated rather than hidden: a panel whose id is literally
 * this string would share the slot. The consequence is confined to which element
 * an arrow key focuses — no open, close or truncate is routed through this map —
 * and the `#` prefix is not something an author writes in an `id` prop.
 */
const ELLIPSIS_KEY = '#acc-breadcrumb-ellipsis';

export interface BreadcrumbProps {
  /**
   * The group to describe. Optional: a breadcrumb rendered INSIDE the group picks
   * it up from context, but the Miller layout wants the bar ABOVE the columns —
   * and in `horizontal` orientation anything inside the group is itself a column.
   * So the out-of-tree case (via `apiRef`) is the primary one, and it is a prop.
   */
  group?: AccordionGroupApi;

  /**
   * Render the CONTENT of a crumb. `index` is the position among VISIBLE entries
   * (post-elision); `crumb.index` is the position in the full path.
   *
   * Deliberately the content, not the whole element: the wrapper carries the tab
   * stop, `aria-current`, the click-to-truncate and the arrow-key handler, and
   * handing those to every custom renderer is how a control loses its keyboard
   * story one consumer at a time. A consumer who genuinely needs to own the
   * element should skip this component and render from `buildCrumbPath` +
   * `elideCrumbs`, which are exported for exactly that.
   */
  renderCrumb?: (crumb: CrumbData, index: number) => JSX.Element;

  /**
   * Separator between crumbs. Pass an INLINE expression (`separator={<Sep />}`),
   * not a stored node: Solid wraps a prop expression in a getter, so an inline
   * one yields a fresh node per separator, while a variable holding a single node
   * would be moved to the last slot and appear exactly once.
   */
  separator?: JSX.Element;

  /** See `CrumbPathOptions.onTruncate` — required wiring when the path ends in a
   *  controlled `<AccordionLeaf>`. */
  onTruncate?: (closedIds: readonly string[], crumb: CrumbData) => void;

  class?: string;
  /** Landmark label. Defaults to `'Breadcrumb'`. */
  ariaLabel?: string;
}

export function Breadcrumb(props: BreadcrumbProps): JSX.Element {
  // Context is resolved once — a Solid context value is fixed for a subtree, so
  // there is nothing reactive to preserve here. The `group` PROP is read through
  // an accessor so a consumer that swaps groups is followed.
  const contextGroup = useContext(AccordionGroupContext);
  const group = (): AccordionGroupApi => {
    const g = props.group ?? contextGroup;
    if (g === undefined) {
      throw new Error(
        '<Breadcrumb> needs a group: render it inside an <AccordionGroup>, or pass the ' +
          '`group` prop (captured from <AccordionGroup apiRef>).',
      );
    }
    return g;
  };

  const path = createMemo<CrumbData[]>(() =>
    buildCrumbPath(group(), { onTruncate: props.onTruncate }),
  );

  /** Identity of the current path, used only to decide when an expansion the user
   *  asked for has been answered by the path itself changing.
   *
   *  NUL is the delimiter because no panel id can contain one, so two different
   *  paths can never join into the same key.
   *
   *  It MUST be written as the escape sequence and never as a raw byte. A literal
   *  NUL sat in this line until 2026-07-24, and one such byte makes `file(1)`
   *  report the whole module as `data` — at which point grep skips it as binary,
   *  silently and with no error. Every code search, audit sweep and `grep -r` in
   *  this repo was blind to this file for as long as that byte was there, which
   *  is exactly how a dead-code sweep reported its classes unused. */
  const pathKey = createMemo<string>(() => path().map((c) => c.id).join('\0'));

  const [expanded, setExpanded] = createSignal(false);
  // Re-collapse whenever the path changes. Expanding is a request to see THIS
  // path in full, not a mode — leaving it latched would silently retire the
  // overflow guarantee for the rest of the session. `defer` so the initial
  // computation does not immediately fight a freshly-set flag.
  createEffect(on(pathKey, () => setExpanded(false), { defer: true }));

  const entries = createMemo<BreadcrumbEntry[]>(() =>
    expanded()
      ? path().map((crumb) => ({ kind: 'crumb', crumb }))
      : elideCrumbs(path()),
  );

  /**
   * Keys of the entries that can take focus, in DOM order: every crumb except the
   * current one (which is text, not a control) plus the elision button.
   */
  const focusKeys = createMemo<string[]>(() =>
    entries()
      .filter((e) => (e.kind === 'ellipsis' ? true : !e.crumb.isCurrent))
      .map((e) => (e.kind === 'ellipsis' ? ELLIPSIS_KEY : e.crumb.id)),
  );

  /**
   * Focusable elements by key, for arrow-key movement. Registered through
   * `trackEl` rather than a bare `els.set`, because a ref that only ever adds
   * would keep a detached node alive for every crumb the path has ever held —
   * and `focusAt` could then move focus into a node that is no longer in the
   * document.
   */
  const els = new Map<string, HTMLElement>();
  const trackEl = (key: string, el: HTMLElement): void => {
    els.set(key, el);
    // Runs under the <For> item's owner, so it fires when that crumb leaves.
    onCleanup(() => {
      if (els.get(key) === el) els.delete(key);
    });
  };
  /** `null` = untouched, so the tab stop sits on the LAST focusable crumb — the
   *  one nearest where the user actually is. Clamped on read rather than kept in
   *  range on write, because the path can shrink under a stale index. */
  const [focusIndex, setFocusIndex] = createSignal<number | null>(null);

  const activeFocusIndex = (): number => {
    const n = focusKeys().length;
    if (n === 0) return -1;
    const want = focusIndex();
    if (want === null) return n - 1;
    return Math.max(0, Math.min(want, n - 1));
  };

  const isTabStop = (key: string): boolean =>
    focusKeys()[activeFocusIndex()] === key;

  const focusAt = (index: number): void => {
    const keys = focusKeys();
    if (keys.length === 0) return;
    const clamped = Math.max(0, Math.min(index, keys.length - 1));
    setFocusIndex(clamped);
    els.get(keys[clamped])?.focus();
  };

  /**
   * Arrow movement along the bar. Deliberately does NOT wrap: a path has real
   * ends, and jumping from the deepest column back to the root would misreport
   * the structure the bar exists to show. Home/End reach the ends directly.
   */
  const onKeyDown = (e: KeyboardEvent, key: string): void => {
    const from = focusKeys().indexOf(key);
    if (from < 0) return;
    switch (e.key) {
      case 'ArrowRight':
        focusAt(from + 1);
        break;
      case 'ArrowLeft':
        focusAt(from - 1);
        break;
      case 'Home':
        focusAt(0);
        break;
      case 'End':
        focusAt(focusKeys().length - 1);
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  /** Plain-text summary of what the ellipsis is standing in for. Crumbs labelled
   *  with JSX contribute nothing to a `title` attribute, so they are skipped
   *  rather than rendered as `[object Object]`. */
  const hiddenSummary = (hidden: readonly CrumbData[]): string => {
    const names = hidden.map((c) => c.text).filter((t): t is string => t !== undefined);
    return names.length === 0
      ? `Show ${hidden.length} hidden`
      : `Show ${hidden.length} hidden: ${names.join(' › ')}`;
  };

  const separator = (): JSX.Element => props.separator ?? DEFAULT_SEPARATOR;

  return (
    <Show when={path().length > 0}>
      <nav
        class={`acc-breadcrumb ${props.class ?? ''}`.trim()}
        aria-label={props.ariaLabel ?? 'Breadcrumb'}
      >
        <ol class="acc-breadcrumb-list">
          <For each={entries()}>
            {(entry, i) => (
              <li class="acc-breadcrumb-item">
                {/* Separator BEFORE every entry but the first, so it never
                    trails the current location. `aria-hidden` because the list
                    structure already conveys the sequence to assistive tech;
                    reading "chevron" between every crumb is noise. */}
                <Show when={i() > 0}>
                  <span class="acc-breadcrumb-sep" aria-hidden="true">
                    {separator()}
                  </span>
                </Show>

                {entry.kind === 'ellipsis' ? (
                  <button
                    ref={(el) => trackEl(ELLIPSIS_KEY, el)}
                    type="button"
                    class="acc-breadcrumb-crumb acc-breadcrumb-ellipsis"
                    // Expands rather than merely marking the gap: an elision the
                    // user cannot open is information deleted, and the hidden
                    // crumbs are the only route to those columns from here.
                    title={hiddenSummary(entry.hidden)}
                    aria-label={hiddenSummary(entry.hidden)}
                    tabIndex={isTabStop(ELLIPSIS_KEY) ? 0 : -1}
                    aria-expanded={false}
                    onFocus={() => setFocusIndex(focusKeys().indexOf(ELLIPSIS_KEY))}
                    onKeyDown={(e) => onKeyDown(e, ELLIPSIS_KEY)}
                    onClick={() => setExpanded(true)}
                  >
                    …
                  </button>
                ) : entry.crumb.isCurrent ? (
                  /* The current location is text, not a control — the standard
                     breadcrumb treatment, and the honest one: there is nothing
                     after it to truncate, so a button here would be a click that
                     does nothing. */
                  <span
                    class="acc-breadcrumb-crumb acc-breadcrumb-current"
                    aria-current="page"
                    title={entry.crumb.text}
                    data-leaf={entry.crumb.isLeaf ? 'true' : 'false'}
                  >
                    {props.renderCrumb?.(entry.crumb, i()) ?? entry.crumb.label}
                  </span>
                ) : (
                  <button
                    ref={(el) => trackEl(entry.crumb.id, el)}
                    type="button"
                    class="acc-breadcrumb-crumb"
                    title={entry.crumb.text}
                    data-leaf={entry.crumb.isLeaf ? 'true' : 'false'}
                    data-pinned={entry.crumb.isPinned ? 'true' : 'false'}
                    tabIndex={isTabStop(entry.crumb.id) ? 0 : -1}
                    onFocus={() => setFocusIndex(focusKeys().indexOf(entry.crumb.id))}
                    onKeyDown={(e) => onKeyDown(e, entry.crumb.id)}
                    onClick={() => entry.crumb.select()}
                  >
                    {props.renderCrumb?.(entry.crumb, i()) ?? entry.crumb.label}
                  </button>
                )}
              </li>
            )}
          </For>
        </ol>
      </nav>
    </Show>
  );
}

export type { CrumbData, BreadcrumbEntry } from './breadcrumbPath';
