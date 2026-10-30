/**
 * The app-side updater: one path on every OS. Finds the channel's newest signed release, downloads and
 * verifies its file, stages it, and applies it when the app quits.
 */
import { EventEmitter } from 'node:events';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { downloadVerified } from './download';
import { findUpdate, type Fetch, type FoundUpdate, type UpdateChannel } from './feed';
import { apply, installTarget, stage, type InstallTarget, type StagedUpdate } from './install';
import { isUpdatePlatform, type UpdatePlatform } from './manifest';

/** Releases are occasional: a few checks a day find one the day it ships, well inside GitHub's anonymous rate limit. */
export const AUTO_CHECK_INTERVAL_MS = 6 * 60 * 60_000;
/** Lets a login launch settle before the first scheduled check. */
export const STARTUP_CHECK_DELAY_MS = 60_000;

export type UpdateStatus =
  | { state: 'unavailable'; reason: string }
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'up-to-date'; checkedAt: string }
  | { state: 'available'; version: string; nightly: boolean }
  | { state: 'downloading'; version: string; nightly: boolean; percent: number }
  /** Verified and staged: applied at the next quit, or now by quitAndInstall(). */
  | { state: 'ready'; version: string; nightly: boolean }
  | { state: 'error'; message: string };

/** The parts of Electron's `app` the updater uses. */
export interface UpdaterHost {
  isPackaged: boolean;
  getVersion(): string;
  quit(): void;
  on(event: 'quit', listener: () => void): unknown;
}

export interface UpdaterOptions {
  app: UpdaterHost;
  /** Shown in messages about where the app is installed. */
  appName: string;
  /** `owner/name` of the public repo whose releases are the updates. */
  repo: string;
  /** Ed25519 public key (PEM); empty when the build has none, which disables updates. */
  publicKey: string;
  /** Must match the release script's. */
  signatureContext: string;
  /** Read at each check. */
  channel: () => UpdateChannel;
  /** A folder the updater owns, for downloads and the staged update. */
  dir: string;
  /** Electron's net.fetch: the system's proxy and certificates. */
  fetch: Fetch;
  /** Download as soon as an update is found. Default false: download() waits for the user. */
  autoDownload?: boolean;
  /** Apply a staged update at any quit, without relaunching. Default false: only quitAndInstall() and installOnQuit() apply it. */
  installOnQuit?: boolean;
  /** Overrides for tests; default to the running process. */
  platform?: string;
  arch?: string;
  exe?: string;
  env?: Record<string, string | undefined>;
}

/** First line only: network errors can carry whole responses. */
const describe = (err: unknown): string => String((err as Error)?.message ?? err).split('\n')[0] ?? '';

export function createUpdater(o: UpdaterOptions) {
  const events = new EventEmitter<{ status: [UpdateStatus]; found: [string] }>();
  const platform = o.platform ?? process.platform;
  const exe = o.exe ?? process.execPath;
  const target: InstallTarget | string = isUpdatePlatform(platform)
    ? installTarget({ platform, exe, env: o.env ?? process.env, appName: o.appName })
    : `Updates are not supported on ${platform}.`;
  const unavailable = !o.app.isPackaged
    ? 'Updates are checked in installed builds only.'
    : !o.publicKey
      ? 'This build has no update public key, so it cannot verify updates.'
      : typeof target === 'string'
        ? target
        : null;

  let status: UpdateStatus = unavailable ? { state: 'unavailable', reason: unavailable } : { state: 'idle' };
  let found: FoundUpdate | null = null;
  let staged: StagedUpdate | null = null;
  let armed: { relaunch: boolean } | null = null;
  let timer: NodeJS.Timeout | null = null;
  let announced: string | null = null;

  const set = (next: UpdateStatus): void => {
    status = next;
    events.emit('status', next);
  };

  /** A nightly found or staged while the user has since chosen stable. */
  const offChannel = (): boolean => o.channel() === 'stable' && (found?.release.prerelease ?? false);

  async function check(scheduled = false): Promise<void> {
    if (unavailable || status.state === 'checking' || status.state === 'downloading') return;
    if (status.state === 'ready' && !offChannel()) return;
    staged = null;
    armed = null;
    set({ state: 'checking' });
    try {
      found = await findUpdate({
        fetch: o.fetch,
        repo: o.repo,
        channel: o.channel(),
        platform: platform as UpdatePlatform,
        arch: o.arch ?? process.arch,
        current: o.app.getVersion(),
        publicKey: o.publicKey,
        context: o.signatureContext,
      });
    } catch (err) {
      found = null;
      return set({ state: 'error', message: describe(err) });
    }
    if (!found) return set({ state: 'up-to-date', checkedAt: new Date().toISOString() });
    const { version } = found.release;
    set({ state: 'available', version, nightly: found.release.prerelease });
    if (scheduled && announced !== version) events.emit('found', (announced = version));
    if (o.autoDownload) await download();
  }

  async function download(): Promise<void> {
    const update = found;
    if (status.state !== 'available' || !update || typeof target === 'string') return;
    const { version, prerelease: nightly } = update.release;
    set({ state: 'downloading', version, nightly, percent: 0 });
    try {
      await rm(o.dir, { recursive: true, force: true });
      await mkdir(o.dir, { recursive: true });
      const file = join(o.dir, update.file.name);
      await downloadVerified(o.fetch, update.url, update.file, file, (percent) => set({ state: 'downloading', version, nightly, percent }));
      staged = await stage(target, file, version, exe);
      set({ state: 'ready', version, nightly });
    } catch (err) {
      set({ state: 'error', message: describe(err) });
    }
  }

  o.app.on('quit', () => {
    const run = armed ?? (o.installOnQuit ? { relaunch: false } : null);
    if (staged && run) apply(staged, run.relaunch, process.pid);
  });

  return {
    on: events.on.bind(events),
    off: events.off.bind(events),
    status: (): UpdateStatus => status,
    /** Looks for an update now; skipped while one is checking, downloading or staged. */
    check: (): Promise<void> => check(false),
    download,
    /** Applies the staged update at the next quit, however the app quits; `relaunch` starts it again after. */
    installOnQuit(relaunch: boolean): void {
      if (staged) armed = { relaunch };
    },
    /** Quits now and applies the staged update, starting the app again after. */
    quitAndInstall(): void {
      if (!staged) return;
      armed = { relaunch: true };
      o.app.quit();
    },
    /** Starts or stops scheduled checks; the first runs shortly after this call. */
    setAutoCheck(enabled: boolean): void {
      if (timer) clearTimeout(timer);
      timer = null;
      if (!enabled || unavailable) return;
      const tick = (): void => {
        void check(true);
        timer = setTimeout(tick, AUTO_CHECK_INTERVAL_MS);
      };
      timer = setTimeout(tick, STARTUP_CHECK_DELAY_MS);
    },
  };
}

export type Updater = ReturnType<typeof createUpdater>;
