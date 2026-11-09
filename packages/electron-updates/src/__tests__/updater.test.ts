import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UpdateChannel } from '../feed';
import { createUpdater, type UpdaterOptions, type UpdateStatus } from '../updater';
import { CONTEXT, fakeGitHub, PUBLIC_PEM, type FakeRelease } from './fixtures';

const applied = vi.hoisted(() => [] as { path: string; relaunch: boolean }[]);
/** Set to make the next apply fail to start. */
const applyFailure = vi.hoisted(() => ({ next: null as Error | null }));
vi.mock('../install', async (orig) => ({
  ...(await orig<typeof import('../install')>()),
  apply: (u: { path: string }, relaunch: boolean, _pid: number, failed: (err: Error) => void) => {
    applied.push({ path: u.path, relaunch });
    if (applyFailure.next) failed(applyFailure.next);
  },
}));

const REPO = 'me/app-updates';
const releases: FakeRelease[] = [
  { version: '0.2.0', builds: { win32: { x64: Buffer.from('stable build') } } },
  { version: '0.3.0', prerelease: true, builds: { win32: { x64: Buffer.from('nightly build') } } },
];

function setup(over: Partial<UpdaterOptions> = {}, list = releases) {
  let channel: UpdateChannel = 'stable';
  let onQuit = (): void => undefined;
  const app = { isPackaged: true, getVersion: () => '0.1.0', quit: vi.fn(() => onQuit()), on: (_: 'quit', fn: () => void) => (onQuit = fn) };
  const dir = path.join(mkdtempSync(path.join(os.tmpdir(), 'eu-')), 'updates');
  const updater = createUpdater({
    app,
    appName: 'App',
    repo: REPO,
    publicKey: PUBLIC_PEM,
    signatureContext: CONTEXT,
    channel: () => channel,
    dir,
    fetch: fakeGitHub(REPO, list).fetch,
    platform: 'win32',
    arch: 'x64',
    ...over,
  });
  const seen: UpdateStatus[] = [];
  updater.on('status', (s) => seen.push(s));
  return { updater, app, dir, seen, setChannel: (c: UpdateChannel) => (channel = c), quit: () => onQuit() };
}

beforeEach(() => {
  applied.length = 0;
  applyFailure.next = null;
});

describe('createUpdater', () => {
  it('is unavailable in dev builds and without a public key', () => {
    expect(setup({ app: { isPackaged: false, getVersion: () => '0', quit() {}, on() {} } }).updater.status().state).toBe('unavailable');
    expect(setup({ publicKey: '' }).updater.status()).toMatchObject({ reason: expect.stringMatching(/public key/) });
  });

  it('finds, downloads, verifies and stages; quitAndInstall applies it with relaunch', async () => {
    const { updater, app, dir } = setup();
    await updater.check();
    expect(updater.status()).toEqual({ state: 'available', version: '0.2.0', nightly: false });
    await updater.download();
    expect(updater.status()).toEqual({ state: 'ready', version: '0.2.0', nightly: false });
    const file = path.join(dir, 'staged', 'App-0.2.0-win32-x64.bin');
    expect(readFileSync(file, 'utf8')).toBe('stable build');
    updater.quitAndInstall();
    expect(app.quit).toHaveBeenCalled();
    expect(applied).toEqual([{ path: file, relaunch: true }]);
  });

  it('reports an update that fails to start at quit as an error', async () => {
    const { updater, seen } = setup();
    await updater.check();
    await updater.download();
    applyFailure.next = new Error('spawn elevate.exe ENOENT\nstack');
    expect(() => updater.quitAndInstall()).not.toThrow();
    expect(seen.at(-1)).toEqual({ state: 'error', message: "The update couldn't start: spawn elevate.exe ENOENT" });
  });

  it('applies nothing at a plain quit unless installOnQuit', async () => {
    const plain = setup();
    await plain.updater.check();
    await plain.updater.download();
    plain.quit();
    expect(applied).toEqual([]);

    const auto = setup({ autoDownload: true, installOnQuit: true });
    await auto.updater.check();
    expect(auto.updater.status().state).toBe('ready');
    auto.quit();
    expect(applied).toEqual([{ path: path.join(auto.dir, 'staged', 'App-0.2.0-win32-x64.bin'), relaunch: false }]);
  });

  it('switching nightly → stable drops a staged nightly', async () => {
    const { updater, setChannel } = setup();
    setChannel('nightly');
    await updater.check();
    await updater.download();
    expect(updater.status()).toMatchObject({ state: 'ready', version: '0.3.0', nightly: true });
    setChannel('stable');
    await updater.check();
    expect(updater.status()).toEqual({ state: 'available', version: '0.2.0', nightly: false });
  });

  it('reads function options when found and at quit, with explicit arming taking precedence', async () => {
    let enabled = false;
    const { updater, quit } = setup({ autoDownload: () => enabled, installOnQuit: () => enabled });
    await updater.check();
    expect(updater.status().state).toBe('available');
    enabled = true;
    await updater.check();
    expect(updater.status().state).toBe('ready');
    enabled = false;
    quit();
    expect(applied).toEqual([]);
    enabled = true;
    quit();
    expect(applied).toHaveLength(1);
    expect(applied[0]?.relaunch).toBe(false);
    enabled = false;
    updater.installOnQuit(true);
    quit();
    expect(applied[1]?.relaunch).toBe(true);
  });

  it('keeps a staged update when the channel still allows it', async () => {
    const { updater } = setup();
    await updater.check();
    await updater.download();
    await updater.check();
    expect(updater.status().state).toBe('ready');
  });

  it('rejects a file that does not match its signed listing', async () => {
    const { fetch } = fakeGitHub(REPO, releases);
    const tampered: typeof fetch = async (url, init) => (url.endsWith('.index') ? new Response('evil') : fetch(url, init));
    const { updater, dir } = setup({ fetch: tampered });
    await updater.check();
    await updater.download();
    expect(updater.status()).toMatchObject({ state: 'error', message: expect.stringMatching(/does not match/) });
    expect(existsSync(path.join(dir, 'staged', 'App-0.2.0-win32-x64.bin'))).toBe(false);
  });

  it('reports up to date', async () => {
    const { updater } = setup({}, []);
    await updater.check();
    expect(updater.status().state).toBe('up-to-date');
  });
});
