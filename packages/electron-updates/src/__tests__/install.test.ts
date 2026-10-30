import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { appBundleOf, installTarget, stage, swapScript } from '../install';

const host = { exe: '/x', env: {}, appName: 'App' };

describe('installTarget', () => {
  it('Windows runs the installer', () => {
    expect(installTarget({ ...host, platform: 'win32' })).toEqual({ kind: 'installer' });
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

describe.skipIf(process.platform !== 'darwin')('stage on macOS', () => {
  /** A zip of a minimal App.app at `version`, made with ditto as electron-builder's zips are read. */
  async function zippedBundle(version: string): Promise<{ dir: string; zip: string }> {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'eu-mac-'));
    const contents = path.join(dir, 'src', 'App.app', 'Contents');
    mkdirSync(path.join(contents, 'MacOS'), { recursive: true });
    writeFileSync(path.join(contents, 'MacOS', 'App'), '#!/bin/sh\n');
    writeFileSync(path.join(contents, 'Info.plist'), `<plist><dict><key>CFBundleVersion</key><string>${version}</string></dict></plist>`);
    const zip = path.join(dir, 'download', 'App-mac.zip');
    mkdirSync(path.dirname(zip));
    execFileSync('/usr/bin/ditto', ['-c', '-k', '--keepParent', path.join(dir, 'src', 'App.app'), zip]);
    return { dir, zip };
  }
  const target = { kind: 'swap', platform: 'darwin', path: '/Applications/App.app' } as const;

  it('unpacks the bundle and checks its name, executable and version', async () => {
    const { dir, zip } = await zippedBundle('1.2.3');
    const staged = await stage(target, zip, '1.2.3', '/Applications/App.app/Contents/MacOS/App');
    expect(staged.path).toBe(path.join(dir, 'download', 'unpacked', 'App.app'));
    expect(existsSync(path.join(staged.path, 'Contents', 'MacOS', 'App'))).toBe(true);
  });

  it('rejects a bundle of another version', async () => {
    const { zip } = await zippedBundle('1.2.2');
    await expect(stage(target, zip, '1.2.3', '/Applications/App.app/Contents/MacOS/App')).rejects.toThrow(/isn't version 1\.2\.3/);
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
