# @cujuju/electron-notices

Notification surfaces for Electron overlays or inside any app window: Tray drip, Top drip, and Console. No runtime dependencies. The renderer peers on `solid-js >=1.7.0`.

Electron is injected through structural interfaces, so the package has no Electron dependency or import. The root entry is safe in Node and sandboxed preloads: no DOM, JSX, or CSS imports.

## Contract

The host owns meaning; the package owns presentation and lifecycle.

- **Tones** are host-defined: `NoticeView.tones` maps a tone name to `{ color, durationMs?, tag?, icon? }`. `BASIC_TONES` (info/ok/warn/error, errors sticky) is a preset. An unknown tone warns once and paints in the accent colour.
- **Duration**: `noticeDuration` resolves `notice.durationMs` → tone → `config.durationMs` (default `NOTICE_VISIBLE_MS`, 6000). `0` means until dismissed. Pinned notices never expire; unpinning restarts the full duration.
- **`key`**: a notice with the key of a live notice replaces it and becomes the newest. If the replaced notice was not yet delivered, its `show()` result follows the replacement's. `withdraw({ key })` or `withdraw({ id })` removes notices.
- **`actions`**: footer buttons on tray cards; clicks reach `onAction(notice, actionId)`. `pinnable` adds a pin toggle. Clicking the card calls `onOpen(notice)` and dismisses it.
- **`content`**: `{ kind, data }` is drawn below the title by the renderer registered for `kind` (`renderers` prop). `data` crosses IPC, so it must be structured-clone safe. Tray only; Console and Top drip show title and body.
- **Handshake**: `NoticeOverlay` calls `bridge.ready()` once its listeners are attached; the overlay sends the view and pending notices only then, so a page that mounts late loses nothing.
- **Delivery off**: a view whose delivery excludes the overlay clears its notices; re-enabling does not bring them back.
- **Host events**: `onOpen`, `onAction`, and `onClose(notice)`, called once whenever a notice leaves the ledger, for per-notice host state.
- **Delivery**: `show()` resolves `{ delivered: true }` once the renderer has the notice on the page, and `{ delivered: false }` after `ackTimeoutMs` (default `NOTICE_ACK_TIMEOUT_MS`), on renderer crash, on destroy, or when delivery excludes the overlay. A timed-out notice is withdrawn so the host's fallback cannot double-show.
- **Recovery**: after an overlay renderer crash, the next `show()` recreates the window and replays live notices with their remaining time. Residual: time paused under the mouse is not mirrored to main, so a replayed notice can expire early.
- **Placement**: `config.position` is `auto` or one of six placements; `auto` picks the corner nearest the taskbar (inline: bottom right). Top drip is always top centre. `config.trayVisible` cards show at once; older ones fold into a counter. At most `MAX_KEPT_NOTICES` (8) are kept; the oldest unpinned is evicted first.

## Overlay window

```ts
// Main process, after app readiness
import { BrowserWindow, screen, ipcMain } from 'electron';
import { createNoticeOverlay, createNotifier, handleNoticeIpc, OVERLAY_WINDOW_OPTIONS } from '@cujuju/electron-notices';
const overlay = createNoticeOverlay({
  createWindow() {
    const w = new BrowserWindow({ ...OVERLAY_WINDOW_OPTIONS, webPreferences: { preload: preloadPath } });
    void w.loadFile(overlayPage);
    return w;
  },
  primaryDisplay: () => screen.getPrimaryDisplay(),
  view: () => currentView,
  platform: process.platform,
  onOpen: (n) => openTarget(n.target),
  onAction: (n, actionId) => runAction(n, actionId),
});
handleNoticeIpc(ipcMain, overlay);
overlay.refresh(); // Repeat for settings, theme and display changes.
const notifier = createNotifier({ overlay, delivery: () => currentView.config.delivery, system: showSystemNotice });
const { delivered } = await notifier.notify({ title: 'Saved', tone: 'ok', target: 'home' });
// Destroy overlay on quit.
```

```ts
// Preload
import { contextBridge, ipcRenderer } from 'electron';
import { createNoticeBridge } from '@cujuju/electron-notices';
contextBridge.exposeInMainWorld('notices', createNoticeBridge(ipcRenderer));
```

```tsx
// Overlay page
import { NoticeOverlay } from '@cujuju/electron-notices/renderer';
import '@cujuju/electron-notices/styles.css';
<NoticeOverlay bridge={window.notices} icons={icons} renderers={renderers} />;
```

`overlay.warm()` creates and loads the window ahead of the first notice; call it after startup when the overlay page is heavy enough to miss `ackTimeoutMs` on a cold load. `handleNoticeIpc` ignores messages from any window but the overlay's own, so a preload shared by several windows cannot drive it.

On Windows, Chromium scales frameless windows as they show and hide. Call `app.commandLine.appendSwitch('wm-window-animations-disabled')` before app readiness if that motion is unwanted; it applies to every frameless window in the app.

## Inside an app window

```tsx
import { createLocalNoticeHost, createNotifier } from '@cujuju/electron-notices';
import { NoticeOverlay } from '@cujuju/electron-notices/renderer';
const host = createLocalNoticeHost({ view: () => currentView, onOpen, onAction });
const notifier = createNotifier({ overlay: host, delivery: () => 'overlay' });
<NoticeOverlay bridge={host.bridge} inline icons={icons} renderers={renderers} />;
```

Inline surfaces are fixed to the viewport and leave page styles alone. `--notice-inline-inset-top` keeps top placements below host chrome; `--notice-z` sets the stacking order.

## Theming

`NoticeView.appearance.vars` maps host palette values to `--notice-*` properties; optional `dripVars` supplies the top drip palette. Tone colours are any CSS colour, including host variables. The host owns loading, routing, system notifications, and refresh subscriptions.
