import {
  app,
  BrowserWindow,
  WebContentsView,
  Menu,
  ipcMain,
  dialog,
  shell,
  type MenuItemConstructorOptions
} from 'electron'
import { join } from 'path'
import type { SelectedElement } from '../shared/api'
import { registerDevServerIpc } from './devserver'
import { registerSimulatorIpc } from './simulator'
import { registerAgentIpc } from './agent'
import { registerPropsIpc } from './props'
import { registerAnnotationsIpc } from './annotations'
import { registerTokensIpc } from './tokens'
import { registerSetupIpc } from './setup'
import { ensureBranch, switchBranch, listBranches, checkoutBranch } from './git'
import { registerDiagnoseIpc } from './diagnose'

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

// Latest annotation pins, re-pushed to the preview after each navigation.
let annotationPins: { id: string; selector: string }[] = []
// Right-edge inset reserved for the floating prop panel (renderer-reported).
let panelInset = 0

// Chromium error codes worth retrying — the dev server is up but not yet serving.
const TRANSIENT_LOAD_ERRORS = new Set([-324, -102, -101, -105, -106, -109])

const PLACEHOLDER_HTML = `data:text/html;charset=utf-8,${encodeURIComponent(`
  <html>
    <body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;
                 font-family:-apple-system,system-ui,sans-serif;color:#8a8a8a;background:#fafafa;">
      <div style="text-align:center">
        <div style="font-size:15px;font-weight:600;color:#555">No project open</div>
        <div style="font-size:13px;margin-top:6px">Open a folder to launch its dev server here.</div>
      </div>
    </body>
  </html>
`)}`

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
/**
 * Native app menu. An "Actions" menu replaces the titlebar Reload/Stop buttons
 * (and adds Select / Open Project / Viewport) with real accelerators. Because we
 * set our OWN menu, the default View → Reload (which reloaded the renderer and
 * stranded the tool) is gone; our Cmd+R reloads the PREVIEW instead. Renderer-side
 * actions go over `menu:action`; reload is handled here directly.
 */
function buildAppMenu(): void {
  const send = (action: string): void => mainWindow?.webContents.send('menu:action', action)
  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' as const }] : []),
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
        { label: 'Open Project…', accelerator: 'CmdOrCtrl+N', click: () => send('open-project') },
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
  previewView.setBackgroundColor('#ffffff')
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

  // Retry transient failures (dev server up but not serving yet).
  wc.on('did-fail-load', (_e, errorCode, _desc, validatedURL, isMainFrame) => {
    if (!isMainFrame || !previewUrl || !sameUrl(validatedURL, previewUrl)) return
    if (!TRANSIENT_LOAD_ERRORS.has(errorCode) || previewRetries >= 40) return
    previewRetries++
    setTimeout(() => previewUrl && previewView?.webContents.loadURL(previewUrl), 400)
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
      wc.send(PREVIEW_SET_PINS, annotationPins)
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
    backgroundColor: '#ffffff',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

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
  // Apply the renderer's slot rect minus the right-edge panel inset, so the
  // floating prop panel sits in renderer DOM not covered by the native view.
  const applyBounds = (): void => {
    const view = ensurePreviewView()
    view.setBounds({
      x: Math.round(lastBounds.x),
      y: Math.round(lastBounds.y),
      width: Math.max(0, Math.round(lastBounds.width - panelInset)),
      height: Math.round(lastBounds.height)
    })
    // Round the native view's corners to fit the iPhone screen in mobile viewport.
    view.setBorderRadius(Math.round(lastBounds.radius || 0))
  }

  // Renderer reports where the preview rectangle is, in CSS pixels (== DIP).
  ipcMain.on(
    'preview:set-bounds',
    (_e, bounds: { x: number; y: number; width: number; height: number; radius?: number }) => {
      lastBounds = { ...bounds, radius: bounds.radius ?? 0 }
      applyBounds()
  })

  // The floating prop panel reserves a strip on the preview's right edge.
  ipcMain.on('preview:set-panel-inset', (_e, inset: number) => {
    panelInset = Math.max(0, inset || 0)
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
    ensurePreviewView().webContents.loadURL(url)
  })

  ipcMain.handle('preview:reset', () => {
    previewUrl = null
    previewRetries = 0
    // No app to select in on the placeholder — keep main's flags honest so they
    // don't silently re-arm the overlay on a later load. (Renderer disarms too.)
    selectModeActive = false
    commentModeActive = null
    ensurePreviewView().webContents.loadURL(PLACEHOLDER_HTML)
  })

  // Hide the native view during a split-drag so the renderer keeps mouse events.
  ipcMain.on('preview:set-dragging', (_e, active: boolean) => {
    previewView?.setVisible(!active)
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
}

app.whenReady().then(() => {
  createWindow()
  buildAppMenu()
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
