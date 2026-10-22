import { CapacitorUpdater, type BundleInfo } from '@capgo/capacitor-updater';
import { bundleLabelRev, parseNativeVersion } from './labels';

/**
 * 'immediate': switch to a new bundle once downloaded (the page reloads).
 * 'next-launch': download only; switch at the next cold start, before `ready`.
 */
export type ApplyMode = 'immediate' | 'next-launch';

export interface LiveUpdatesOptions {
  /** The updates repo's manifest.json. */
  manifestUrl: string;
  /** This bundle's rev, baked in at build time. */
  bundleRev: number;
  /** The native fingerprint this bundle was built for, baked in at build time. */
  bundleFingerprint: string;
  apply: ApplyMode;
  /** localStorage key prefix for this app's state. */
  storageKey: string;
  /** Resolves once the app works. Only then is this bundle confirmed; otherwise the plugin rolls it back. */
  ready?: Promise<unknown>;
  /** False: confirm and guard, but never check for updates (end-to-end builds). */
  checkForUpdates?: boolean;
}

type ManifestEntry = { rev: number; version: string; url: string; checksum: string; sessionKey: string };
type Manifest = { bundles?: Record<string, ManifestEntry> };

const BUILTIN = 'builtin';
/** Failed versions remembered; the oldest drop off. */
const FAILED_KEPT = 20;
/** Downloaded and intact: never run yet ('pending') or confirmed ('success'). */
const USABLE: ReadonlySet<BundleInfo['status']> = new Set(['pending', 'success']);

function createState(prefix: string) {
  const failedKey = `${prefix}.failed`;
  const pendingKey = `${prefix}.pending`;
  /** Failed versions from this session, kept even if storage can't be written. */
  const failedHere = new Set<string>();
  const read = (key: string) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  };
  const write = (key: string, value: string | null) => {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {
      // Storage full or unavailable: this session still knows.
    }
  };
  const failed = (): string[] => {
    try {
      const list = JSON.parse(read(failedKey) ?? '[]');
      return [...(Array.isArray(list) ? list : []), ...failedHere];
    } catch {
      return [...failedHere];
    }
  };
  return {
    failed,
    addFailed(version: string) {
      failedHere.add(version);
      write(failedKey, JSON.stringify([...new Set(failed())].slice(-FAILED_KEPT)));
    },
    /** The bundle downloaded for the next launch, cleared as it is read. */
    takePending() {
      const version = read(pendingKey);
      write(pendingKey, null);
      return version;
    },
    setPending: (version: string) => write(pendingKey, version),
  };
}

type State = ReturnType<typeof createState>;

async function findDownloaded(version: string): Promise<BundleInfo | undefined> {
  const { bundles } = await CapacitorUpdater.list();
  return bundles.find((b) => b.version === version && USABLE.has(b.status));
}

/** Switches to the bundle downloaded last session, if it is still newer and hasn't failed. */
async function applyPending(state: State, bundleRev: number): Promise<boolean> {
  const pending = state.takePending();
  if (!pending || state.failed().includes(pending) || !((bundleLabelRev(pending) ?? 0) > bundleRev)) return false;
  const bundle = await findDownloaded(pending);
  if (!bundle) return false;
  await CapacitorUpdater.set({ id: bundle.id });
  return true;
}

/** The outcome of prepareLiveUpdates. */
export interface LiveUpdates {
  /** True: the page is reloading into another bundle (or the app's own); start nothing. */
  restarting: boolean;
  /** Once `ready` resolves, confirms this bundle and starts checking for updates. A no-op when restarting. */
  confirm(ready?: Promise<unknown>): Promise<void>;
}

/**
 * Settles which bundle runs, before the app starts anything a reload would interrupt: records the last
 * failure, resets a bundle that doesn't belong here, and (next-launch) switches to the one downloaded
 * last session. Then `confirm` once the app works.
 */
export async function prepareLiveUpdates(options: Omit<LiveUpdatesOptions, 'ready'>): Promise<LiveUpdates> {
  const { manifestUrl, bundleRev, bundleFingerprint, apply, checkForUpdates = true } = options;
  const state = createState(options.storageKey);
  const restarting: LiveUpdates = { restarting: true, confirm: async () => {} };
  // The plugin reports each failure only once.
  const failed = await CapacitorUpdater.getFailedUpdate().catch(() => null);
  if (failed) state.addFailed(failed.bundle.version);

  // Null: built without live updates.
  const native = await CapacitorUpdater.getBuiltinVersion().then(
    (v) => parseNativeVersion(v.version),
    () => null,
  );
  if (native) {
    const current = await CapacitorUpdater.current().catch(() => null);
    if (current && current.bundle.id !== BUILTIN) {
      // Labelled with another rev than it was built with: an older signed bundle relisted as newer.
      if (bundleLabelRev(current.bundle.version) !== bundleRev) {
        state.addFailed(current.bundle.version);
        await CapacitorUpdater.reset();
        return restarting;
      }
      // Not for the native app it now runs in (a newer build, or other native code, installed over it).
      if (bundleRev < native.rev || bundleFingerprint !== native.fingerprint) {
        await CapacitorUpdater.reset();
        return restarting;
      }
    }
    if (apply === 'next-launch' && (await applyPending(state, bundleRev).catch(() => false))) return restarting;
  }

  let checking = false;
  const check = async (fingerprint: string) => {
    if (checking) return;
    checking = true;
    try {
      const res = await fetch(manifestUrl, { cache: 'no-store' });
      if (!res.ok) return;
      const entry = ((await res.json()) as Manifest).bundles?.[fingerprint];
      if (!entry || !(entry.rev > bundleRev) || bundleLabelRev(entry.version) !== entry.rev) return;
      if (state.failed().includes(entry.version)) return;
      const bundle =
        (await findDownloaded(entry.version)) ??
        (await CapacitorUpdater.download({ url: entry.url, version: entry.version, checksum: entry.checksum, sessionKey: entry.sessionKey }));
      if (apply === 'immediate') await CapacitorUpdater.set({ id: bundle.id });
      else state.setPending(entry.version);
    } catch {
      // Offline, or a bad download: try again next time.
    } finally {
      checking = false;
    }
  };

  let confirmed: Promise<void> | null = null;
  const confirm = async (ready?: Promise<unknown>) => {
    await ready;
    await CapacitorUpdater.notifyAppReady();
    if (!native || !checkForUpdates) return;
    void check(native.fingerprint);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void check(native.fingerprint);
    });
  };
  // Once only: a second call shares the first.
  return { restarting: false, confirm: (ready) => (confirmed ??= confirm(ready)) };
}

/**
 * prepareLiveUpdates, then confirm once `ready` resolves (else the plugin rolls this bundle back). Keeps
 * the app up to date from `manifestUrl`, on start and on each return to it. A bundle that failed to
 * start is never downloaded again.
 */
export async function startLiveUpdates(options: LiveUpdatesOptions): Promise<void> {
  const live = await prepareLiveUpdates(options);
  await live.confirm(options.ready);
}
