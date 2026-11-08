/** DOM access for the overlay page (CONTRIBUTING §1): size reporting and pointer tracking. Call from onMount only. */

/** Calls `report` with the element's size whenever it may have changed; returns a stop function. */
export function watchSize(el: HTMLElement, report: (width: number, height: number) => void): () => void {
  let last = { width: -1, height: -1 };
  const measure = () => {
    const r = el.getBoundingClientRect();
    const size = { width: Math.ceil(r.width), height: Math.ceil(r.height) };
    if (size.width === last.width && size.height === last.height) return;
    last = size;
    report(size.width, size.height);
  };
  // A hidden window never paints, so ResizeObserver stays silent; DOM changes still report, so the next notice shows it.
  const mutations = new MutationObserver(measure);
  mutations.observe(el, { subtree: true, childList: true, attributes: true, characterData: true });
  // Size changes from CSS alone (hover), while visible.
  const resizes = new ResizeObserver(measure);
  resizes.observe(el);
  measure();
  return () => {
    mutations.disconnect();
    resizes.disconnect();
  };
}

/** Calls `report` when the pointer enters or leaves anything matching `selector`; returns a stop function. */
export function watchPointer(selector: string, report: (over: boolean) => void): () => void {
  let over = false;
  const track = (target: EventTarget | null) => {
    const now = target instanceof Element && target.closest(selector) !== null;
    if (now === over) return;
    over = now;
    report(now);
  };
  const onMove = (e: MouseEvent) => track(e.target);
  const onLeave = () => track(null);
  document.addEventListener('mousemove', onMove);
  document.documentElement.addEventListener('mouseleave', onLeave);
  return () => {
    document.removeEventListener('mousemove', onMove);
    document.documentElement.removeEventListener('mouseleave', onLeave);
  };
}

/** Local clock time of a notice. */
export const clockTime = (at: number): string => new Date(at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

/** Whether the notice with `id` is rendered under `root` (its element carries data-notice-id). */
export const hasNoticeElement = (root: HTMLElement, id: number): boolean => root.querySelector(`[data-notice-id="${id}"]`) !== null;
