import { app, BrowserWindow, WebContentsView, ipcMain, dialog, shell } from 'electron'
import { join } from 'path'
import { registerDevServerIpc } from './devserver'
import { registerAgentIpc } from './agent'

let mainWindow: BrowserWindow | null = null
let previewView: WebContentsView | null = null
let previewUrl: string | null = null
let previewRetries = 0

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
function ensurePreviewView(): WebContentsView {
  if (previewView) return previewView
  previewView = new WebContentsView()
  previewView.setBackgroundColor('#ffffff')
  previewView.webContents.loadURL(PLACEHOLDER_HTML)
  mainWindow?.contentView.addChildView(previewView)

  // Retry transient failures (dev server up but not serving yet).
  previewView.webContents.on('did-fail-load', (_e, errorCode, _desc, validatedURL, isMainFrame) => {
    if (!isMainFrame || !previewUrl || validatedURL !== previewUrl) return
    if (!TRANSIENT_LOAD_ERRORS.has(errorCode) || previewRetries >= 40) return
    previewRetries++
    setTimeout(() => previewUrl && previewView?.webContents.loadURL(previewUrl), 400)
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
      sandbox: false
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
    previewUrl = url
    previewRetries = 0
    ensurePreviewView().webContents.loadURL(url)
  })

  ipcMain.handle('preview:reset', () => {
    previewUrl = null
    previewRetries = 0
    ensurePreviewView().webContents.loadURL(PLACEHOLDER_HTML)
  })

  // Hide the native view during a split-drag so the renderer keeps mouse events.
  ipcMain.on('preview:set-dragging', (_e, active: boolean) => {
    previewView?.setVisible(!active)
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

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
