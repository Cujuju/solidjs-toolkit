# @cujuju/electron-notices

Transparent Electron notification overlays: Tray drip, Top drip, and Console. No runtime dependencies. The renderer peers on `solid-js >=1.7.0`.

Electron is injected through structural interfaces, so the package has no Electron dependency or import. The root entry is safe in Node and sandboxed preloads: no DOM, JSX, or CSS imports.

## API

The root exports `createNoticeOverlay`, `OVERLAY_WINDOW_OPTIONS`, `createNotifier`, `handleNoticeIpc`, `createNoticeBridge`, `overlayBounds`, and their option/interface types. Shared types include `NoticeInput`, `Notice`, `NoticeTone`, `NoticeConfig`, `NoticeAppearance`, `NoticeView`, `NoticeBridge`, `NoticeDelivery`, and `NoticeStyle`.

`DEFAULT_NOTICE_CONFIG`, `normalizeNoticeConfig`, `NOTICE_DELIVERIES`, `NOTICE_STYLES`, `MIN_CONSOLE_LINES`, `MAX_CONSOLE_LINES`, `isSticky`, `deliversTo`, and `NOTICE_CHANNELS` supply config normalization and transport contracts. Errors are sticky unless explicitly overridden. Delivery defaults to overlay; styles default to tray.

The renderer entry exports `NoticeOverlay`, `NoticeOverlayProps`, `createNoticeQueue`, `NoticeQueue`, and `NOTICE_VISIBLE_MS` (6000). Queues retain eight notices, support dismiss/clear and pause/resume, and expire nonsticky notices. Import the stylesheet explicitly.

## Wiring

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
});
handleNoticeIpc(ipcMain, overlay, openTarget);
overlay.refresh(); // Repeat for settings, theme and display changes.
const notifier = createNotifier({ overlay, delivery: () => currentView.config.delivery, system: showSystemNotice });
notifier.notify({ title: 'Saved', tone: 'ok', target: 'home' });
// Destroy overlay on quit.
```

```ts
// Preload
import { contextBridge, ipcRenderer } from 'electron';
import { createNoticeBridge } from '@cujuju/electron-notices';
contextBridge.exposeInMainWorld('notices', createNoticeBridge(ipcRenderer));
```

```tsx
// Renderer
import { NoticeOverlay } from '@cujuju/electron-notices/renderer';
import '@cujuju/electron-notices/styles.css';
<NoticeOverlay bridge={window.notices} />;
```

`NoticeView.appearance.vars` maps host palette values to `--notice-*` properties; optional `dripVars` supplies the top drip palette. The host owns loading, routing, system notifications, and refresh subscriptions.
