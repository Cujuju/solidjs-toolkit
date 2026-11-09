import { existsSync, mkdirSync, mkdtempSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apply, appBundleOf, installTarget, seedsFor, stage, swapScript, WINDOWS_SEED_NAME, type StagedUpdate } from '../install';

/** Per spawn, in order: started, failed with an errno code (emitted next tick, as Node does), or thrown. */
type Outcome = 'started' | { emits: string } | { throws: string };
const spawns = vi.hoisted(() => ({ calls: [] as { file: string; args: string[] }[], outcomes: [] as Outcome[] }));
vi.mock('node:child_process', async () => {
  const { EventEmitter } = await import('node:events');
  const errno = (code: string) => Object.assign(new Error(`spawn ${code}`), { code });
  return {
    spawn: (file: string, args: string[]) => {
      spawns.calls.push({ file, args });
      const outcome = spawns.outcomes.shift() ?? 'started';
      if (outcome !== 'started' && 'throws' in outcome) throw errno(outcome.throws);
      const child = Object.assign(new EventEmitter(), { unref: () => undefined });
      if (outcome !== 'started') process.nextTick(() => child.emit('error', errno(outcome.emits)));
      return child;
    },
  };
});

const host = { exe: '/x', env: {}, appName: 'App' };

describe('installTarget', () => {
  it('Windows runs the installer', () => {
    const exe = path.join('install', 'App.exe');
    expect(installTarget({ ...host, platform: 'win32', exe })).toEqual({ kind: 'installer', elevate: path.join('install', 'resources', 'elevate.exe') });
  });

  it('macOS swaps the app bundle it runs from', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'eu-'));
    const exe = `${dir}/App.app/Contents/MacOS/App`;
    expect(installTarget({ ...host, platform: 'darwin', exe })).toEqual({ kind: 'swap', platform: 'darwin', path: `${dir}/App.app` });
  });

  it('macOS refuses a translocated or unbundled app', () => {
    expect(installTarget({ ...host, platform: 'darwin', exe: '/private/var/folders/x/AppTranslocation/y/App.app/Contents/MacOS/App' })).toMatch(/Applications folder/);
    expect(installTarget({ ...host, platform: 'darwin', exe: '/usr/bin/app' })).toMatch(/app bundle/);
  });

  it('Linux swaps the AppImage it runs from, and needs one', () => {
    const image = path.join(mkdtempSync(path.join(os.tmpdir(), 'eu-')), 'App.AppImage');
    expect(installTarget({ ...host, platform: 'linux', env: { APPIMAGE: image } })).toEqual({ kind: 'swap', platform: 'linux', path: image });
    expect(installTarget({ ...host, platform: 'linux' })).toMatch(/AppImage build/);
  });
});

describe('stage', () => {
  it.skipIf(process.platform === 'win32')('marks a Linux AppImage executable', async () => {
    const file = path.join(mkdtempSync(path.join(os.tmpdir(), 'eu-')), 'new.AppImage');
    writeFileSync(file, 'x');
    await stage({ kind: 'swap', platform: 'linux', path: '/opt/App.AppImage' }, file, '1.0.0', '/x');
    expect(statSync(file).mode & 0o111).toBe(0o111);
  });
});

describe('stage on macOS', () => {
  async function rebuiltBundle(version: string): Promise<string> {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'eu-mac-'));
    const bundle = path.join(dir, 'App.app');
    const contents = path.join(bundle, 'Contents');
    mkdirSync(path.join(contents, 'MacOS'), { recursive: true });
    writeFileSync(path.join(contents, 'MacOS', 'App'), '#!/bin/sh\n');
    writeFileSync(path.join(contents, 'Info.plist'), `<string>${version}</string>`);
    return bundle;
  }
  const target = { kind: 'swap', platform: 'darwin', path: '/Applications/App.app' } as const;

  it('checks the rebuilt bundle name, executable and version', async () => {
    const root = await rebuiltBundle('1.2.3');
    const staged = await stage(target, root, '1.2.3', '/Applications/App.app/Contents/MacOS/App');
    expect(staged.path).toBe(root);
    expect(existsSync(path.join(staged.path, 'Contents', 'MacOS', 'App'))).toBe(true);
  });

  it('rejects a bundle of another version', async () => {
    const root = await rebuiltBundle('1.2.2');
    await expect(stage(target, root, '1.2.3', '/Applications/App.app/Contents/MacOS/App')).rejects.toThrow(/isn't version 1\.2\.3/);
  });
});

describe('swapScript', () => {
  it('waits for the app, sets the old copy aside, restores it on failure, then relaunches', () => {
    const script = swapScript(42, "/Apps/It's.app", '/tmp/new.app', "open '/Apps/It'\\''s.app'");
    expect(script.split('\n')).toEqual([
      'while kill -0 42 2>/dev/null; do sleep 0.2; done',
      "rm -rf '/Apps/It'\\''s.app.old'",
      "mv '/Apps/It'\\''s.app' '/Apps/It'\\''s.app.old' || exit 1",
      "if mv '/tmp/new.app' '/Apps/It'\\''s.app'; then rm -rf '/Apps/It'\\''s.app.old'; else mv '/Apps/It'\\''s.app.old' '/Apps/It'\\''s.app'; fi",
      "open '/Apps/It'\\''s.app'",
    ]);
  });

  it('finds the bundle from the executable path', () => {
    expect(appBundleOf('/Applications/App.app/Contents/MacOS/App')).toBe('/Applications/App.app');
    expect(appBundleOf('/usr/bin/app')).toBeNull();
  });
});

describe('seedsFor', () => {
  it('uses the installer copy, running bundle or running AppImage', () => {
    expect(seedsFor({ kind: 'installer', elevate: 'elevate.exe' }, path.join('install', 'App.exe'), {})).toEqual([path.join('install', WINDOWS_SEED_NAME)]);
    expect(seedsFor({ kind: 'swap', platform: 'darwin', path: '/Apps/App.app' }, '/x', {})).toEqual(['/Apps/App.app']);
    expect(seedsFor({ kind: 'swap', platform: 'linux', path: '/App' }, '/x', { APPIMAGE: '/running.AppImage' })).toEqual(['/running.AppImage']);
    expect(seedsFor({ kind: 'swap', platform: 'linux', path: '/App' }, '/x', {})).toEqual([]);
  });
});

describe('apply', () => {
  const elevate = 'C:/App/resources/elevate.exe';
  const update: StagedUpdate = { version: '1.0.0', target: { kind: 'installer', elevate }, path: 'C:/up/App.bin' };
  /** After every pending spawn error, including one from the elevate.exe retry. */
  const settled = () => new Promise((resolve) => setImmediate(resolve));
  beforeEach(() => {
    spawns.calls.length = 0;
    spawns.outcomes.length = 0;
  });

  it('runs a per-user installer directly', async () => {
    const failed = vi.fn();
    apply(update, true, 1, failed);
    await settled();
    expect(spawns.calls).toEqual([{ file: update.path, args: ['--updated', '/S', '--force-run'] }]);
    expect(failed).not.toHaveBeenCalled();
  });

  it('retries a per-machine installer Windows refuses unelevated through elevate.exe', async () => {
    spawns.outcomes.push({ emits: 'EACCES' });
    const failed = vi.fn();
    apply(update, false, 1, failed);
    await settled();
    expect(spawns.calls).toEqual([
      { file: update.path, args: ['--updated', '/S'] },
      { file: elevate, args: [update.path, '--updated', '/S'] },
    ]);
    expect(failed).not.toHaveBeenCalled();
  });

  it('reports, never throws, when a start fails', async () => {
    const failed = vi.fn();
    const linux: StagedUpdate = { ...update, target: { kind: 'swap', platform: 'linux', path: '/App' } };
    const cases: [Outcome[], StagedUpdate][] = [
      [[{ emits: 'ENOENT' }], update],
      [[{ emits: 'EACCES' }, { emits: 'ENOENT' }], update],
      [[{ emits: 'EACCES' }, { throws: 'UNKNOWN' }], update],
      [[{ throws: 'UNKNOWN' }], linux],
    ];
    for (const [outcomes, u] of cases) {
      spawns.outcomes.push(...outcomes);
      expect(() => apply(u, false, 1, failed)).not.toThrow();
      await settled();
    }
    expect(failed.mock.calls.map(([err]) => err.code)).toEqual(['ENOENT', 'ENOENT', 'UNKNOWN', 'UNKNOWN']);
    expect(spawns.calls.map((c) => c.file)).toEqual([update.path, update.path, elevate, update.path, elevate, '/bin/sh']);
  });
});
