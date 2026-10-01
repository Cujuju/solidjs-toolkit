/** jsdom has no layout: a scroller with settable geometry, a manual ResizeObserver and per-row heights. */
import { vi } from 'vitest';
import { render } from '@solidjs/testing-library';
import { createSignal, type Accessor } from 'solid-js';
import { createVirtualLog, type VirtualLogOptions } from '../createVirtualLog';
import { VirtualLog } from '../VirtualLog';

export type Row = { key: string; h: number };

class FakeRO {
  static all: FakeRO[] = [];
  els = new Set<Element>();
  constructor(public cb: ResizeObserverCallback) {
    FakeRO.all.push(this);
  }
  observe(el: Element) {
    this.els.add(el);
  }
  unobserve(el: Element) {
    this.els.delete(el);
  }
  disconnect() {
    this.els.clear();
  }
}

export function installFakes(): void {
  FakeRO.all = [];
  vi.stubGlobal('ResizeObserver', FakeRO);
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'setTimeout', 'queueMicrotask'] });
}

export function mount(rows0: Row[], opts: Partial<VirtualLogOptions<Row>> = {}, view = { height: 100, width: 300 }) {
  const [rows, setRows] = createSignal(rows0);
  const heights = new Map(rows0.map((r) => [r.key, r.h]));
  const writes: number[] = [];
  let scrollTop = 0;
  let log!: ReturnType<typeof createVirtualLog<Row>>;
  let scroller!: HTMLDivElement;

  // Rows report their height by key.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const h = heights.get(this.dataset['rowKey'] ?? '') ?? 0;
    return { height: h, width: view.width, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON() {} } as DOMRect;
  });

  const result = render(() => {
    log = createVirtualLog<Row>({ rows, estimateSize: 20, ...opts });
    return (
      <div
        ref={(el) => {
          scroller = el;
          Object.defineProperties(el, {
            clientHeight: { get: () => view.height, configurable: true },
            clientWidth: { get: () => view.width, configurable: true },
            scrollHeight: { get: () => Math.max(view.height, parseFloat((el.firstElementChild as HTMLElement | null)?.style.height || '0')), configurable: true },
            scrollTop: {
              get: () => scrollTop,
              set: (v: number) => {
                const max = Math.max(0, el.scrollHeight - view.height);
                scrollTop = Math.min(0, Math.max(-max, v));
                writes.push(-scrollTop);
              },
              configurable: true,
            },
          });
          log.ref(el);
        }}
      >
        <VirtualLog log={log}>{(row: Accessor<Row>) => <span>{row().key}</span>}</VirtualLog>
      </div>
    );
  });

  const ro = (): FakeRO => FakeRO.all[FakeRO.all.length - 1]!;
  return {
    log: () => log,
    scroller: () => scroller,
    result,
    setRows,
    rows,
    writes,
    /** The user scrolls (no write recorded): offset from the bottom, then the scroll event. */
    userScrollTo(fromBottom: number) {
      scrollTop = -fromBottom;
      scroller.dispatchEvent(new Event('scroll'));
    },
    native: () => 0 - scrollTop,
    /** Resizes rows and delivers the observer callback. */
    resize(sizes: Record<string, number>) {
      const entries: ResizeObserverEntry[] = [];
      for (const [key, h] of Object.entries(sizes)) {
        heights.set(key, h);
        const el = scroller.querySelector(`[data-row-key="${key}"]`);
        if (el) entries.push({ target: el, borderBoxSize: [{ blockSize: h, inlineSize: view.width }] } as unknown as ResizeObserverEntry);
      }
      ro().cb(entries, ro() as unknown as ResizeObserver);
    },
    setHeight(key: string, h: number) {
      heights.set(key, h);
    },
    drawn: () => [...scroller.querySelectorAll<HTMLElement>('[data-row-key]')].map((e) => e.dataset['rowKey']),
    rowEl: (key: string) => scroller.querySelector<HTMLElement>(`[data-row-key="${key}"]`),
    touch(kind: 'touchstart' | 'touchend', touches: number, target: EventTarget = scroller) {
      const e = new Event(kind, { bubbles: true }) as Event & { touches: unknown[] };
      Object.defineProperty(e, 'touches', { value: Array.from({ length: touches }) });
      target.dispatchEvent(e);
    },
    /** Runs frames until the scroller settles. */
    async settle() {
      await vi.advanceTimersByTimeAsync(400);
    },
    flush: () => vi.advanceTimersByTimeAsync(0),
  };
}

export const rowsOf = (n: number, h = 10, prefix = 'r'): Row[] => Array.from({ length: n }, (_, i) => ({ key: `${prefix}${i}`, h }));
