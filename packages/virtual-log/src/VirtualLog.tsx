import { For, Show, createEffect, createMemo, createSignal, on, onCleanup, onMount, type Accessor, type JSX } from 'solid-js';
import { toDevicePx } from './_internal/dom';
import type { VirtualLogController } from './createVirtualLog';

export interface VirtualLogProps<R> {
  log: VirtualLogController<R>;
  class?: string;
  /** Opens a row's menu: from the ContextMenu key or Shift+F10 on a focused row, or a `contextmenu` aimed at the row itself. */
  onRowMenu?: (rowEl: HTMLElement) => void;
  children: (row: Accessor<R>) => JSX.Element;
}

/**
 * The log's canvas; place it inside the scroller given `log.ref`. One element per row key, so a row's media survives
 * rows added around it. Keyboard: one Tab stop; ArrowUp/ArrowDown move between rows; the menu key opens `onRowMenu`.
 */
export function VirtualLog<R>(props: VirtualLogProps<R>): JSX.Element {
  const log = props.log;
  const rowEls = new Map<string, HTMLElement>();
  const [current, setCurrent] = createSignal<string | null>(null);
  /** Last row focused while drawn, else the newest in view. */
  const tabStop = createMemo(() => {
    const c = current();
    if (c !== null && log.keys().includes(c)) return c;
    return log.inViewKey();
  });

  let pendingFocus: string | null = null;
  const focusRow = (key: string): void => {
    setCurrent(key);
    log.scrollToKey(key);
    const el = rowEls.get(key);
    if (el) el.focus({ preventScroll: true });
    else pendingFocus = key;
  };
  createEffect(
    on(log.keys, () => {
      const el = pendingFocus === null ? undefined : rowEls.get(pendingFocus);
      if (!el) return;
      pendingFocus = null;
      queueMicrotask(() => el.isConnected && el.focus({ preventScroll: true }));
    }),
  );

  const onKeyDown = (e: KeyboardEvent): void => {
    // Only on a row itself: its fields and buttons keep their keys.
    const target = e.target as HTMLElement;
    const focused = target.dataset?.['rowKey'];
    if (focused === undefined || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
      if (!props.onRowMenu) return;
      e.preventDefault();
      props.onRowMenu(target);
      return;
    }
    const step = { ArrowUp: -1, ArrowDown: 1 }[e.key];
    if (step === undefined) return;
    const all = log.allKeys();
    const next = all[all.indexOf(focused) + step];
    if (next === undefined) return;
    e.preventDefault();
    focusRow(next);
  };

  // Structural geometry only: the canvas spans the whole log (never shrunk by the column-reverse scroller) and clips
  // what lies past it, so rows can't change the scroll extent; the layer carries the shift taken mid-scroll.
  return (
    <div
      ref={(el) => log.attachCanvas(el)}
      class={props.class}
      style={{ height: `${log.extent()}px`, position: 'relative', 'flex-shrink': 0, 'overflow-y': 'clip' }}
      onKeyDown={onKeyDown}
    >
      <div style={{ position: 'absolute', inset: 0, transform: `translateY(${toDevicePx(log.shift())}px)` }}>
        <For each={log.keys()}>
          {(key) => {
            let el!: HTMLDivElement;
            onMount(() => log.observeRow(el, key));
            onCleanup(() => {
              log.unobserveRow(el);
              if (rowEls.get(key) === el) rowEls.delete(key);
            });
            const onContextMenu = (e: MouseEvent): void => {
              if (e.target !== el || !props.onRowMenu) return;
              e.preventDefault();
              props.onRowMenu(el);
            };
            return (
              <div
                ref={(e) => {
                  el = e;
                  rowEls.set(key, e);
                }}
                data-row-key={key}
                tabIndex={tabStop() === key ? 0 : -1}
                onFocus={() => setCurrent(key)}
                onContextMenu={onContextMenu}
                style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', transform: `translateY(${-toDevicePx(log.startOf(key))}px)` }}
              >
                <Show when={log.rowByKey(key)}>{(row) => props.children(row)}</Show>
              </div>
            );
          }}
        </For>
      </div>
    </div>
  );
}
