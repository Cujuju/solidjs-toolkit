import { EventEmitter } from 'node:events';
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apply, type InstallTarget, type StagedUpdate } from '../install.js';
import { buildIndex } from '../node/pack.js';
import { createUpdater } from '../updater.js';
import { CONTEXT, fakeGitHub, PUBLIC_PEM } from './fixtures.js';

const launches = vi.hoisted(() => ({ calls: [] as string[], elevate: false }));
vi.mock('node:child_process', () => ({
  spawn: (file: string) => {
    launches.calls.push(file);
    const child = Object.assign(new EventEmitter(), { unref: () => undefined });
    if (launches.elevate) {
      launches.elevate = false;
      process.nextTick(() => child.emit('error', Object.assign(new Error('needs elevation'), { code: 'EACCES' })));
    }
    return child;
  },
}));

const INSTALLER = Buffer.from('trusted installer');
const installer: InstallTarget = { kind: 'installer', elevate: 'elevate.exe' };
const mac: InstallTarget = { kind: 'swap', platform: 'darwin', path: '/Applications/App.app' };
const temp = (): string => mkdtempSync(path.join(os.tmpdir(), 'eu-integrity-'));
const settled = () => new Promise((resolve) => setImmediate(resolve));

async function staged(target = installer, bytes = INSTALLER): Promise<StagedUpdate> {
  const dir = temp();
  const file = path.join(dir, target === mac ? 'App.app' : 'App.exe');
  if (target === mac) {
    mkdirSync(path.join(file, 'Contents', 'Resources'), { recursive: true });
    writeFileSync(path.join(file, 'Contents', 'Resources', 'app.asar'), bytes);
  } else writeFileSync(file, bytes);
  const index = await buildIndex(file, target === mac ? 'darwin' : 'win32', 'x64', dir);
  return { path: file, entries: index.entries, target, version: '1.0.0' };
}

beforeEach(() => {
  launches.calls.length = 0;
  launches.elevate = false;
});

describe('staged integrity at apply', () => {
  it.each(['changed', 'truncated', 'missing', 'directory'])('refuses a %s installer', async (change) => {
    const update = await staged();
    if (change === 'changed') writeFileSync(update.path, 'changed installer');
    if (change === 'truncated') writeFileSync(update.path, 'short');
    if (change === 'missing' || change === 'directory') unlinkSync(update.path);
    if (change === 'directory') mkdirSync(update.path);
    const failed = vi.fn();
    expect(() => apply(update, true, process.pid, failed)).not.toThrow();
    expect(launches.calls).toEqual([]);
    expect(failed).toHaveBeenCalledOnce();
  });

  it('hashes beyond the first verification buffer', async () => {
    const TWO_MIB = 2 * 1024 * 1024;
    const update = await staged(installer, Buffer.alloc(TWO_MIB));
    const bytes = readFileSync(update.path);
    bytes[bytes.length - 1] = 1;
    writeFileSync(update.path, bytes);
    const failed = vi.fn();
    apply(update, false, process.pid, failed);
    expect(launches.calls).toEqual([]);
    expect(failed).toHaveBeenCalledOnce();
  });

  it('rechecks before retrying a Windows installer with elevation', async () => {
    const update = await staged();
    launches.elevate = true;
    const failed = vi.fn();
    apply(update, true, process.pid, failed);
    writeFileSync(update.path, 'changed installer');
    await settled();
    expect(launches.calls).toEqual([update.path]);
    expect(failed).toHaveBeenCalledOnce();
  });

  it('accepts an unchanged macOS bundle, including raw app.asar bytes', async () => {
    const update = await staged(mac);
    const failed = vi.fn();
    apply(update, true, process.pid, failed);
    expect(launches.calls).toEqual(['/bin/sh']);
    expect(failed).not.toHaveBeenCalled();
  });

  it.each(['changed', 'missing', 'added', 'directory'])('refuses a %s bundle entry', async (change) => {
    const update = await staged(mac);
    const archive = path.join(update.path, 'Contents', 'Resources', 'app.asar');
    if (change === 'changed') writeFileSync(archive, 'changed installer');
    if (change === 'missing' || change === 'directory') unlinkSync(archive);
    if (change === 'directory') mkdirSync(archive);
    if (change === 'added') writeFileSync(path.join(update.path, 'Contents', 'injected.dylib'), 'unlisted');
    const failed = vi.fn();
    apply(update, true, process.pid, failed);
    expect(launches.calls).toEqual([]);
    expect(failed).toHaveBeenCalledOnce();
  });

  it.skipIf(process.platform === 'win32')('refuses altered symlinks and accepts unchanged ones', async () => {
    const update = await staged(mac);
    const link = path.join(update.path, 'Contents', 'current');
    symlinkSync('Resources/app.asar', link);
    update.entries = (await buildIndex(update.path, 'darwin', 'x64', path.dirname(update.path))).entries;
    const failed = vi.fn();
    apply(update, false, process.pid, failed);
    expect(launches.calls).toEqual(['/bin/sh']);
    unlinkSync(link);
    symlinkSync('Resources/other', link);
    launches.calls.length = 0;
    apply(update, false, process.pid, failed);
    expect(launches.calls).toEqual([]);
    expect(failed).toHaveBeenCalledOnce();
  });
});

describe('authenticated index survives until quit', () => {
  it.each(['normal quit', 'restart'])('rejects an installer changed after ready on %s', async (mode) => {
    let quit = (): void => undefined;
    const app = { isPackaged: true, getVersion: () => '0.1.0', quit: () => quit(), on: (_: 'quit', fn: () => void) => { quit = fn; } };
    const repo = 'me/app-updates';
    const dir = path.join(temp(), 'updates');
    const updater = createUpdater({ app, appName: 'App', repo, publicKey: PUBLIC_PEM, signatureContext: CONTEXT,
      channel: () => 'stable', dir, platform: 'win32', arch: 'x64', autoDownload: true, installOnQuit: true,
      fetch: fakeGitHub(repo, [{ version: '0.2.0', builds: { win32: { x64: INSTALLER } } }]).fetch });
    await updater.check();
    expect(updater.status().state).toBe('ready');
    writeFileSync(path.join(dir, 'staged', 'App-0.2.0-win32-x64.bin'), 'changed installer');
    if (mode === 'normal quit') quit();
    else updater.quitAndInstall();
    expect(launches.calls).toEqual([]);
    expect(updater.status()).toMatchObject({ state: 'error', message: expect.stringContaining('signed index') });
  });
});
