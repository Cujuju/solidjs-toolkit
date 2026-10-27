import { createSignal, onCleanup, onMount } from 'solid-js';

/** Room kept between the menu and the viewport edge. */
const VIEWPORT_MARGIN_PX = 8;

/** Asks what a centre drop does: swap places with the target, or join it as a tab. Stays inside the viewport. */
export function DockMenu(props: { x: number; y: number; onSwap: () => void; onTab: () => void; onClose: () => void }) {
  let menu!: HTMLDivElement;
  const [position, setPosition] = createSignal({ left: props.x, top: props.y });
  onMount(() => {
    const box = menu.getBoundingClientRect();
    setPosition({
      left: Math.max(VIEWPORT_MARGIN_PX, Math.min(props.x, window.innerWidth - box.width - VIEWPORT_MARGIN_PX)),
      top: Math.max(VIEWPORT_MARGIN_PX, Math.min(props.y, window.innerHeight - box.height - VIEWPORT_MARGIN_PX)),
    });
    menu.querySelector<HTMLButtonElement>('button')?.focus();
    const outside = (event: PointerEvent) => { if (!menu.contains(event.target as Node)) props.onClose(); };
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      props.onClose();
    };
    window.addEventListener('pointerdown', outside, true);
    window.addEventListener('keydown', key, true);
    window.addEventListener('blur', props.onClose);
    onCleanup(() => {
      window.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('blur', props.onClose);
    });
  });
  return (
    <div ref={menu} role="menu" aria-label="Drop tile" class="twm-dock-menu" style={{ left: `${position().left}px`, top: `${position().top}px` }}>
      <button type="button" role="menuitem" class="twm-dock-menu-item" onClick={() => props.onSwap()}>Swap</button>
      <button type="button" role="menuitem" class="twm-dock-menu-item" onClick={() => props.onTab()}>Tab</button>
    </div>
  );
}
