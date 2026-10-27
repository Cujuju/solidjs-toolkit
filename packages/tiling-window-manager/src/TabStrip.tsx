import { createEffect, createSignal, For, onCleanup, Show, untrack, type JSX } from 'solid-js';
import { DOCK_THRESHOLD_PX } from './createDockGesture';
import { planTabFold, tabShowsName, type TabFold, type TabWidths } from './tabStripFold';
import type { TileContext } from './tileContext';

/** Space between a tab's icon and its name; it folds away with the name. */
const ICON_NAME_GAP_PX = 6;
/** Width the More tabs button takes before it has been measured; matches `.twm-tab-more` in styles.css. */
const MORE_BUTTON_PX = 24;
const PRIMARY_BUTTON = 0;

export interface TabStripProps {
  tile: TileContext;
  label: (id: string) => JSX.Element;
  /** With icons, names fold away (inactive first) when the strip runs out of room. */
  icon?: (id: string) => JSX.Element;
  class?: string;
}

/** The tabs of a tile's group, for its header: click or arrow keys select, drag along reorders, drag off docks. */
export function TabStrip(props: TabStripProps) {
  let strip: HTMLDivElement | undefined;
  let list: HTMLDivElement | undefined;
  const buttons = new Map<string, { button: HTMLElement; name: HTMLElement }>();
  const [widths, setWidths] = createSignal<{ room: number | null; tabs: TabWidths[]; trailing: number; more: number } | null>(null);
  const [fold, setFold] = createSignal<TabFold>('full');
  const [scrolls, setScrolls] = createSignal(false);
  const [menu, setMenu] = createSignal(false);
  /** The order shown while a tab is dragged along the strip; committed on release. */
  const [order, setOrder] = createSignal<string[] | null>(null);
  const [draggedId, setDraggedId] = createSignal<string | null>(null);
  let moreButton: HTMLButtonElement | undefined;
  let menuEl: HTMLDivElement | undefined;
  let suppressClick = false;

  const group = () => props.tile.tabs();
  const ids = () => order() ?? group()?.ids ?? [];
  const activeId = () => { const g = group(); return g ? g.ids[g.active] : undefined; };

  const measure = () => {
    if (!strip || !list || !props.icon) return;
    const showing = untrack(fold);
    const tabs = ids().flatMap((id) => {
      const el = buttons.get(id);
      if (!el) return [];
      const active = id === untrack(activeId);
      const compact = el.button.offsetWidth - el.name.offsetWidth - (tabShowsName(showing, active) ? ICON_NAME_GAP_PX : 0);
      return [{ compact, full: compact + ICON_NAME_GAP_PX + el.name.scrollWidth, active }];
    });
    const room = strip.clientWidth || null;
    setWidths({ room, tabs, trailing: parseFloat(getComputedStyle(list).paddingInlineEnd) || 0, more: moreButton?.offsetWidth || MORE_BUTTON_PX });
    setScrolls(list.scrollWidth > list.clientWidth);
  };
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : undefined;
  onCleanup(() => observer?.disconnect());
  createEffect(() => {
    const measured = widths();
    setFold(measured ? planTabFold({ room: measured.room, tabs: measured.tabs, trailing: measured.trailing, foldControl: measured.more, previous: untrack(fold) }) : 'full');
  });
  createEffect(() => { activeId(); queueMicrotask(measure); });
  // A press outside the open menu closes it.
  createEffect(() => {
    if (!menu()) return;
    const close = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuEl?.contains(target) && !moreButton?.contains(target)) setMenu(false);
    };
    window.addEventListener('pointerdown', close, true);
    onCleanup(() => window.removeEventListener('pointerdown', close, true));
  });

  const select = (index: number) => {
    const g = group();
    if (!g) return;
    g.select(index);
    buttons.get(g.ids[index])?.button.focus();
  };
  const navigate = (event: KeyboardEvent, index: number) => {
    const count = ids().length;
    const next = event.key === 'ArrowRight' ? (index + 1) % count : event.key === 'ArrowLeft' ? (index + count - 1) % count
      : event.key === 'Home' ? 0 : event.key === 'End' ? count - 1 : undefined;
    if (next === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    select(next);
  };

  // Along the strip a drag reorders; once the pointer leaves the strip's band it becomes a dock drag.
  const press = (id: string, event: PointerEvent) => {
    if (event.button !== PRIMARY_BUTTON || !list) return;
    const { clientX: startX, clientY: startY } = event;
    let moved = false;
    const move = (next: PointerEvent) => {
      if (!moved && Math.hypot(next.clientX - startX, next.clientY - startY) < DOCK_THRESHOLD_PX) return;
      moved = true;
      setDraggedId(id);
      const band = list!.getBoundingClientRect();
      if (next.clientY < band.top - DOCK_THRESHOLD_PX || next.clientY > band.bottom + DOCK_THRESHOLD_PX) {
        finish(false);
        group()?.drag(id, next);
        return;
      }
      const others = ids().filter((other) => other !== id);
      const before = others.filter((other) => {
        const box = buttons.get(other)?.button.getBoundingClientRect();
        return box ? box.left + box.width / 2 < next.clientX : false;
      }).length;
      others.splice(before, 0, id);
      setOrder(others);
    };
    const up = () => finish(true);
    const finish = (commit: boolean) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      const shown = order();
      setOrder(null);
      setDraggedId(null);
      suppressClick = moved;
      if (commit && shown) group()?.move(id, shown.indexOf(id));
    };
    const cancel = () => finish(false);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  };

  return (
    <Show when={group()}>
      <div ref={(el) => { strip = el; observer?.observe(el); }} class={`twm-tabs${props.class ? ` ${props.class}` : ''}`} data-twm-no-drag>
        <div ref={(el) => { list = el; observer?.observe(el); }} role="tablist" aria-orientation="horizontal" class="twm-tab-list">
          <For each={ids()}>
            {(id, index) => {
              const active = () => activeId() === id;
              const showName = () => !props.icon || tabShowsName(fold(), active());
              let button: HTMLButtonElement | undefined;
              let name: HTMLSpanElement | undefined;
              const register = () => { if (button && name) { buttons.set(id, { button, name }); observer?.observe(button); } };
              onCleanup(() => { if (button) observer?.unobserve(button); buttons.delete(id); });
              return (
                <button ref={(el) => { button = el; register(); }} type="button" role="tab" class="twm-tab" aria-selected={active()}
                  tabIndex={active() ? 0 : -1} data-dragging={draggedId() === id || undefined}
                  onPointerDown={(event) => press(id, event)}
                  onClick={() => { if (suppressClick) { suppressClick = false; return; } select(group()!.ids.indexOf(id)); }}
                  onKeyDown={(event) => navigate(event, index())}>
                  <Show when={props.icon}>{(icon) => icon()(id)}</Show>
                  {/* Folded names stay in the DOM: they name the tab for assistive tech and keep their width measurable. */}
                  <span ref={(el) => { name = el; register(); }} class="twm-tab-name"
                    style={{ 'max-width': showName() ? undefined : '0', 'margin-inline-start': props.icon && showName() ? `${ICON_NAME_GAP_PX}px` : '0' }}>
                    {props.label(id)}
                  </span>
                </button>
              );
            }}
          </For>
        </div>
        <Show when={fold() !== 'full' || scrolls()}>
          <button ref={moreButton} type="button" class="twm-tab-more" aria-label="More tabs" aria-haspopup="menu" aria-expanded={menu()}
            onClick={() => setMenu(!menu())}>⋯</button>
        </Show>
        <Show when={menu()}>
          <div ref={menuEl} role="menu" class="twm-tab-menu" onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); setMenu(false); moreButton?.focus(); } }}>
            <For each={group()!.ids}>
              {(id, index) => (
                <button type="button" role="menuitemradio" aria-checked={activeId() === id} class="twm-tab-menu-item"
                  onClick={() => { setMenu(false); select(index()); }}>{props.label(id)}</button>
              )}
            </For>
          </div>
        </Show>
      </div>
    </Show>
  );
}
