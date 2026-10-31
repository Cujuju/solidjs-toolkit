# @cujuju/electron-updates

Signed **stable** and **nightly** updates for Electron apps, from a public GitHub repo's releases.
Windows, macOS and Linux share one path: find the release for the channel, read its signed
`update-<platform>.json`, download, verify, stage, apply when the app quits. Only the apply step
differs by OS:

| OS | Update file | Applied by |
|---|---|---|
| Windows | NSIS installer (`.exe`) | running it silently (`--updated /S`, plus `--force-run` to relaunch) |
| macOS | unpacked `.app` bundle | swapping the bundle after the app exits (no Squirrel.Mac, so ad-hoc signed builds update) |
| Linux | AppImage | swapping the AppImage file (`$APPIMAGE`) after the app exits |

No dependencies; not a Solid package. It doesn't use `electron-updater`.

## Channels

- A **nightly** is a GitHub prerelease tagged `v<version>`. **Stable** is GitHub's latest release.
- `promote` turns a nightly into the stable release, keeping the same files and signatures.
- The stable channel reads `releases/latest`. The nightly channel reads the newest 30 releases and takes
  the newest that has a build for this platform and arch.
- Switching from nightly to stable never downgrades. A staged nightly is dropped at the next check.
  The app then waits until a stable release is newer than the installed version.

## Signing

Each index asset's listing carries an Ed25519 signature. It covers the app's signature context, the
version, platform, arch, file name, SHA-512 and size. The app checks the signature before showing the
update, and checks the downloaded file's hash before staging it.

## App (main process)

```ts
import { app, net } from 'electron';
import { createUpdater } from '@cujuju/electron-updates';

const updater = createUpdater({
  app,
  appName: 'MyApp',
  repo: 'me/myapp-updates',
  publicKey: __UPDATE_PUBLIC_KEY__,       // embedded at build time; empty disables updates
  signatureContext: 'myapp-update-v1',
  channel: () => settings.updates.channel, // 'stable' | 'nightly', read at each check
  dir: path.join(app.getPath('userData'), 'updates'),
  fetch: net.fetch,
  autoDownload: false,                     // true: download as soon as found
  installOnQuit: false,                    // true: any quit applies a staged update
});
updater.on('status', send);                // UpdateStatus
updater.on('found', notify);               // scheduled checks only, once per version
updater.setAutoCheck(true);                // 1 min after launch, then every 6 h
// UI: updater.check(), updater.download(), updater.quitAndInstall()
// A graceful restart of your own: updater.installOnQuit(true), then quit.
```

Bundle the package into the main process (electron-vite: `externalizeDepsPlugin({ exclude: ['@cujuju/electron-updates'] })`).

Updates use Gear CDC on both the release and local seed. The signed listing describes a Brotli-compressed
`update-<platform>-<arch>.index`; it names chunks in a pack. Only missing chunks are fetched with
coalesced single-range requests, then verified and assembled byte-identically. No seed uses the same
path with every chunk missing. Directory packs deduplicate and optionally Brotli-compress chunks;
installer and AppImage packs are the original files.

Seeds: Windows uses `<install dir>/update-seed.bin`, Linux uses `$APPIMAGE`, and macOS scans regular
files in the running bundle. Windows keeps an installer-sized seed in the install directory, including
after manual installs. Every Windows app must add this to its electron-builder NSIS include:

```nsis
!macro customInstall
  CopyFiles /SILENT "$EXEPATH" "$INSTDIR\update-seed.bin"
!macroend
```

Use `nsis` on Windows and `AppImage` on Linux. On macOS, pass electron-builder's unpacked `.app`
(e.g. `mac-arm64/MyApp.app`), keeping `dmg` for first installs; updates need no zip. Asset names must
have no whitespace. `WINDOWS_SEED_NAME` is exported for apps needing the seed filename.

## Releasing (local)

```ts
// scripts/release.mts
import { runReleaseCli } from '@cujuju/electron-updates/node';
await runReleaseCli({
  appName: 'MyApp',
  repo: 'me/myapp-updates',
  signatureContext: 'myapp-update-v1',
  dist: 'dist',
  publicKeyFile: 'resources/update-public-key.pem',
  keyFile: process.env.MYAPP_UPDATE_KEY ?? `${os.homedir()}/.config/myapp/update_key`,
  version: () => appVersion(root),
  archs: { win32: ['x64'], darwin: ['arm64', 'x64'], linux: ['x64'] },
  updateSource: (platform, arch, v) => platform === 'darwin' ? `${arch === 'arm64' ? 'mac-arm64' : 'mac'}/MyApp.app` : platform === 'win32' ? `MyApp-Setup-${v}.exe` : `MyApp-${v}.AppImage`,
  extraFiles: (platform, v) => platform === 'darwin' ? [`MyApp-${v}-arm64.dmg`, `MyApp-${v}-x64.dmg`] : [],
});
```

- `keygen`: creates the key pair once. Commit the public key; back up the private key outside the repo.
- `nightly`: run on each OS after packaging. It builds indexes and packs, signs the indexes, writes `update-<platform>.json`
  and uploads them to prerelease `v<version>`, creating the release if needed. It refuses uncommitted
  tracked changes, an unpushed HEAD, a platform already uploaded for that version, and a stable release.
- `promote <version>`: makes that nightly the stable release. It refuses a release missing any
  platform in `archs`, or one not newer than the current stable release.
- `--dry-run` writes the index, pack and manifest locally and prints the `gh` commands without running them.
