import {
  app,
  BrowserWindow,
  WebContentsView,
  Menu,
  ipcMain,
  dialog,
  shell,
  nativeImage,
  nativeTheme,
  type MenuItemConstructorOptions
} from 'electron'
import { join } from 'path'
import type { RecentMenuEntry, SelectedElement } from '../shared/api'
import { registerDevServerIpc } from './devserver'
import { registerSimulatorIpc } from './simulator'
import { registerAgentIpc } from './agent'
import { registerPropsIpc } from './props'
import { registerAnnotationsIpc } from './annotations'
import { registerTokensIpc } from './tokens'
import { registerSetupIpc } from './setup'
import { ensureBranch, switchBranch, listBranches, checkoutBranch } from './git'
import { createProject } from './scaffold'
import { registerDiagnoseIpc } from './diagnose'

// Product name — drives the macOS app menu label and the About panel. Set at
// module load (before app is ready) so the menu bar reads "Praxis", not "Electron".
app.setName('Praxis')

// App icon (dev dock icon + Win/Linux window icon). Lives at build/icon.png,
// resolved relative to the compiled main (out/main → ../../build). Loaded up front
// so a missing file degrades to an empty image (guarded at use) instead of throwing.
const appIcon = nativeImage.createFromPath(join(__dirname, '../../build/icon.png'))

let mainWindow: BrowserWindow | null = null
let previewView: WebContentsView | null = null
let previewUrl: string | null = null
let previewRetries = 0
// v2 select mode: tracked here so it survives preview navigations (the injected
// preload re-runs fresh on each load and must be re-armed).
let selectModeActive = false
let commentModeActive: 'comment' | 'annotate' | null = null
// Mobile viewport: draw the iPhone bezel INSIDE the preview page (pointer-events
// none) so it overlays the app's screen corners yet passes clicks/selection through.
let frameModeActive = false
// Channels mirrored in src/preview/preload.ts (the injected preview preload).
const PREVIEW_SET_MODE = 'dsgn:preview:set-select-mode'
const PREVIEW_PICKED = 'dsgn:preview:element-picked'
const PREVIEW_CANCELLED = 'dsgn:preview:select-cancelled'
const PREVIEW_SET_PINS = 'dsgn:preview:set-annotations'
const PREVIEW_PIN_CLICK = 'dsgn:preview:pin-click'
const PREVIEW_READINESS = 'dsgn:preview:readiness'
const PREVIEW_TEXT_EDIT = 'dsgn:preview:text-edit'
const PREVIEW_SET_COMMENT_MODE = 'dsgn:preview:set-comment-mode'
const PREVIEW_COMMENT_MODE = 'dsgn:preview:comment-mode'
const PREVIEW_COMMENT = 'dsgn:preview:comment'
const PREVIEW_SET_FRAME = 'dsgn:preview:set-frame'
const PREVIEW_TOOLBAR_ACTION = 'dsgn:preview:toolbar-action'
const PREVIEW_CLEAR_SELECTED = 'dsgn:preview:clear-selected'

// Latest annotation pins, re-pushed to the preview after each navigation.
let annotationPins: { id: string; selector: string }[] = []

// Chromium error codes worth retrying — the dev server is up but not yet serving.
const TRANSIENT_LOAD_ERRORS = new Set([-324, -102, -101, -105, -106, -109])

// Empty-state shown in the native preview view. Themed via prefers-color-scheme
// so it tracks the OS (matching the renderer, which also follows the OS) — and
// adapts live if the user flips the system appearance while it's showing.
const PLACEHOLDER_HTML = `data:text/html;charset=utf-8,${encodeURIComponent(`
  <html>
    <head>
      <meta name="color-scheme" content="light dark">
      <style>
        body { margin:0; height:100vh; display:flex; align-items:center; justify-content:center;
               font-family:-apple-system,system-ui,sans-serif; color:#8a8a8a; background:#fafafa; }
        .ph-title { font-size:15px; font-weight:600; color:#555; }
        .ph-sub { font-size:13px; margin-top:6px; }
        @media (prefers-color-scheme: dark) {
          body { color:#8d8d94; background:#111113; }
          .ph-title { color:#ededed; }
        }
      </style>
    </head>
    <body>
      <div style="text-align:center">
        <div class="ph-title">No project open</div>
        <div class="ph-sub">Open a folder to launch its dev server here.</div>
      </div>
    </body>
  </html>
`)}`

/** Base color painted behind the preview view — tracks the OS appearance so the
 *  empty state (and the flash before a project's page loads) isn't a white slab
 *  in dark mode. */
const previewBg = (): string => (nativeTheme.shouldUseDarkColors ? '#111113' : '#ffffff')

/**
 * The preview is a native WebContentsView layered over the renderer (not an
 * iframe) so that later we can inject a preload into the previewed app for
 * element selection. The renderer owns the layout and reports the rectangle
 * the preview should occupy via the `preview:set-bounds` IPC channel.
 */
function isLocalPreviewUrl(url: string): boolean {
  try {
    const u = new URL(url)
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1'
    return (u.protocol === 'http:' || u.protocol === 'https:') && local
  } catch {
    return false
  }
}

/** Open a URL in the user's browser, but only for safe web/mail schemes. */
function openExternalSafe(url: string): void {
  try {
    const { protocol } = new URL(url)
    if (protocol === 'http:' || protocol === 'https:' || protocol === 'mailto:') {
      void shell.openExternal(url)
    }
  } catch {
    /* malformed URL — ignore */
  }
}

/**
 * Compare two URLs by their canonical form. Chromium canonicalizes URLs it
 * reports back (`validatedURL`, `getURL()`) — e.g. it appends a trailing slash
 * to an origin-only URL — while the URL we're handed from the renderer is not.
 * A raw `===` therefore never matches for root URLs, silently disabling the
 * did-fail-load retry and the did-finish-load overlay re-arm. Canonicalize both.
 */
function sameUrl(a: string | null, b: string | null): boolean {
  if (!a || !b) return false
  try {
    return new URL(a).toString() === new URL(b).toString()
  } catch {
    return a === b
  }
}

/**
 * Cmd/Ctrl+R must NOT reload the dsgn renderer: that wipes the chat + the open
 * project (renderer-only zustand state) while the native preview WebContentsView
 * survives, stranding the tool in a broken half-state ("no project open" but the
 * preview still showing). Intercept it on whichever webContents has focus and
 * reload the PREVIEW instead. `preventDefault()` in before-input-event also
 * suppresses the menu's reload accelerator (per Electron docs), so this fully
 * disables the keyboard reload — View → Reload (a menu click) stays as a dev
 * escape hatch if the tool itself ever needs a hard reload.
 */
// Recents shown in File → Open Recent. The renderer owns the list (localStorage)
// and pushes it over `menu:set-recents`; we cap at 8 and rebuild the menu.
let recentProjects: RecentMenuEntry[] = []

/**
 * Native app menu. A "File" menu holds New/Open Project + Open Recent (a submenu
 * of up to 8 recently opened projects); an "Actions" menu carries the preview
 * commands (Reload/Select/Publish/Stop/Viewport) that used to be titlebar
 * buttons. Because we set our OWN menu, the default View → Reload (which reloaded
 * the renderer and stranded the tool) is gone; our Cmd+R reloads the PREVIEW
 * instead. Renderer-side actions go over `menu:action`; a chosen recent goes over
 * `menu:open-recent`; reload is handled here directly.
 */
function buildAppMenu(): void {
  const send = (action: string): void => mainWindow?.webContents.send('menu:action', action)
  const openRecent = (root: string): void =>
    mainWindow?.webContents.send('menu:open-recent', root)

  const recentItems: MenuItemConstructorOptions[] = recentProjects.length
    ? [
        ...recentProjects.slice(0, 8).map((r) => ({
          label: r.name,
          sublabel: r.root,
          toolTip: r.root,
          click: () => openRecent(r.root)
        })),
        { type: 'separator' as const },
        { label: 'Clear Menu', click: () => send('clear-recents') }
      ]
    : [{ label: 'No Recent Projects', enabled: false }]

  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' as const }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Project…', accelerator: 'CmdOrCtrl+N', click: () => send('new-project') },
        { label: 'Open Project…', accelerator: 'CmdOrCtrl+O', click: () => send('open-project') },
        { label: 'Open Recent', submenu: recentItems }
      ]
    },
    { role: 'editMenu' },
    {
      label: 'Actions',
      submenu: [
        { label: 'Reload Preview', accelerator: 'CmdOrCtrl+R', click: () => send('reload') },
        { label: 'Select Element', accelerator: 'CmdOrCtrl+Shift+S', click: () => send('select') },
        { label: 'Toggle Logs', accelerator: 'CmdOrCtrl+L', click: () => send('logs') },
        { label: 'Publish', accelerator: 'CmdOrCtrl+Shift+P', click: () => send('publish') },
        { label: 'Stop Project', accelerator: 'CmdOrCtrl+.', click: () => send('stop') },
        { type: 'separator' },
        {
          label: 'Viewport',
          submenu: [
            { label: 'Desktop', accelerator: 'CmdOrCtrl+1', click: () => send('viewport:desktop') },
            { label: 'Mobile', accelerator: 'CmdOrCtrl+2', click: () => send('viewport:mobile') }
          ]
        }
      ]
    },
    { role: 'windowMenu' }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function ensurePreviewView(): WebContentsView {
  if (previewView) return previewView
  previewView = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      // Inject the select-mode overlay into the previewed app.
      preload: join(__dirname, '../preload/preview.js')
    }
  })
  previewView.setBackgroundColor(previewBg())
  previewView.webContents.loadURL(PLACEHOLDER_HTML)
  mainWindow?.contentView.addChildView(previewView)

  const wc = previewView.webContents

  // Chrome-style right-click → Inspect / Open Console on the PREVIEW's own
  // DevTools (so the user can inspect their web app's DOM + console). Only for a
  // real web preview, not the placeholder or the simulator's streamed frame.
  wc.on('context-menu', (_e, params) => {
    if (!previewUrl || !/^https?:/.test(previewUrl)) return
    // Always open DevTools DETACHED (its own window). The preview is a child
    // WebContentsView, so a docked panel crams itself into the view's bounds —
    // tiny and clipped, especially in the mobile (390px) viewport.
    const openDetached = (): void => {
      if (!wc.isDevToolsOpened()) wc.openDevTools({ mode: 'detach' })
    }
    Menu.buildFromTemplate([
      {
        label: 'Inspect element',
        click: () => {
          openDetached()
          wc.inspectElement(params.x, params.y)
        }
      },
      { label: 'Open DevTools console', click: openDetached }
    ]).popup()
  })

  // The previewed app is untrusted-ish: keep it on its own local origin, and
  // never hand it a URL scheme the OS could act on (file:/smb:/custom protocol
  // handlers). Only web + mail links escape to the user's browser.
  wc.setWindowOpenHandler(({ url }) => {
    if (!isLocalPreviewUrl(url)) openExternalSafe(url)
    return { action: 'deny' }
  })
  wc.on('will-navigate', (e, url) => {
    if (isLocalPreviewUrl(url)) return
    // A page-initiated data:/blob: navigation would replace the preview with
    // attacker HTML that still has our preload injected — block it outright.
    e.preventDefault()
    openExternalSafe(url)
  })

  // Retry transient failures: fast while the dev server is coming up, then a
  // slow indefinite poll — a server that dies mid-session (crash, manual kill)
  // can come back minutes later, and the preview must self-heal rather than
  // park on Chromium's error page until the project is reopened. Only fires
  // for the current previewUrl, so an idle/placeholder view never polls.
  wc.on('did-fail-load', (_e, errorCode, _desc, validatedURL, isMainFrame) => {
    if (!isMainFrame || !previewUrl || !sameUrl(validatedURL, previewUrl)) return
    if (!TRANSIENT_LOAD_ERRORS.has(errorCode)) return
    previewRetries++
    const delay = previewRetries > 40 ? 3000 : 400
    setTimeout(() => previewUrl && previewView?.webContents.loadURL(previewUrl), delay)
  })

  // Once the intended URL loads, reset the budget so it's per-outage not per-session.
  // The preload re-ran on this fresh page, so re-arm select mode if it was on —
  // but only on the real preview page, never the "no project" placeholder.
  wc.on('did-finish-load', () => {
    if (previewUrl && sameUrl(wc.getURL(), previewUrl)) {
      previewRetries = 0
      if (selectModeActive) wc.send(PREVIEW_SET_MODE, true)
      if (commentModeActive) wc.send(PREVIEW_SET_COMMENT_MODE, commentModeActive)
      if (frameModeActive) wc.send(PREVIEW_SET_FRAME, true)
      // Only re-send pins when there are some — an empty push would make the
      // preload build (and inject) the overlay host for nothing.
      if (annotationPins.length) wc.send(PREVIEW_SET_PINS, annotationPins)
    }
  })

  return previewView
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'Praxis',
    // Window icon (Windows/Linux; macOS uses the dock icon set below). Omit when
    // the PNG is missing so Electron falls back to its default rather than erroring.
    ...(appIcon.isEmpty() ? {} : { icon: appIcon }),
    backgroundColor: previewBg(),
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  // Keep the native surfaces' base color in step with the OS appearance (the
  // placeholder HTML re-themes itself via prefers-color-scheme; this handles the
  // solid fill behind it and the window).
  nativeTheme.on('updated', () => {
    const bg = previewBg()
    mainWindow?.setBackgroundColor(bg)
    previewView?.setBackgroundColor(bg)
  })

  // Open external links in the user's browser, never in-app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerPreviewIpc(): void {
  let lastBounds = { x: 0, y: 0, width: 0, height: 0, radius: 0 }
  // Apply the renderer's slot rect (PreviewPane already lays out around the
  // floating prop panel's strip, viewport-aware).
  const applyBounds = (): void => {
    const view = ensurePreviewView()
    view.setBounds({
      x: Math.round(lastBounds.x),
      y: Math.round(lastBounds.y),
      width: Math.max(0, Math.round(lastBounds.width)),
      height: Math.round(lastBounds.height)
    })
    // Round the native view's corners: the card's inner radius in desktop
    // viewport, the iPhone screen's in mobile (both supplied by the renderer).
    view.setBorderRadius(Math.round(lastBounds.radius || 0))
  }

  // Renderer reports where the preview rectangle is, in CSS pixels (== DIP).
  ipcMain.on(
    'preview:set-bounds',
    (_e, bounds: { x: number; y: number; width: number; height: number; radius?: number }) => {
      lastBounds = { ...bounds, radius: bounds.radius ?? 0 }
      applyBounds()
  })


  // Mobile viewport toggles the in-page iPhone bezel overlay (click pass-through).
  ipcMain.on('preview:set-frame', (_e, active: boolean) => {
    frameModeActive = !!active
    previewView?.webContents.send(PREVIEW_SET_FRAME, frameModeActive)
  })

  ipcMain.handle('preview:load', (_e, url: string) => {
    if (!isLocalPreviewUrl(url)) return
    previewUrl = url
    previewRetries = 0
    const view = ensurePreviewView()
    // Recover from any leaked hide (set-dragging is also used by overlaying
    // renderer UI, e.g. the branch dropdown) — a fresh load must be visible.
    view.setVisible(true)
    view.webContents.loadURL(url)
  })

  ipcMain.handle('preview:reset', () => {
    previewUrl = null
    previewRetries = 0
    // No app to select in on the placeholder — keep main's flags honest so none
    // of them silently re-arm the overlay/frame/pins on a later load (the
    // did-finish-load re-arm above reads these). PreviewPane re-reports the
    // frame on the next open, so zeroing it here is safe. (Renderer disarms too.)
    selectModeActive = false
    commentModeActive = null
    frameModeActive = false
    annotationPins = []
    ensurePreviewView().webContents.loadURL(PLACEHOLDER_HTML)
  })

  // Hide the native view during a split-drag so the renderer keeps mouse events.
  ipcMain.on('preview:set-dragging', (_e, active: boolean) => {
    previewView?.setVisible(!active)
  })

  // Freeze-frame support: snapshot the live preview so renderer UI (e.g. the
  // branch dropdown) can overlay a pixel-identical <img> while the native view
  // hides beneath it — the preview appears to stay put, but the DOM wins.
  ipcMain.handle('preview:capture', async (): Promise<string | null> => {
    try {
      const img = await previewView?.webContents.capturePage()
      return img && !img.isEmpty() ? img.toDataURL() : null
    } catch {
      return null
    }
  })

  // v2 select mode: renderer → preview (arm/disarm the overlay).
  ipcMain.handle('preview:set-select-mode', (_e, active: boolean) => {
    selectModeActive = active
    if (active) commentModeActive = null // mutually exclusive with comment/annotate
    previewView?.webContents.send(PREVIEW_SET_MODE, active)
  })

  // preview → renderer relays. Only trust events from the preview's webContents.
  ipcMain.on(PREVIEW_PICKED, (e, el: SelectedElement) => {
    if (e.sender !== previewView?.webContents) return
    mainWindow?.webContents.send('preview:element-picked', el)
  })
  ipcMain.on(PREVIEW_CANCELLED, (e) => {
    if (e.sender !== previewView?.webContents) return
    selectModeActive = false
    mainWindow?.webContents.send('preview:select-cancelled')
  })

  // Selection-toolbar actions that need the renderer (code drawer / delete turn);
  // comment/annotate are handled entirely inside the preview's composer.
  ipcMain.on(PREVIEW_TOOLBAR_ACTION, (e, kind: string) => {
    if (e.sender !== previewView?.webContents) return
    if (kind !== 'code' && kind !== 'delete') return
    mainWindow?.webContents.send('preview:toolbar-action', kind)
  })
  // Renderer dropped the selection (pill ×, message sent) → hide the toolbar.
  ipcMain.on('preview:clear-selected', () => {
    previewView?.webContents.send(PREVIEW_CLEAR_SELECTED)
  })

  // v3 annotation pins: renderer pushes the list → preview; clicks come back.
  ipcMain.on('preview:set-annotations', (_e, pins: { id: string; selector: string }[]) => {
    annotationPins = Array.isArray(pins) ? pins : []
    previewView?.webContents.send(PREVIEW_SET_PINS, annotationPins)
  })
  ipcMain.on(PREVIEW_PIN_CLICK, (e, id: string) => {
    if (e.sender !== previewView?.webContents) return
    mainWindow?.webContents.send('annotations:pin-click', id)
  })

  // Readiness probe (stamp count) → renderer, to drive the setup offer.
  ipcMain.on(PREVIEW_READINESS, (e, info: { stamps: number }) => {
    if (e.sender !== previewView?.webContents) return
    mainWindow?.webContents.send('preview:readiness', info)
  })

  // Inline text edit committed in the preview → renderer (which applies it).
  ipcMain.on(PREVIEW_TEXT_EDIT, (e, edit: { source: string; text: string }) => {
    if (e.sender !== previewView?.webContents) return
    mainWindow?.webContents.send('preview:text-edit', edit)
  })

  // Inline commenting (C/Y): renderer arms the mode → preview.
  ipcMain.handle('preview:set-comment-mode', (_e, mode: 'comment' | 'annotate' | null) => {
    commentModeActive = mode
    if (mode) selectModeActive = false // mutually exclusive with select
    previewView?.webContents.send(PREVIEW_SET_COMMENT_MODE, mode)
  })
  // Preview echoes keyboard-initiated mode changes → renderer (toolbar mirror).
  ipcMain.on(PREVIEW_COMMENT_MODE, (e, mode: 'comment' | 'annotate' | null) => {
    if (e.sender !== previewView?.webContents) return
    commentModeActive = mode
    mainWindow?.webContents.send('preview:comment-mode', mode)
  })
  // A submitted comment/annotation (element + text) → renderer (agent vs pin).
  ipcMain.on(
    PREVIEW_COMMENT,
    (e, payload: { kind: 'comment' | 'annotate'; el: SelectedElement; text: string }) => {
      if (e.sender !== previewView?.webContents) return
      mainWindow?.webContents.send('preview:comment', payload)
    }
  )

  ipcMain.handle('project:pick', async (): Promise<string | null> => {
    if (!mainWindow) return null
    const res = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Open a project'
    })
    return res.canceled ? null : (res.filePaths[0] ?? null)
  })

  // New project: a save dialog picks the folder-to-create, then the scaffold
  // writes a minimal Vite+React app, git-inits it, and installs dependencies.
  ipcMain.handle('project:pick-new', async (): Promise<string | null> => {
    if (!mainWindow) return null
    const res = await dialog.showSaveDialog(mainWindow, {
      title: 'New project',
      buttonLabel: 'Create',
      nameFieldLabel: 'Project name',
      defaultPath: 'my-app',
      properties: ['createDirectory', 'showOverwriteConfirmation']
    })
    return res.canceled ? null : (res.filePath ?? null)
  })
  ipcMain.handle('project:create', (_e, root: string) => createProject(root))
}

// Dev-mode CDP endpoint: run `bun run dev`, then open chrome://inspect in a real
// Chrome browser to attach full DevTools to the chat window and the native preview
// WebContentsView (each shows up as its own target). Gated on the same electron-vite
// dev signal used in createWindow (loadURL vs loadFile), so a built/packaged app
// never opens the port.
if (process.env['ELECTRON_RENDERER_URL']) {
  app.commandLine.appendSwitch('remote-debugging-port', process.env['DSGN_DEBUG_PORT'] ?? '9222')
}

app.whenReady().then(() => {
  // macOS dock icon comes from the bundle's .icns (scripts/patch-electron.mjs
  // installs ours into the dev Electron.app). Do NOT app.dock.setIcon() here:
  // runtime dock images skip the system's icon treatment on macOS 26, so they
  // render oversized next to other dock icons.
  createWindow()
  buildAppMenu()
  // File → Open Recent is driven by the renderer's recents store: it pushes the
  // current list, we cap at 8 and rebuild the menu.
  ipcMain.on('menu:set-recents', (_e, recents: RecentMenuEntry[]) => {
    recentProjects = Array.isArray(recents)
      ? recents
          .filter((r) => r && typeof r.root === 'string' && typeof r.name === 'string')
          .slice(0, 8)
      : []
    buildAppMenu()
  })
  registerPreviewIpc()
  registerDevServerIpc(() => mainWindow)
  registerSimulatorIpc(() => mainWindow)
  registerAgentIpc(() => mainWindow)
  registerPropsIpc()
  registerAnnotationsIpc()
  registerTokensIpc()
  registerSetupIpc()
  ipcMain.handle('git:ensure', (_e, root: string) => ensureBranch(root))
  ipcMain.handle('git:set', (_e, root: string, name: string) => switchBranch(root, name))
  ipcMain.handle('git:list', (_e, root: string) => listBranches(root))
  ipcMain.handle('git:checkout', (_e, root: string, branch: string) => checkoutBranch(root, branch))
  registerDiagnoseIpc()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
