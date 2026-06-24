import { app, BrowserWindow, WebContentsView, ipcMain, dialog, shell } from 'electron'
import { join } from 'path'
import type { SelectedElement } from '../shared/api'
import { registerDevServerIpc } from './devserver'
import { registerAgentIpc } from './agent'
import { registerPropsIpc } from './props'

let mainWindow: BrowserWindow | null = null
let previewView: WebContentsView | null = null
let previewUrl: string | null = null
let previewRetries = 0
// v2 select mode: tracked here so it survives preview navigations (the injected
// preload re-runs fresh on each load and must be re-armed).
let selectModeActive = false

// Channels mirrored in src/preview/preload.ts (the injected preview preload).
const PREVIEW_SET_MODE = 'dsgn:preview:set-select-mode'
const PREVIEW_PICKED = 'dsgn:preview:element-picked'
const PREVIEW_CANCELLED = 'dsgn:preview:select-cancelled'

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

  // The previewed app is untrusted-ish: keep it on its own local origin.
  wc.setWindowOpenHandler(({ url }) => {
    if (!isLocalPreviewUrl(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  wc.on('will-navigate', (e, url) => {
    if (url.startsWith('data:') || isLocalPreviewUrl(url)) return
    e.preventDefault()
    shell.openExternal(url)
  })

  // Retry transient failures (dev server up but not serving yet).
  wc.on('did-fail-load', (_e, errorCode, _desc, validatedURL, isMainFrame) => {
    if (!isMainFrame || !previewUrl || validatedURL !== previewUrl) return
    if (!TRANSIENT_LOAD_ERRORS.has(errorCode) || previewRetries >= 40) return
    previewRetries++
    setTimeout(() => previewUrl && previewView?.webContents.loadURL(previewUrl), 400)
  })

  // Once the intended URL loads, reset the budget so it's per-outage not per-session.
  // The preload re-ran on this fresh page, so re-arm select mode if it was on —
  // but only on the real preview page, never the "no project" placeholder.
  wc.on('did-finish-load', () => {
    if (previewUrl && wc.getURL() === previewUrl) {
      previewRetries = 0
      if (selectModeActive) wc.send(PREVIEW_SET_MODE, true)
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
  // Renderer reports where the preview rectangle is, in CSS pixels (== DIP).
  ipcMain.on('preview:set-bounds', (_e, bounds: { x: number; y: number; width: number; height: number }) => {
    const view = ensurePreviewView()
    view.setBounds({
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.round(bounds.width),
      height: Math.round(bounds.height)
    })
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
    // No app to select in on the placeholder — keep main's flag honest so it
    // doesn't silently re-arm the overlay on a later load. (Renderer disarms too.)
    selectModeActive = false
    ensurePreviewView().webContents.loadURL(PLACEHOLDER_HTML)
  })

  // Hide the native view during a split-drag so the renderer keeps mouse events.
  ipcMain.on('preview:set-dragging', (_e, active: boolean) => {
    previewView?.setVisible(!active)
  })

  // v2 select mode: renderer → preview (arm/disarm the overlay).
  ipcMain.handle('preview:set-select-mode', (_e, active: boolean) => {
    selectModeActive = active
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
  registerPreviewIpc()
  registerDevServerIpc(() => mainWindow)
  registerAgentIpc(() => mainWindow)
  registerPropsIpc()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
