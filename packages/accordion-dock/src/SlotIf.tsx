import { children, Show, type JSX } from 'solid-js';

/** Renders a JSX slot in `wrap` when it has content, reading it once. Each instance owns its copy, so one slot can show in several places. */
export function SlotIf(props: { content: JSX.Element; wrap: (content: JSX.Element) => JSX.Element }): JSX.Element {
  const content = children(() => props.content);
  return <Show when={content()}>{props.wrap(content())}</Show>;
}
