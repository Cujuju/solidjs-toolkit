import { getGlobalTarget, safeAddEventListener } from '@cujuju/solidjs-hooks';
import { createSignal, onCleanup } from 'solid-js';

import { prepareDocument } from './tearOffDocument';
import {
  TEAR_OFF_CLOSE_POLL_MS,
  TEAR_OFF_DEFAULT_HEIGHT_PX,
  TEAR_OFF_DEFAULT_WIDTH_PX,
  TEAR_OFF_WINDOW_NAME_PREFIX,
  featureString,
  readGeometry,
  sampleGeometry,
  writeGeometry,
  type TearOffController,
  type TearOffGeometry,
  type TearOffOptions,
  type TearOffResult,
  type TornWindow,
} from './tearOffModel';
export {
  TEAR_OFF_CLOSE_POLL_MS,
  TEAR_OFF_DEFAULT_HEIGHT_PX,
  TEAR_OFF_DEFAULT_WIDTH_PX,
  TEAR_OFF_GEOMETRY_VERSION,
  TEAR_OFF_MIN_WINDOW_PX,
  TEAR_OFF_ORPHAN_WATCHDOG_MS,
} from './tearOffModel';
export type {
  AccordionTearOffApi,
  TearOffController,
  TearOffFailureReason,
  TearOffGeometry,
  TearOffOptions,
  TearOffResult,
} from './tearOffModel';
export { TearOffOutlet } from './TearOffOutlet';

/**
 * TEAR-OFF — pop a docked panel into its own browser window. Only CONTENT is portalled;
 * chrome binds the opener's document. See DESIGN_NOTES.md § src/tearOff.tsx:4.
 */

/**
 * Distinguishes one controller's windows from another's. `prefix + panelId` collided, so a
 * second dock ADOPTED the first's. See DESIGN_NOTES.md § src/tearOff.tsx:126.
 */
let nextControllerId = 0;

/**
 * Own a set of torn-off windows for one accordion group. Takes an `onCleanup`, so a group
 * unmounting takes its popups with it — the leak `beforeunload` covers, at component
 * granularity.
 */
export function createTearOff(options: TearOffOptions): TearOffController {
  const controllerId = nextControllerId++;
  const [tornOff, setTornOff] = createSignal<readonly string[]>([]);
  const windows = new Map<string, TornWindow>();

  const isTornOff = (id: string): boolean => tornOff().includes(id);

  /**
   * The single close path. Every route to "this panel is docked again" funnels through here,
   * so the ordering rule below is stated once instead of at four callsites.
   */
  const finish = (id: string, closeWindow: boolean): void => {
    const rec = windows.get(id);
    if (rec === undefined || rec.closed) return;
    rec.closed = true;
    windows.delete(id);
    for (const step of rec.teardown.reverse()) step();

    // One last sample before persisting: the poll refreshes only every tick, so a window moved then docked would be remembered at its previous position. See DESIGN_NOTES.md § src/tearOff.tsx:575.
    if (!rec.win.closed) {
      const finalSample = sampleGeometry(rec.win);
      if (finalSample !== null) rec.geometry = finalSample;
    }
    writeGeometry(options.storageKey, id, rec.geometry);

    // ORDER MATTERS. Flipping the signal first re-runs Portal's effect, moving the live nodes
    // home while the popup document is still healthy. Closing first would re-parent out of a
    // torn-down document.
    setTornOff((prev) => prev.filter((v) => v !== id));
    if (closeWindow && !rec.win.closed) {
      // The effect above runs synchronously at the end of this update, so the nodes are already
      // home; the deferral only guards a future batching change making that untrue.
      queueMicrotask(() => rec.win.close());
    }
    options.onDock?.(id);
  };

  const tearOff = (id: string): TearOffResult => {
    if (isTornOff(id)) {
      focusWindow(id);
      return { ok: false, reason: 'already-torn-off' };
    }

    const stored = readGeometry(options.storageKey, id);
    // Centre on the opener when nothing is remembered — a window at the OS default position
    // reads as unrelated to the click that produced it.
    const geometry: TearOffGeometry = stored ?? {
      width: TEAR_OFF_DEFAULT_WIDTH_PX,
      height: TEAR_OFF_DEFAULT_HEIGHT_PX,
      left: Math.round(
        window.screenX + (window.outerWidth - TEAR_OFF_DEFAULT_WIDTH_PX) / 2,
      ),
      top: Math.round(
        window.screenY + (window.outerHeight - TEAR_OFF_DEFAULT_HEIGHT_PX) / 2,
      ),
    };

    const title = options.titleOf(id);
    const win = window.open(
      '',
      `${TEAR_OFF_WINDOW_NAME_PREFIX}${controllerId}-${id}`,
      featureString(geometry),
    );

    // A blocked popup returns null. The panel STAYS DOCKED and the caller is told: the one thing
    // that must not happen is a click that appears to do nothing.
    if (win === null) {
      options.onError?.(id, 'popup-blocked');
      return { ok: false, reason: 'popup-blocked' };
    }

    const rec: TornWindow = {
      win,
      doc: win.document,
      geometry,
      teardown: prepareDocument(win, title),
      closed: false,
    };

    // Fast path for the ordinary close. `pagehide`, not `unload`, which is unreliable under
    // bfcache. A RELOAD lands here too, and re-docking is right: the reloaded document is blank.
    const onPageHide = (): void => finish(id, false);
    win.addEventListener('pagehide', onPageHide);
    rec.teardown.push(() => win.removeEventListener('pagehide', onPageHide));

    // Slow path + the geometry sampler. See TEAR_OFF_CLOSE_POLL_MS for why the
    // event above is not enough on its own.
    const poll = window.setInterval(() => {
      if (win.closed) {
        finish(id, false);
        return;
      }
      const g = sampleGeometry(win);
      if (g !== null) rec.geometry = g;
    }, TEAR_OFF_CLOSE_POLL_MS);
    rec.teardown.push(() => window.clearInterval(poll));

    windows.set(id, rec);
    setTornOff((prev) => [...prev, id]);
    options.onTearOff?.(id);
    return { ok: true };
  };

  const focusWindow = (id: string): void => {
    // Best-effort by contract — see (c). Not reported as a failure, because a
    // browser refusing to raise a window is not something the caller can act on.
    windows.get(id)?.win.focus();
  };

  const dockAll = (): void => {
    for (const id of [...windows.keys()]) finish(id, true);
  };

  /**
   * An opener that unloads must take its popups with it — one outliving its opener still
   * PAINTS from a dead graph. See DESIGN_NOTES.md § src/tearOff.tsx:684.
   */
  const onOpenerGone = (): void => {
    for (const [id, rec] of windows) {
      rec.closed = true;
      for (const step of rec.teardown.reverse()) step();
      writeGeometry(options.storageKey, id, rec.geometry);
      if (!rec.win.closed) rec.win.close();
    }
    windows.clear();
    // Matters only for the bfcache path, where the page can later be RESTORED: leaving ids in
    // `tornOff` would come back as panels marked torn-off with no window behind them.
    setTornOff([]);
  };
  safeAddEventListener(getGlobalTarget('window'), 'beforeunload', onOpenerGone);
  safeAddEventListener(getGlobalTarget('window'), 'pagehide', onOpenerGone);

  onCleanup(() => {
    dockAll();
  });

  return {
    tornOff,
    isTornOff,
    tearOff,
    dock: (id) => finish(id, true),
    dockAll,
    focusWindow,
    mountFor: (id) => (isTornOff(id) ? windows.get(id)?.doc.body : undefined),
  };
}
