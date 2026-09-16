import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  on,
  useContext,
  type JSX,
} from 'solid-js';
import {
  AccordionGroupContext,
  createMapSlot,
  slotRef,
  type AccordionGroupApi,
} from './context';
import {
  buildCrumbPath,
  elideCrumbs,
  type BreadcrumbEntry,
  type CrumbData,
} from './breadcrumbPath';

/**
 * The path across the open columns: `src › components › AppShell.tsx`. It owns NO open state
 * — everything drawn is a pure read. See DESIGN_NOTES.md § src/Breadcrumb.tsx:24.
 */

/** Default separator. `›` rather than `/` or `>`: the chrome is already dense, and the light
 *  chevron reads as structure rather than punctuation. */
const DEFAULT_SEPARATOR = '›';

/**
 * Ref-map key for the elision button, so it joins arrow-key movement. Residual: a panel with
 * this literal id would share the slot, affecting only which element a key focuses.
 */
const ELLIPSIS_KEY = '#acc-breadcrumb-ellipsis';

export interface BreadcrumbProps {
  /**
   * The group to describe. Optional: a breadcrumb inside the group reads context, but the
   * Miller layout wants the bar ABOVE the columns, so the out-of-tree case is the primary one.
   */
  group?: AccordionGroupApi;

  /**
   * Render the CONTENT of a crumb, not the element: the wrapper carries the tab stop, click
   * and keyboard handling. `index` is the position among VISIBLE entries.
   */
  renderCrumb?: (crumb: CrumbData, index: number) => JSX.Element;

  /**
   * Separator between crumbs. Pass an INLINE expression: Solid wraps a prop in a getter, so a
   * stored node would be moved to the last slot and appear once.
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
  // Context is resolved once — a context value is fixed for a subtree. The `group` PROP is read
  // through an accessor, so a consumer that swaps groups is followed.
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

  /** Identity of the current path. NUL delimits, and it MUST be the escape sequence: a literal
   *  NUL reads as binary. See DESIGN_NOTES.md § src/Breadcrumb.tsx:113. */
  const pathKey = createMemo<string>(() => path().map((c) => c.id).join('\0'));

  const [expanded, setExpanded] = createSignal(false);
  // Re-collapse whenever the path changes: expanding is a request to see THIS path in full,
  // not a mode. `defer` so the initial computation does not fight a fresh flag.
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
   * Focusable elements by key, through the shared slot rather than a bare `els.set`, which
   * would keep detached nodes. See DESIGN_NOTES.md § src/Breadcrumb.tsx:150.
   */
  const els = new Map<string, HTMLElement>();
  const elSlot = createMapSlot(els);
  /** `null` = untouched, so the tab stop sits on the LAST focusable crumb. Clamped on read,
   *  because the path can shrink under a stale index. */
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

  /** Expand the elided middle and focus its first revealed crumb: the ellipsis unmounts itself, so focus would otherwise fall to `<body>`. */
  const expandFrom = (hidden: readonly CrumbData[]): void => {
    setExpanded(true);
    const first = hidden[0];
    if (first === undefined) return;
    const index = focusKeys().indexOf(first.id);
    if (index < 0) return;
    focusAt(index);
  };

  /** Index step for ArrowRight. Crumbs run in DOM order along the inline axis, which RTL mirrors. */
  const inlineStep = (e: KeyboardEvent): number =>
    e.target instanceof Element && window.getComputedStyle(e.target).direction === 'rtl' ? -1 : 1;

  /**
   * Arrow movement along the bar. Deliberately does NOT wrap: a path has real ends, and
   * jumping from the deepest column to the root would misreport the structure.
   */
  const onKeyDown = (e: KeyboardEvent, key: string): void => {
    const from = focusKeys().indexOf(key);
    if (from < 0) return;
    switch (e.key) {
      case 'ArrowRight':
        focusAt(from + inlineStep(e));
        break;
      case 'ArrowLeft':
        focusAt(from - inlineStep(e));
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

  /** Plain-text summary of what the ellipsis stands for. Crumbs labelled with JSX contribute
   *  nothing to a `title`, so they are skipped rather than rendered as `[object Object]`. */
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
                {/* Separator BEFORE every entry but the first, so it never trails the current
                                location. `aria-hidden` because the list structure already conveys order. */}
                <Show when={i() > 0}>
                  <span class="acc-breadcrumb-sep" aria-hidden="true">
                    {separator()}
                  </span>
                </Show>

                {entry.kind === 'ellipsis' ? (
                  <button
                    ref={slotRef(elSlot, ELLIPSIS_KEY)}
                    type="button"
                    class="acc-breadcrumb-crumb acc-breadcrumb-ellipsis"
                    // Expands rather than merely marking the gap: an elision the user cannot open
                    // is information deleted.
                    title={hiddenSummary(entry.hidden)}
                    aria-label={hiddenSummary(entry.hidden)}
                    tabIndex={isTabStop(ELLIPSIS_KEY) ? 0 : -1}
                    /* From state, not hardcoded: it renders only while collapsed today. */
                    aria-expanded={expanded()}
                    onFocus={() => setFocusIndex(focusKeys().indexOf(ELLIPSIS_KEY))}
                    onKeyDown={(e) => onKeyDown(e, ELLIPSIS_KEY)}
                    onClick={() => expandFrom(entry.hidden)}
                  >
                    …
                  </button>
                ) : entry.crumb.isCurrent ? (
                  /* The current location is text, not a control — there is nothing after it to
                                       truncate, so a button would be a click that does nothing. */
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
                    ref={slotRef(elSlot, entry.crumb.id)}
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
