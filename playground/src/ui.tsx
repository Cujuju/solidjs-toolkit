import type { JSX } from 'solid-js';

/**
 * Playground chrome — the bits every package page reuses.
 *
 * The HOSTILE ANCESTOR boxes are the point of this file. Nearly every floating surface in the
 * toolkit (pop-outs, flyouts, tooltips, menus) is correct in isolation and broken inside a
 * clipping or scrolling parent, which is exactly where a real app puts it. A page that only
 * renders a control on an empty canvas proves nothing. So: put it in the box that breaks it.
 */

export function Card(props: { cap: string; children: JSX.Element }): JSX.Element {
  return (
    <div class="card">
      <div class="cap">{props.cap}</div>
      <div class="body">{props.children}</div>
    </div>
  );
}

export function Note(props: { children: JSX.Element }): JSX.Element {
  return <p class="note">{props.children}</p>;
}

export function H2(props: { children: JSX.Element }): JSX.Element {
  return <h2>{props.children}</h2>;
}

export function Row(props: { children: JSX.Element }): JSX.Element {
  return <div class="row">{props.children}</div>;
}

/** `overflow: hidden` — clips an in-flow expansion dead. */
export function ClipBox(props: { width?: string; children: JSX.Element }): JSX.Element {
  return (
    <div class="clip" style={{ width: props.width ?? '150px' }}>
      {props.children}
    </div>
  );
}

/** `overflow-y: auto` — clips, AND scrolls the anchor out from under a fixed-positioned panel.
 *  A panel that does not listen for scroll in the CAPTURE phase will not hear this box move. */
export function ScrollBox(props: {
  width?: string;
  height?: string;
  children: JSX.Element;
}): JSX.Element {
  return (
    <div
      class="scrollbox"
      style={{ width: props.width ?? '210px', 'max-height': props.height ?? '132px' }}
    >
      {props.children}
      {/* Filler, so the box has something to scroll even when the content is short. */}
      <div class="scrollfill">scroll me while a panel is open</div>
    </div>
  );
}

/** Flush against the right edge of its container — a panel wider than its anchor must clamp. */
export function EdgeRight(props: { children: JSX.Element }): JSX.Element {
  return <div class="edge-right">{props.children}</div>;
}

/** Vertical spacer, to push a control to the bottom of the scroll and force an upward flip. */
export function Tall(): JSX.Element {
  return <div class="tall" />;
}
