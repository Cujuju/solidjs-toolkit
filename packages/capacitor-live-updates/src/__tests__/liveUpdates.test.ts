import { beforeEach, describe, expect, it, vi } from 'vitest';

const updater = vi.hoisted(() => ({
  getFailedUpdate: vi.fn(),
  getBuiltinVersion: vi.fn(),
  current: vi.fn(),
  reset: vi.fn(),
  list: vi.fn(),
  set: vi.fn(),
  download: vi.fn(),
  notifyAppReady: vi.fn(),
}));
vi.mock('@capgo/capacitor-updater', () => ({ CapacitorUpdater: updater }));

import { prepareLiveUpdates, startLiveUpdates, type LiveUpdatesOptions } from '../liveUpdates';

const FINGERPRINT = '1a2b3c4d5e6f';
const MANIFEST_URL = 'https://example.test/manifest.json';
const KEY = 'test.liveUpdates';
const entry = (rev: number, version = `3.0.0-r${rev}`) => ({ rev, version, url: `https://example.test/${rev}.zip`, checksum: 'c', sessionKey: 's' });
const options = (o: Partial<LiveUpdatesOptions> = {}): LiveUpdatesOptions => ({
  manifestUrl: MANIFEST_URL,
  bundleRev: 10,
  bundleFingerprint: FINGERPRINT,
  apply: 'immediate',
  storageKey: KEY,
  ...o,
});
const settle = () => new Promise((r) => setTimeout(r, 0));
const failed = () => JSON.parse(localStorage.getItem(`${KEY}.failed`) ?? '[]');

let manifest: unknown;
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  manifest = { bundles: {} };
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => manifest })));
  updater.getFailedUpdate.mockResolvedValue(null);
  updater.getBuiltinVersion.mockResolvedValue({ version: `3.0.0-r10-${FINGERPRINT}` });
  updater.current.mockResolvedValue({ bundle: { id: 'builtin', version: '3.0.0' } });
  updater.list.mockResolvedValue({ bundles: [] });
  updater.download.mockImplementation(async ({ version }) => ({ id: `id-${version}`, version, status: 'pending' }));
});

describe('startup guards', () => {
  it('fails and resets a bundle labelled with another rev than it was built with', async () => {
    updater.current.mockResolvedValue({ bundle: { id: 'b', version: '3.0.0-r50' } });
    await startLiveUpdates(options({ bundleRev: 12 }));
    expect(updater.reset).toHaveBeenCalled();
    expect(updater.notifyAppReady).not.toHaveBeenCalled();
    expect(failed()).toEqual(['3.0.0-r50']);
  });

  it('resets, without failing, a bundle for other native code', async () => {
    updater.current.mockResolvedValue({ bundle: { id: 'b', version: '3.0.0-r12' } });
    await startLiveUpdates(options({ bundleRev: 12, bundleFingerprint: 'ffffffffffff' }));
    expect(updater.reset).toHaveBeenCalled();
    expect(failed()).toEqual([]);
  });

  it('resets a bundle older than the native app around it', async () => {
    updater.getBuiltinVersion.mockResolvedValue({ version: `3.0.0-r20-${FINGERPRINT}` });
    updater.current.mockResolvedValue({ bundle: { id: 'b', version: '3.0.0-r12' } });
    await startLiveUpdates(options({ bundleRev: 12 }));
    expect(updater.reset).toHaveBeenCalled();
  });

  it('remembers the failure the plugin reports', async () => {
    updater.getFailedUpdate.mockResolvedValue({ bundle: { version: '3.0.0-r11' } });
    manifest = { bundles: { [FINGERPRINT]: entry(11) } };
    await startLiveUpdates(options());
    await settle();
    expect(failed()).toEqual(['3.0.0-r11']);
    expect(updater.download).not.toHaveBeenCalled();
  });
});

describe('confirming', () => {
  it('confirms only once ready resolves', async () => {
    let done!: () => void;
    const ready = new Promise<void>((r) => (done = r));
    const started = startLiveUpdates(options({ ready }));
    await settle();
    expect(updater.notifyAppReady).not.toHaveBeenCalled();
    done();
    await started;
    expect(updater.notifyAppReady).toHaveBeenCalledOnce();
  });

  it('never confirms when ready rejects', async () => {
    await expect(startLiveUpdates(options({ ready: Promise.reject(new Error('engine')) }))).rejects.toThrow('engine');
    expect(updater.notifyAppReady).not.toHaveBeenCalled();
  });

  it('confirms but never checks when told not to', async () => {
    await startLiveUpdates(options({ checkForUpdates: false }));
    expect(updater.notifyAppReady).toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('confirms but never checks in a native app built without live updates', async () => {
    updater.getBuiltinVersion.mockResolvedValue({ version: '3.0.0' });
    await startLiveUpdates(options());
    expect(updater.notifyAppReady).toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('checking', () => {
  it('immediate: downloads a newer bundle and switches to it', async () => {
    manifest = { bundles: { [FINGERPRINT]: entry(11) } };
    await startLiveUpdates(options());
    await settle();
    expect(updater.download).toHaveBeenCalledWith({ url: 'https://example.test/11.zip', version: '3.0.0-r11', checksum: 'c', sessionKey: 's' });
    expect(updater.set).toHaveBeenCalledWith({ id: 'id-3.0.0-r11' });
  });

  it('reuses a bundle already downloaded', async () => {
    manifest = { bundles: { [FINGERPRINT]: entry(11) } };
    updater.list.mockResolvedValue({ bundles: [{ id: 'old', version: '3.0.0-r11', status: 'pending' }] });
    await startLiveUpdates(options());
    await settle();
    expect(updater.download).not.toHaveBeenCalled();
    expect(updater.set).toHaveBeenCalledWith({ id: 'old' });
  });

  it.each([
    ['not newer', entry(10)],
    ['labelled with another rev', entry(11, '3.0.0-r99')],
    ['unlabelled', entry(11, '3.0.0')],
  ])('ignores an entry %s', async (_, e) => {
    manifest = { bundles: { [FINGERPRINT]: e } };
    await startLiveUpdates(options());
    await settle();
    expect(updater.download).not.toHaveBeenCalled();
  });

  it('ignores entries for other native code', async () => {
    manifest = { bundles: { ffffffffffff: entry(11) } };
    await startLiveUpdates(options());
    await settle();
    expect(updater.download).not.toHaveBeenCalled();
  });
});

describe("apply: 'next-launch'", () => {
  it('downloads without switching, then switches at the next start before confirming', async () => {
    manifest = { bundles: { [FINGERPRINT]: entry(11) } };
    await startLiveUpdates(options({ apply: 'next-launch' }));
    await settle();
    expect(updater.download).toHaveBeenCalled();
    expect(updater.set).not.toHaveBeenCalled();

    vi.clearAllMocks();
    updater.list.mockResolvedValue({ bundles: [{ id: 'id-3.0.0-r11', version: '3.0.0-r11', status: 'pending' }] });
    const ready = new Promise(() => {});
    void startLiveUpdates(options({ apply: 'next-launch', ready }));
    await settle();
    expect(updater.set).toHaveBeenCalledWith({ id: 'id-3.0.0-r11' });
    expect(updater.notifyAppReady).not.toHaveBeenCalled();
    expect(localStorage.getItem(`${KEY}.pending`)).toBeNull();
  });

  it('skips a pending bundle that has since failed', async () => {
    localStorage.setItem(`${KEY}.pending`, '3.0.0-r11');
    localStorage.setItem(`${KEY}.failed`, JSON.stringify(['3.0.0-r11']));
    updater.list.mockResolvedValue({ bundles: [{ id: 'x', version: '3.0.0-r11', status: 'pending' }] });
    await startLiveUpdates(options({ apply: 'next-launch', checkForUpdates: false }));
    expect(updater.set).not.toHaveBeenCalled();
    expect(updater.notifyAppReady).toHaveBeenCalled();
  });

  it('confirms the running bundle when the pending one is gone', async () => {
    localStorage.setItem(`${KEY}.pending`, '3.0.0-r11');
    await startLiveUpdates(options({ apply: 'next-launch', checkForUpdates: false }));
    expect(updater.set).not.toHaveBeenCalled();
    expect(updater.notifyAppReady).toHaveBeenCalled();
  });
});

describe('prepareLiveUpdates', () => {
  const pendingNewer = () => {
    localStorage.setItem(`${KEY}.pending`, '3.0.0-r11');
    updater.list.mockResolvedValue({ bundles: [{ id: 'p', version: '3.0.0-r11', status: 'pending' }] });
  };

  it.each([
    ['a relabelled bundle is reset', () => updater.current.mockResolvedValue({ bundle: { id: 'b', version: '3.0.0-r50' } }), 'immediate'],
    [
      'a bundle for other native code is reset',
      () => {
        updater.current.mockResolvedValue({ bundle: { id: 'b', version: '3.0.0-r10' } });
        updater.getBuiltinVersion.mockResolvedValue({ version: '3.0.0-r10-ffffffffffff' });
      },
      'immediate',
    ],
    ['the pending bundle is switched to', pendingNewer, 'next-launch'],
  ] as const)('restarts, and never confirms, when %s', async (_, arrange, apply) => {
    arrange();
    const live = await prepareLiveUpdates(options({ apply }));
    expect(live.restarting).toBe(true);
    expect(updater.reset.mock.calls.length + updater.set.mock.calls.length).toBe(1);
    await live.confirm(Promise.resolve());
    expect(updater.notifyAppReady).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('decides without confirming; confirm waits for ready, once', async () => {
    const live = await prepareLiveUpdates(options());
    expect(live.restarting).toBe(false);
    expect(updater.reset).not.toHaveBeenCalled();
    expect(updater.set).not.toHaveBeenCalled();
    await settle();
    expect(updater.notifyAppReady).not.toHaveBeenCalled();

    let done!: () => void;
    const ready = new Promise<void>((r) => (done = r));
    const first = live.confirm(ready);
    const second = live.confirm(Promise.resolve());
    await settle();
    expect(updater.notifyAppReady).not.toHaveBeenCalled();
    done();
    await Promise.all([first, second]);
    expect(updater.notifyAppReady).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledOnce();
  });
});
