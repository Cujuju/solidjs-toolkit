import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { apply, installTarget, stage } from '../install.js';
import { buildIndex } from '../node/pack.js';

const FIXTURE_EXECUTABLE_MODE = 0o700;
const RELAUNCH_TIMEOUT_MS = 4_000;

function appImage(version: string): string {
  return `#!/bin/sh
if [ "$1" = "--wait-for-quit" ]; then
  printf 'ready\\n'
  read -r quit
else
  printf '%s\\n%s\\n' '${version}' "$2" > "$1"
fi
`;
}

describe.skipIf(process.platform !== 'linux')('Linux AppImage installation', () => {
  it.each([
    { outcome: 'installs and relaunches the update', removeStaged: false },
    { outcome: 'restores and relaunches the original when the swap fails', removeStaged: true },
  ])('$outcome', async ({ removeStaged }) => {
    const root = await mkdtemp(join(tmpdir(), "install owner's app-"));
    const targetPath = join(root, 'App.AppImage');
    const stagedPath = join(root, 'New App.AppImage');
    const relaunched = join(root, 'relaunched');
    const relaunchFlag = "--user-data-dir=an owner's profile";
    const originalVersion = '1.0.0';
    const updateVersion = '1.0.1';
    let running: ReturnType<typeof spawn> | undefined;

    try {
      await writeFile(targetPath, appImage(originalVersion), { mode: FIXTURE_EXECUTABLE_MODE });
      await writeFile(stagedPath, appImage(updateVersion));
      const target = installTarget({
        platform: 'linux',
        exe: process.execPath,
        env: { APPIMAGE: targetPath },
        appName: basename(targetPath),
        relaunchArgs: [relaunched, relaunchFlag],
      });
      if (typeof target === 'string') throw new Error(target);
      const index = await buildIndex(stagedPath, 'linux', 'x64', dirname(stagedPath));
      const update = await stage(target, { path: stagedPath, entries: index.entries }, updateVersion, process.execPath);

      const active = spawn(targetPath, ['--wait-for-quit'], { stdio: ['pipe', 'pipe', 'inherit'] });
      running = active;
      const exited = once(active, 'exit');
      const pid = active.pid;
      if (pid === undefined) throw new Error('AppImage fixture failed to start');
      const [ready] = await once(active.stdout, 'data');
      expect(String(ready)).toBe('ready\n');
      const launchErrors: Error[] = [];
      apply(update, true, pid, (error) => launchErrors.push(error));

      // The running app holds the swap until quit. Removing the verified file forces a real mv failure.
      if (removeStaged) await rm(stagedPath);
      expect(existsSync(relaunched)).toBe(false);
      active.stdin.end('quit\n');
      await expect(exited).resolves.toEqual([0, null]);

      const expectedVersion = removeStaged ? originalVersion : updateVersion;
      await expect.poll(() => existsSync(relaunched) ? readFileSync(relaunched, 'utf8') : '', {
        timeout: RELAUNCH_TIMEOUT_MS,
      }).toBe(`${expectedVersion}\n${relaunchFlag}\n`);
      expect(readFileSync(targetPath, 'utf8')).toBe(appImage(expectedVersion));
      expect(existsSync(stagedPath)).toBe(false);
      expect(existsSync(`${targetPath}.old`)).toBe(false);
      expect(launchErrors).toEqual([]);
    } finally {
      running?.kill();
      await rm(root, { recursive: true, force: true });
    }
  });
});
