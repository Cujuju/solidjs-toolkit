/**
 * The one OS-specific step: applying a verified update file once the app has quit.
 * Windows runs the NSIS installer silently; macOS and Linux swap the new app over the old one.
 */
import { execFile, spawn } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { access, chmod, readFile, rm } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { promisify } from 'node:util';
import type { UpdatePlatform } from './manifest';

const run = promisify(execFile);

/** macOS' archiver: keeps the bundle's symlinks and attributes, which other unzip tools lose. */
const DITTO = '/usr/bin/ditto';
/** macOS runs a downloaded app it hasn't moved from here: a read-only copy that can't be replaced. */
const TRANSLOCATED = '/AppTranslocation/';
/** electron-builder's NSIS installer: `--updated` keeps the install folder, `--force-run` starts the app after. */
const NSIS_SILENT = ['--updated', '/S'];
const NSIS_RELAUNCH = '--force-run';
/** Owner rwx, others rx: an AppImage must be executable. */
const EXECUTABLE_MODE = 0o755;

/** Where the running app is installed, and how it is replaced. */
export type InstallTarget =
  | { kind: 'installer' }
  | { kind: 'swap'; platform: 'darwin' | 'linux'; path: string };

export interface InstallHost {
  platform: UpdatePlatform;
  /** process.execPath */
  exe: string;
  /** process.env; Linux reads APPIMAGE, the AppImage file the app runs from. */
  env: Record<string, string | undefined>;
  appName: string;
}

/** The .app bundle `exe` is in; null when it isn't in one. */
export function appBundleOf(exe: string): string | null {
  const at = exe.indexOf('.app/Contents/MacOS/');
  return at < 0 ? null : exe.slice(0, at + '.app'.length);
}

const writable = (dir: string): boolean => {
  try {
    accessSync(dir, constants.W_OK);
    return true;
  } catch {
    return false;
  }
};

/** How this install updates, or why it can't (a string to show the user). */
export function installTarget(h: InstallHost): InstallTarget | string {
  if (h.platform === 'win32') return { kind: 'installer' };
  if (h.platform === 'darwin') {
    const bundle = appBundleOf(h.exe);
    if (!bundle) return `${h.appName} isn't running from an app bundle.`;
    if (bundle.includes(TRANSLOCATED)) return `Move ${h.appName} to the Applications folder and open it from there: macOS runs it from a read-only copy until then.`;
    if (!writable(dirname(bundle))) return `${h.appName} can't write to ${dirname(bundle)}; move it to a folder you can change.`;
    return { kind: 'swap', platform: 'darwin', path: bundle };
  }
  const image = h.env.APPIMAGE;
  if (!image) return `Updates need the AppImage build of ${h.appName}.`;
  if (!writable(dirname(image))) return `${h.appName} can't write to ${dirname(image)}; move the AppImage to a folder you can change.`;
  return { kind: 'swap', platform: 'linux', path: image };
}

/** A verified update, ready to apply at quit. */
export interface StagedUpdate {
  version: string;
  target: InstallTarget;
  /** The installer (Windows), or the new app to move into place. */
  path: string;
}

/**
 * Prepares a verified download: macOS unpacks the zip and checks it holds this app at `version`;
 * Linux marks the AppImage executable; Windows runs the installer as is.
 */
export async function stage(target: InstallTarget, file: string, version: string, exe: string): Promise<StagedUpdate> {
  if (target.kind === 'installer') return { version, target, path: file };
  if (target.platform === 'linux') {
    await chmod(file, EXECUTABLE_MODE);
    return { version, target, path: file };
  }
  const unpacked = join(dirname(file), 'unpacked');
  await rm(unpacked, { recursive: true, force: true });
  await run(DITTO, ['-x', '-k', file, unpacked]);
  await rm(file, { force: true });
  const bundle = join(unpacked, basename(target.path));
  // The zip holds a bundle with this one's name and executable; anything else isn't this app.
  await access(join(bundle, 'Contents', 'MacOS', basename(exe)));
  const plist = await readFile(join(bundle, 'Contents', 'Info.plist'), 'utf8').catch(() => '');
  if (!plist.includes(`<string>${version}</string>`)) throw new Error(`the download isn't version ${version} of this app`);
  return { version, target, path: bundle };
}

const quoted = (s: string): string => `'${s.replaceAll("'", "'\\''")}'`;

/**
 * Shell script that waits for `pid` to exit, then moves `staged` to `target`. The old app is set aside
 * first and restored if the move fails. `relaunch` runs after.
 */
export function swapScript(pid: number, target: string, staged: string, relaunch: string | null): string {
  const old = `${target}.old`;
  return [
    `while kill -0 ${pid} 2>/dev/null; do sleep 0.2; done`,
    `rm -rf ${quoted(old)}`,
    `mv ${quoted(target)} ${quoted(old)} || exit 1`,
    `if mv ${quoted(staged)} ${quoted(target)}; then rm -rf ${quoted(old)}; else mv ${quoted(old)} ${quoted(target)}; fi`,
    ...(relaunch ? [relaunch] : []),
  ].join('\n');
}

const relaunchCommand = (platform: 'darwin' | 'linux', path: string): string =>
  platform === 'darwin' ? `open ${quoted(path)}` : `nohup ${quoted(path)} >/dev/null 2>&1 &`;

/** Starts applying `update`, detached so it outlives this process. Call while quitting. */
export function apply(update: StagedUpdate, relaunch: boolean, pid: number): void {
  const { target } = update;
  const child =
    target.kind === 'installer'
      ? spawn(update.path, relaunch ? [...NSIS_SILENT, NSIS_RELAUNCH] : NSIS_SILENT, { detached: true, stdio: 'ignore' })
      : spawn('/bin/sh', ['-c', swapScript(pid, target.path, update.path, relaunch ? relaunchCommand(target.platform, target.path) : null)], {
          detached: true,
          stdio: 'ignore',
        });
  child.unref();
}
