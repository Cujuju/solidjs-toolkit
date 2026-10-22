# @cujuju/capacitor-live-updates

Self-hosted, signed live (over-the-air) web bundles for Capacitor apps, on Capgo's
`@capgo/capacitor-updater` with none of Capgo's servers. Bundles are GitHub release assets; a
`manifest.json` in the same public repo lists the newest bundle per **native fingerprint**, so a web
bundle only reaches apps whose native part (plugins, Capacitor config, native code) it was built for.

Not a Solid package: its only peer is `@capgo/capacitor-updater` (≥ 8.53.0), which the app also lists
as its own dependency so `cap sync` installs the native plugin.

## App

```ts
import { startLiveUpdates } from '@cujuju/capacitor-live-updates';

void startLiveUpdates({
  manifestUrl: 'https://raw.githubusercontent.com/<owner>/<repo>/main/manifest.json',
  bundleRev: __APP_REV__,              // baked in by the build (vite `define`)
  bundleFingerprint: __APP_FINGERPRINT__,
  apply: 'immediate',                  // or 'next-launch'
  storageKey: 'myapp.liveUpdates',
  ready: appStarted,                   // optional: confirm only once the app works
});
```

- **immediate**: a newer bundle is downloaded and switched to at once (the page reloads).
- **next-launch**: download only; the next cold start switches to it before awaiting `ready`. Not
  Capgo's `next()`, which also installs when the app goes to the background.
- The bundle is confirmed (`notifyAppReady`) once `ready` resolves; if it never does, the plugin rolls
  it back after its `appReadyTimeout` (default 10 s; raise it in the Capacitor config for slow starts).
  A bundle that failed is never downloaded again.
- Checks run on start and on each return to the app.

Capacitor config: `CapacitorUpdater: { autoUpdate: false, statsUrl: '', version, publicKey }`, where
`version` is `nativeVersion(...)`, below.

## Build (Node: `@cujuju/capacitor-live-updates/node`)

```js
const rev = buildRev({ roots: [root], envVar: 'MY_BUILD_REV' });   // commit count; several roots add up
const fingerprint = nativeFingerprint(root, { lockfile, nativeDirs, configFiles });
nativeVersion(pkg.version, rev, fingerprint);                        // the native app's updater version
```

`nativeFingerprint` reads `package-lock.json` or `pnpm-lock.yaml` (v6+), at any path relative to the
app root. Defaults hash `capacitor.config.ts`, `ios/App/App` and `android/app/src/main`.

## Publish

```js
const source = gitSource(root, 'HEAD');
await publishLiveUpdate({
  appId, title, assetPrefix, repo, keyPath, dryRun, source,
  build: snapshotBuild({ root, commit: source.commit, env: { MY_BUILD_REV: String(source.rev) } }),
});
```

`build(workDir)` may be any function returning `{ appDir, distDir, fingerprint }`; `appDir` is only
read. Before releasing, the bundle must have an `index.html`, no source maps, a CSP that lets it fetch
the manifest, and code that does. Needs `gh` with push access to `repo`.

## Security

Only bundles signed with the private key matching `publicKey` install: the plugin rejects a missing or
wrong session key or checksum. The manifest itself is unsigned, so its `rev` and `version` are guarded:

- an entry installs only if its `version` ends in `-r<rev>`;
- at start, a downloaded bundle whose label's rev differs from its baked-in `bundleRev` is marked
  failed and reset to the app's own bundle.

**Residual:** someone able to write the manifest can relist an old signed bundle under a higher rev.
It runs once, until `startLiveUpdates` resets it; no new code can be injected.
