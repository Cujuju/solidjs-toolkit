import { For, type JSX } from 'solid-js';
import { Code } from '../ui';

/** Docs only: the package runs in Electron's main process, which a browser page does not have. */

const OPTIONS: [name: string, type: string, doc: string][] = [
  ['app', 'UpdaterHost', "Electron's app: isPackaged, getVersion(), quit() and its 'quit' event."],
  ['appName', 'string', 'Shown in messages about where the app is installed.'],
  ['repo', 'string', 'owner/name of the public repo whose releases are the updates.'],
  ['publicKey', 'string', 'Ed25519 public key (PEM). Empty disables updates.'],
  ['signatureContext', 'string', "Must match the release script's."],
  ['channel', "() => 'stable' | 'nightly'", 'Read at each check.'],
  ['dir', 'string', 'A folder the updater owns, for downloads and the staged update.'],
  ['fetch', 'Fetch', "Electron's net.fetch: the system's proxy and certificates."],
  ['autoDownload', 'boolean?', 'Download as soon as an update is found. Default false.'],
  ['installOnQuit', 'boolean?', 'Apply a staged update at any quit. Default false.'],
];

const STATUSES: [state: string, meaning: string][] = [
  ['unavailable', 'Not an installed build, no public key, or an unsupported platform (with a reason).'],
  ['idle / checking / up-to-date', 'No update in hand.'],
  ['available', 'A signed update was found: version, and whether it is a nightly.'],
  ['downloading', 'With percent.'],
  ['ready', 'Verified and staged: applied at the next quit, or now by quitAndInstall().'],
  ['error', 'First line of the error message.'],
];

const CELL = { padding: '4px 12px 4px 0' };

function Table(props: { head: string[]; rows: string[][] }): JSX.Element {
  return (
    <table class="readout" style={{ 'border-collapse': 'collapse' }}>
      <thead>
        <tr><For each={props.head}>{(h) => <th align="left">{h}</th>}</For></tr>
      </thead>
      <tbody>
        <For each={props.rows}>
          {(row) => <tr><For each={row}>{(cell, i) => <td style={CELL}>{i() === 0 ? <code>{cell}</code> : cell}</td>}</For></tr>}
        </For>
      </tbody>
    </table>
  );
}

export function ElectronUpdatesPage(): JSX.Element {
  return (
    <>
      <h1>@cujuju/electron-updates</h1>
      <p class="note">
        Signed <b>stable</b> and <b>nightly</b> updates for Electron apps, from a public GitHub repo's releases. Windows
        (NSIS installer), macOS (zip of the <code>.app</code>) and Linux (AppImage) share one path: find the release
        for the channel, read its signed <code>update-&lt;platform&gt;.json</code>, download, verify, stage, apply when
        the app quits. Not a Solid package and not a control: it runs in the main process, so this page documents it
        without a live demo.
      </p>

      <h2>App (main process)</h2>
      <Code cap="create, listen, check">{`
import { app, net } from 'electron';
import { createUpdater } from '@cujuju/electron-updates';

const updater = createUpdater({
  app, appName: 'MyApp', repo: 'me/myapp-updates',
  publicKey: __UPDATE_PUBLIC_KEY__,        // embedded at build time; empty disables updates
  signatureContext: 'myapp-update-v1',
  channel: () => settings.updates.channel, // read at each check
  dir: path.join(app.getPath('userData'), 'updates'),
  fetch: net.fetch,
});
updater.on('status', send);                // UpdateStatus
updater.on('found', notify);               // scheduled checks only, once per version
updater.setAutoCheck(true);                // STARTUP_CHECK_DELAY_MS after launch, then every AUTO_CHECK_INTERVAL_MS
// UI: updater.check(), updater.download(), updater.quitAndInstall()
`}</Code>

      <h2>Options</h2>
      <Table head={['option', 'type', 'meaning']} rows={OPTIONS} />

      <h2>Status</h2>
      <Table head={['state', 'meaning']} rows={STATUSES} />

      <h2>Channels and signing</h2>
      <p class="note">
        A nightly is a GitHub prerelease tagged <code>v&lt;version&gt;</code>; stable is the latest release, and{' '}
        <code>promote</code> turns a nightly into it with the same files and signatures. Switching from nightly to
        stable never downgrades. Each listing carries an Ed25519 signature over the signature context, version,
        platform, arch, file name, SHA-512 and size; the app checks it before showing the update and checks the file's
        hash before staging it.
      </p>

      <h2>Releasing (Node)</h2>
      <Code cap="@cujuju/electron-updates/node">{`
import { runReleaseCli } from '@cujuju/electron-updates/node';
await runReleaseCli({ appName, repo, signatureContext, dist, publicKeyFile, keyFile, version, archs, updateFile, extraFiles });
// subcommands: keygen | nightly | promote <version>, plus --dry-run
`}</Code>
    </>
  );
}
