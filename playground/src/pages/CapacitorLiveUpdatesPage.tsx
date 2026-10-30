import { For, type JSX } from 'solid-js';
import { Code } from '../ui';

/**
 * Docs only: the package drives Capgo's native updater plugin, which a browser does not have, so
 * the playground does not import it.
 */

const OPTIONS: [name: string, type: string, doc: string][] = [
  ['manifestUrl', 'string', "The updates repo's manifest.json."],
  ['bundleRev', 'number', "This bundle's rev, baked in at build time."],
  ['bundleFingerprint', 'string', 'The native fingerprint this bundle was built for, baked in at build time.'],
  ['apply', "'immediate' | 'next-launch'", 'Switch to a newer bundle at once (the page reloads), or on the next cold start.'],
  ['storageKey', 'string', "localStorage key prefix for this app's state."],
  ['ready', 'Promise<unknown>?', 'Resolves once the app works. Only then is the bundle confirmed; otherwise the plugin rolls it back.'],
  ['checkForUpdates', 'boolean?', 'False: confirm and guard, but never check for updates (end-to-end builds). Default true.'],
];

export function CapacitorLiveUpdatesPage(): JSX.Element {
  return (
    <>
      <h1>@cujuju/capacitor-live-updates</h1>
      <p class="note">
        Self-hosted, signed live (over-the-air) web bundles for Capacitor apps, on Capgo's{' '}
        <code>@capgo/capacitor-updater</code> with none of Capgo's servers. Bundles are GitHub release assets; a{' '}
        <code>manifest.json</code> lists the newest bundle per <b>native fingerprint</b>, so a bundle only reaches
        apps whose native part it was built for. Not a Solid package and not a control: it needs the native
        plugin, so this page documents it without a live demo.
      </p>

      <h2>App</h2>
      <Code cap="start on launch">{`
import { startLiveUpdates } from '@cujuju/capacitor-live-updates';

void startLiveUpdates({
  manifestUrl: 'https://raw.githubusercontent.com/<owner>/<repo>/main/manifest.json',
  bundleRev: __APP_REV__,              // baked in by the build (vite \`define\`)
  bundleFingerprint: __APP_FINGERPRINT__,
  apply: 'immediate',                  // or 'next-launch'
  storageKey: 'myapp.liveUpdates',
  ready: appStarted,                   // optional: confirm only once the app works
});
`}</Code>
      <Code cap="split it when a reload would interrupt startup">{`
import { prepareLiveUpdates } from '@cujuju/capacitor-live-updates';

const live = await prepareLiveUpdates(options);   // may reset() or switch bundles: the page reloads
if (live.restarting) return;                      // start nothing
startEngine();
void live.confirm(engineStarted);                 // confirm once it works, then check for updates
`}</Code>

      <h2>Options</h2>
      <table class="readout" style={{ 'border-collapse': 'collapse' }}>
        <thead>
          <tr><th align="left">option</th><th align="left">type</th><th align="left">meaning</th></tr>
        </thead>
        <tbody>
          <For each={OPTIONS}>
            {([name, type, doc]) => (
              <tr>
                <td style={{ padding: '4px 12px 4px 0' }}><code>{name}</code></td>
                <td style={{ padding: '4px 12px 4px 0' }}><code>{type}</code></td>
                <td style={{ padding: '4px 0' }}>{doc}</td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
      <p class="note">
        <code>prepareLiveUpdates</code> takes the same options without <code>ready</code> and returns{' '}
        <code>{'{ restarting, confirm(ready?) }'}</code>. The bundle is confirmed (<code>notifyAppReady</code>) once{' '}
        <code>ready</code> resolves; if it never does, the plugin rolls it back after its{' '}
        <code>appReadyTimeout</code>. A bundle that failed is never downloaded again. Checks run on start and on
        each return to the app.
      </p>
      <Code cap="Capacitor config">{`
CapacitorUpdater: { autoUpdate: false, statsUrl: '', version: nativeVersion(...), publicKey }
`}</Code>

      <h2>Label helpers</h2>
      <Code cap="pure parsers, exported from the app entry">{`
import { bundleLabelRev, parseNativeVersion } from '@cujuju/capacitor-live-updates';

bundleLabelRev('3.0.0-r612');                    // 612 (null when the label has no rev)
parseNativeVersion('3.0.0-r612-1a2b3c4d5e6f');   // { rev: 612, fingerprint: '1a2b3c4d5e6f' }
`}</Code>

      <h2>Build and publish (Node)</h2>
      <Code cap="@cujuju/capacitor-live-updates/node">{`
const rev = buildRev({ roots: [root], envVar: 'MY_BUILD_REV' });   // commit count; several roots add up
const fingerprint = nativeFingerprint(root, { lockfile, nativeDirs, configFiles });
nativeVersion(pkg.version, rev, fingerprint);                        // the native app's updater version

const source = gitSource(root, 'HEAD');
await publishLiveUpdate({
  appId, title, assetPrefix, repo, keyPath, dryRun, source,
  build: snapshotBuild({ root, commit: source.commit, env: { MY_BUILD_REV: String(source.rev) } }),
});
`}</Code>

      <h2>Security</h2>
      <p class="note">
        Only bundles signed with the key matching <code>publicKey</code> install. The manifest itself is unsigned,
        so an entry installs only if its <code>version</code> ends in <code>-r&lt;rev&gt;</code>, and at start a
        bundle whose label rev differs from its baked-in <code>bundleRev</code> is marked failed and reset.{' '}
        <b>Residual:</b> someone able to write the manifest can relist an old signed bundle under a higher rev; it
        runs once, until <code>startLiveUpdates</code> resets it. No new code can be injected.
      </p>
    </>
  );
}
