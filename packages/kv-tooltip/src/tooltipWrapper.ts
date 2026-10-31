import { createEffect, createMemo, createSignal, createUniqueId, onCleanup, onMount, type Accessor, type JSX } from 'solid-js';
import type { KvTooltipProps } from './types';

/** Visually hidden. Inline, not a class, so it stays hidden without the package stylesheet. */
export const SR_ONLY_STYLE: JSX.CSSProperties = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: '0',
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  'white-space': 'nowrap',
  border: '0',
};

/** Elements that already take keyboard focus — see the `focusable` prop. */
const FOCUSABLE_SELECTOR =
  'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [contenteditable=""], [contenteditable="true"], [tabindex]:not([tabindex="-1"]):not(:disabled)';

/** The attributes `FOCUSABLE_SELECTOR` reads — a change to any of them can flip the AUTO probe. */
const FOCUSABLE_ATTRIBUTES = ['href', 'contenteditable', 'tabindex', 'disabled'];

/**
 * No `position: relative` outside `text`: the portalled fixed panel doesn't need a
 * containing block, and it could create an unwanted stacking context.
 */
export function wrapperStyle(layout: 'text' | 'control' | 'contents' | 'block'): JSX.CSSProperties {
  if (layout === 'contents') return { display: 'contents' };
  if (layout === 'block') return { display: 'block', width: '100%' };
  if (layout === 'control') return { display: 'inline-flex', 'align-items': 'center' };
  return {
    position: 'relative',
    display: 'inline',
    overflow: 'hidden',
    'text-overflow': 'ellipsis',
  };
}

/** `key: value` per pair — the fallback accessible text for a KV tooltip. */
function describeEntries(entries: Array<[string, string]>): string {
  return entries.map(([k, v]) => `${k}: ${v}`).join('. ');
}

export function createTooltipDescription(
  props: KvTooltipProps,
  filtered: Accessor<Array<[string, string]>>,
  wrapperEl: Accessor<HTMLSpanElement | undefined>,
) {
  // ── Accessible description ────────────────────────────────────────────────
  // The hidden node is all a screen reader can reach; always mounted so
  // `aria-describedby` never dangles.
  const describeTrigger = (): boolean => props.describeTrigger ?? true;
  const descriptionId = createUniqueId();
  const description = (): string => {
    if (!describeTrigger()) return '';
    const explicit = props.description?.trim();
    if (explicit) return explicit;
    return describeEntries(filtered());
  };
  const hasDescription = createMemo(() => description().length > 0);

  // Bumped on any DOM change under the wrapper that the trigger probes below
  // depend on, so they follow the live trigger rather than only prop changes.
  const [triggerDomTick, setTriggerDomTick] = createSignal(0);
  onMount(() => {
    const el = wrapperEl();
    if (!el) return;
    const observer = new MutationObserver(() => setTriggerDomTick((n) => n + 1));
    observer.observe(el, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: FOCUSABLE_ATTRIBUTES,
    });
    onCleanup(() => observer.disconnect());
    // The wrapper only has children once rendered; seed the memo below.
    setTriggerDomTick((n) => n + 1);
  });

  /**
   * The live trigger element. Memo equality absorbs the wrapper churn the observer
   * reports — Solid's Portal marker enters and leaves on every show.
   */
  const triggerChild = createMemo<HTMLElement | null>(() => {
    triggerDomTick();
    // The control users reach, even when nested (`<span><button>`); else the first child.
    return (
      wrapperEl()?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ??
      (wrapperEl()?.firstElementChild as HTMLElement | null) ??
      null
    );
  });

  /**
   * `aria-describedby` isn't inherited, so it goes on the wrapper AND the child control users
   * actually reach, preserving the child's existing ids.
   */
  createEffect(() => {
    const child = triggerChild();
    if (!hasDescription()) return;
    if (!child || child.id === descriptionId) return;
    const existing = (child.getAttribute('aria-describedby') ?? '')
      .split(/\s+/)
      .filter(Boolean);
    if (existing.includes(descriptionId)) return;
    child.setAttribute('aria-describedby', [...existing, descriptionId].join(' '));
    onCleanup(() => {
      const left = (child.getAttribute('aria-describedby') ?? '')
        .split(/\s+/)
        .filter((id) => id && id !== descriptionId);
      if (left.length > 0) child.setAttribute('aria-describedby', left.join(' '));
      else child.removeAttribute('aria-describedby');
    });
  });

  /**
   * AUTO focusability, probed from the live DOM (a `<Show>`-gated control can appear later),
   * so a wrapped button keeps one tab stop.
   */
  const [childFocusable, setChildFocusable] = createSignal(false);
  createEffect(() => {
    // Track the description so the probe re-runs on the same edges the wiring
    // above does; the DOM read itself is untracked by nature.
    hasDescription();
    triggerDomTick();
    const el = wrapperEl();
    if (!el) return;
    setChildFocusable(el.querySelector(FOCUSABLE_SELECTOR) !== null);
  });
  const wrapperLayout = (): 'text' | 'control' | 'contents' | 'block' => props.wrapperLayout ?? 'text';
  const wrapperTabIndex = (): number | undefined => {
    if (!describeTrigger() || !hasDescription()) return undefined;
    // `display: contents` has no box to draw a focus ring; the child owns the keyboard path.
    if (wrapperLayout() === 'contents') return undefined;
    const forced = props.focusable;
    if (forced !== undefined) return forced ? 0 : undefined;
    return childFocusable() ? undefined : 0;
  };

  return { describeTrigger, descriptionId, description, hasDescription, wrapperLayout, wrapperTabIndex };
}
