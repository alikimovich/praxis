import { randomBytes, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { extname, join, resolve, sep } from 'node:path'
import { projectHasRunningAgents, registerAgentIpc } from '../main/agent'
import { registerAnnotationsIpc } from '../main/annotations'
import { registerContentControlsIpc } from '../main/content-controls-ipc'
import { registerControlsIpc } from '../main/control-panels'
import { registerDevServerIpc } from '../main/devserver'
import { registerDiagnoseIpc } from '../main/diagnose'
import { registerFeedbackIpc } from '../main/feedback'
import { createProjectFile, deleteProjectFile, renameProjectFile } from '../main/file-ops'
import { listProjectFiles } from '../main/file-tree'
import { checkoutBranch, ensureBranch, listBranches, switchBranch } from '../main/git'
import { registerGitRemoteIpc } from '../main/git-remote'
import { registerGithubIpc } from '../main/github'
import { registerMediaProtocol } from '../main/media'
import { type PreviewState, registerPreviewIpc } from '../main/preview-ipc'
import { readProjectIcon } from '../main/project-icon'
import { registerPropsIpc } from '../main/props'
import { createProject } from '../main/scaffold'
import { registerSetupIpc } from '../main/setup'
import { registerSimulatorIpc } from '../main/simulator'
import { registerStylesIpc } from '../main/styles'
import { registerTokensIpc } from '../main/tokens'
import * as channels from '../shared/preview-channels'
import { NativeBridge, setBridge } from './bridge'
import { app, dispatchIPC, ipcMain, NativeView, protocolHandlers, shell, views, serviceEvents } from './platform'
import { runNativeSmoke } from './smoke'
import { installShutdown } from './shutdown'
import { parsePreferredModelState, resolvePreferredSettings } from '../shared/preferred-model'
import { nativePreferences } from './preferences'
import { workspaceStorage } from './workspace'
import { installNativeChat } from './chat-runtime'
import { NativeSupportSheets } from './support-sheets'
import { NativeGitController } from './git-controller'
import { environmentChanges } from '../shared/environment-changes'
import type { NativeShellState } from '../shared/native-shell'
import { NativeContextController } from './context-controller'
import { NativeReviewController } from './review-controller'
import { NativeActivityController } from './activity-controller'
import { NativeSettingsController } from './settings-controller'
import { NativeSheetController } from './sheets-runtime'
import { installNativeWorkspace, workspaceOwnsAction } from './workspace-runtime'

async function main() {
  const testing = process.argv.includes('--test')
  const testDir = testing ? mkdtempSync(join(tmpdir(), 'praxis-native-')) : null
  if (testDir) process.env.PRAXIS_USER_DATA = join(testDir, 'profile')
  const profile = app.getPath('userData')
  mkdirSync(profile, { recursive: true })
  const lock = join(profile, 'native.lock')
  if (existsSync(lock)) {
    const pid = Number(readFileSync(lock, 'utf8'))
    let running = true
    try {
      process.kill(pid, 0)
    } catch (error: any) {
      running = error.code !== 'ESRCH'
    }
    if (running)
      throw new Error('Praxis Native is already using this profile. Close that instance first.')
    rmSync(lock)
  }
  writeFileSync(lock, String(process.pid), { flag: 'wx' })
  const projectIndex = process.argv.indexOf('--project')
  const requestedProject = projectIndex >= 0 ? process.argv[projectIndex + 1] : null
  if (projectIndex >= 0 && !requestedProject) throw new Error('--project requires a folder')
  const fixture = testDir ? join(testDir, 'project') : null
  if (fixture) {
    mkdirSync(fixture)
    writeFileSync(join(fixture, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="red"/></svg>')
    writeFileSync(
      join(fixture, 'index.html'),
      '<!doctype html>\n<html><body>\n<h1 id="native-title" data-praxis-source="index.html:3:1">Native Praxis fixture</h1>\n<p>Bun owns this server.</p><script>window.previewInputs=[];for(const type of ["keydown","keyup","keypress","pointerdown","mousedown","click","dblclick","wheel","input"])window.addEventListener(type,event=>window.previewInputs.push(event.type),true)</script></body></html>'
    )
  }
  let pickedRoot = fixture || (requestedProject ? resolve(requestedProject) : null)
  const root = resolve(__dirname, '../..')
  const rendererDir = join(__dirname, 'renderer')
  const secret = randomBytes(24).toString('hex')
  const mime: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.woff2': 'font/woff2'
  }
  const server = createServer((request, response) => {
    try {
      const path = decodeURIComponent(new URL(request.url || '/', 'http://localhost').pathname)
      if (!path.startsWith(`/${secret}/`)) {
        response.writeHead(404).end()
        return
      }
      const file = resolve(rendererDir, path.slice(secret.length + 2))
      if (!file.startsWith(rendererDir + sep)) {
        response.writeHead(404).end()
        return
      }
      const body = readFileSync(file)
      response.writeHead(200, {
        'content-type': mime[extname(file)] || 'application/octet-stream',
        'cache-control': 'no-store'
      })
      response.end(body)
    } catch {
      response.writeHead(404).end()
    }
  })
  let host: NativeBridge | undefined
  let cleaned = false
  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    app.emit('before-quit')
    server.closeAllConnections()
    server.close()
    host?.send('quit')
    rmSync(lock, { force: true })
    // Profiles are deliberately distinct from Electron until migrations and
    // cross-runtime locking are implemented. Test profiles are disposable.
    if (testDir) setTimeout(() => rmSync(testDir, { recursive: true, force: true }), 500).unref()
  }
  installShutdown(cleanup)
  await new Promise<void>((resolveListen, reject) => {
    server.once('error', reject)
    server.listen(
      testing ? 0 : Number(process.env.PRAXIS_NATIVE_PORT || 4188),
      '127.0.0.1',
      resolveListen
    )
  })
  const address = server.address() as { port: number }
  const url = `http://127.0.0.1:${address.port}/${secret}/index.html`
  const executable = join(__dirname, 'Praxis Native.app/Contents/MacOS/PraxisHost')
  process.env.PRAXIS_NATIVE_HOST = executable
  host = new NativeBridge(executable, __dirname, testing ? 'ephemeral' : 'persistent')
  setBridge(host)
  const mainView = new NativeView('main')
  const workspace = workspaceStorage(profile)
  const preferences = nativePreferences(profile)
  const refreshPreferences = () => {
    const values = preferences.snapshot()
    let preferred: unknown
    try { preferred = JSON.parse(values['praxis:preferred-model'] ?? 'null') } catch {}
    workspaceController.preferred = resolvePreferredSettings(parsePreferredModelState(preferred))
    for (const chat of chatController.chats.values()) if (chat.context) chat.context.turn = {
      ...chat.context.turn, projectUi: values['praxis:project-ui:v1'] === 'true',
      projectUiEngine: values['praxis:project-ui-engine:v1'] === 'jev' ? 'jev' : 'agent'
    }
    host!.send('preferences', { values })
    for (const [name, view] of views) if (name !== 'preview') view.webContents.send('native-preferences:changed', values)
  }
  ipcMain.on('native-preferences:set', (event, key, value, imported) => {
    if (event.sender === views.get('preview')?.webContents) return
    try { preferences.set(key, value, imported === true); refreshPreferences() }
    catch (error) { console.error('Native preference write failed:', error) }
  })
  ipcMain.handle('native-workspace:read', event => {
    if (event.sender !== mainView.webContents) throw new Error('Workspace is main-view only')
    return workspace.read()
  })
  ipcMain.on('native-workspace:write', (event, raw) => {
    // Native workspace commands own persistence. Legacy panel metadata is mirrored below.
    if (event.sender === mainView.webContents) {
      const incoming = JSON.parse(raw)
      for (const patch of incoming.projects ?? []) {
        const entry = workspaceController.state.projects.find(p => p.key === patch.key)
        if (entry) for (const field of ['viewport', 'chatSettings'] as const) {
          if (patch[field] !== undefined) (entry as any)[field] = patch[field]
        }
      }
      workspace.write(JSON.stringify({ projects: workspaceController.state.projects, activeKey: workspaceController.state.activeKey, recents: workspaceController.state.recents }))
    }
  })
  const previewView = new NativeView('preview')
  let panelView: NativeView | undefined
  const ensurePanelView = () => {
    if (!panelView) {
      host!.send('createPanel')
      panelView = new NativeView('panel')
      panelView.webContents.loadURL(`${url}?praxisPanel=1`)
    }
    return panelView
  }
  const window = mainView as unknown as Electron.BrowserWindow
  const send = (channel: string, ...args: unknown[]) => mainView.webContents.send(channel, ...args)
  const state: PreviewState = {
    url: null,
    retries: 0,
    bounds: { x: 0, y: 0, width: 0, height: 0, radius: 0 },
    hiddenByRenderer: false,
    selectMode: false,
    commentMode: null,
    frameMode: false,
    layersWatch: false,
    statusText: null,
    pins: []
  }
  registerPreviewIpc({
    state,
    ensurePreviewView: () => previewView as any,
    getPreviewView: () => previewView as any,
    ensurePanelView: () => ensurePanelView() as any,
    getPanelView: () => panelView as any,
    getMainWindow: () => window,
    sendToMain: send,
    placeholderUrl: 'about:blank',
    isLocalPreviewUrl: (raw) => {
      try {
        const u = new URL(raw)
        return (
          ['http:', 'https:'].includes(u.protocol) &&
          ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) &&
          u.origin !== new URL(url).origin
        )
      } catch {
        return false
      }
    }
  })
  registerDevServerIpc(() => window)
  registerAgentIpc(() => window)
  registerPropsIpc()
  registerStylesIpc()
  registerControlsIpc()
  registerContentControlsIpc(ipcMain)
  registerAnnotationsIpc()
  registerGithubIpc()
  registerTokensIpc()
  registerSetupIpc()
  registerDiagnoseIpc()
  registerSimulatorIpc(() => window)
  registerFeedbackIpc(() => window)
  registerGitRemoteIpc(ipcMain, projectHasRunningAgents)
  registerMediaProtocol()
  ipcMain.handle('project:pick', () => {
    if (pickedRoot) {
      const first = pickedRoot
      if (!testing) pickedRoot = null
      return first
    }
    return host!.request('pick', {}, 0x7fffffff)
  })
  ipcMain.handle('project:pick-new', () => host!.request('pickNew', {}, 0x7fffffff))
  ipcMain.handle('project:create', (_e, path, options) => createProject(path, options))
  ipcMain.handle('project:icon', (_e, path) => readProjectIcon(path))
  ipcMain.handle('git:ensure', (_e, path) => ensureBranch(path))
  ipcMain.handle('git:set', (_e, path, name) => switchBranch(path, name))
  ipcMain.handle('git:list', (_e, path) => listBranches(path))
  ipcMain.handle('git:checkout', (_e, path, name) => checkoutBranch(path, name))
  ipcMain.handle('source:tree', (_e, path) => listProjectFiles(path))
  ipcMain.handle('source:create-file', (_e, path, file) => createProjectFile(path, file))
  ipcMain.handle('source:rename-file', (_e, path, from, to) => renameProjectFile(path, from, to))
  ipcMain.handle('source:delete-file', (_e, path, file) =>
    deleteProjectFile(path, file, shell.trashItem)
  )
  ipcMain.handle('source:popout', async (_e, project, source) => {
    const view = new NativeView(`editor-${randomUUID()}`)
    await host!.request('editor', { view: view.id })
    view.webContents.loadURL(
      `${url}?${new URLSearchParams({ praxisEditor: '1', root: project, source })}`
    )
  })
  ipcMain.handle('source:close-window', (event) => {
    const view = [...views.values()].find((view) => view.webContents === event.sender)
    if (view?.id.startsWith('editor-')) host!.send('closeEditor', { view: view.id })
  })
  ipcMain.handle('window:is-fullscreen', () => host!.request('fullscreen'))
  ipcMain.on('menu:native-edit', (_e, action) => host!.send('nativeEdit', { action }))
  ipcMain.on('menu:set-recents', (_e, recents) => host!.send('recents', { recents }))
  ipcMain.handle('update:check', () => ({ status: 'idle', behind: 0 }))
  ipcMain.handle('update:apply', () => {
    throw new Error('Restart bun run dev:native after updating the checkout.')
  })
  host.on('ipc', async ({ view, message }) => {
    try {
      const value = await dispatchIPC(view, message)
      if (message.type === 'invoke')
        host!.send('deliver', {
          view,
          message: {
            type: 'reply',
            id: message.id,
            document: message.document,
            value: value ?? null
          }
        })
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error)
      if (message?.type === 'invoke')
        host!.send('deliver', {
          view,
          message: { type: 'reply', id: message.id, document: message.document, error: text }
        })
      else console.error(`Native ${view} IPC rejected: ${text}`)
    }
  })
  host.on('media', async ({ task, url, headers }) => {
    try {
      const handler = protocolHandlers.get('praxis-media')!
      const response = await handler(new Request(url, { headers }))
      host!.send('mediaReply', {
        task,
        status: response.status,
        headers: Object.fromEntries(response.headers),
        data: Buffer.from(await response.arrayBuffer()).toString('base64')
      })
    } catch {
      host!.send('mediaReply', { task, status: 404, data: '' })
    }
  })
  host.on('menu', ({ action }) => { if (!['open-project', 'new-project', 'settings', 'logs', 'feedback', 'diagnose'].includes(action)) send('menu:action', action) })
  let lastShellState: NativeShellState | null = null
  const renderShell = () => { if (lastShellState) host!.send('shellState', { state: gitController.decorate(lastShellState) }) }
  ipcMain.on('native-shell:state', (event, state) => {
    if (event.sender === mainView.webContents) { lastShellState = state; renderShell() }
  })
  host.on('shell-action', action => { if (!workspaceOwnsAction(action) && !['memory', 'branch', 'new-branch', 'git-updates', 'publish', 'publish-mode'].includes(action.action) && !(action.action === 'select' && action.id?.startsWith('history:'))) send('native-shell:action', action) })
  const activityController = new NativeActivityController((method, data) => host!.send(method, data))
  host.on('activity-action', ({ action }) => activityController.action(action))
  host.on('menu', ({ action }) => { if (action === 'logs') activityController.action('toggle') })
  serviceEvents.on('event', (channel, line) => { if (channel === 'devserver:log' || channel === 'simulator:log') activityController.append(line, 'server') })
  ipcMain.on('native-activity:command', (event, command) => {
    if (event.sender !== mainView.webContents) return
    if (command?.action === 'append') activityController.append(command.text, command.kind)
    else activityController.action(command?.action)
  })
  const chatController = installNativeChat(host!, mainView)
  const workspaceController = installNativeWorkspace(host!, mainView, workspace, chatController, preferences)
  const contextController = new NativeContextController(workspaceController, chatController, () => ({ projectUi: preferences.get('praxis:project-ui:v1') === 'true', projectUiEngine: preferences.get('praxis:project-ui-engine:v1') === 'jev' ? 'jev' : 'agent' }))
  workspaceController.services.activate = entry => contextController.activate(entry)
  const projectEffect = chatController.services.effect
  chatController.services.effect = effect => {
    void contextController.effect(effect).catch(error => workspaceController.reportError(error))
    projectEffect(effect)
  }
  serviceEvents.on('event', (channel, value) => {
    if (channel === 'preview:element-picked') contextController.selection(value)
    else if (channel === 'preview:readiness') contextController.readiness(value)
    else if (channel === 'agent:event') {
      const files = value.type === 'isolation' && value.state === 'merged' ? value.files : value.type === 'spawn-finished' && value.outcome === 'applied' ? value.files : undefined
      const entry = workspaceController.state.projects.find(p => p.key === value.projectKey || p.sessionKeys.includes(value.projectKey))
      if (files && entry && (environmentChanges(files).restart || !entry.url)) void workspaceController.refreshEnvironment(entry.key, files).catch(error => activityController.append(String(error), 'error'))
    }
  })
  serviceEvents.on('command', (channel, args, result) => {
    if (channel === 'agent:spawn-comment' && result?.ok) contextController.queued(args[2], result.spawnId, args[1].slice(0, 70), !!result.queued)
    if (channel === 'annotations:add' || channel === 'annotations:remove') void contextController.notes(args[0]).catch(error => workspaceController.reportError(error))
    if (channel === 'agent:close-project') contextController.projects.delete(args[0])
  })
  ipcMain.on('native-context:selection', (event, value) => { if (event.sender === mainView.webContents) contextController.selection(value) })
  const sheetController = new NativeSheetController(host!, workspaceController, chatController)
  const gitController = new NativeGitController(sheetController, activityController, preferences, renderShell)
  const activateContext = workspaceController.services.activate
  workspaceController.services.activate = async entry => { await activateContext(entry); if (entry) void gitController.refresh(entry.root).catch(error => activityController.append(String(error), 'error')) }
  host.on('shell-action', action => {
    const key = action.project ?? workspaceController.state.activeKey
    if (action.action === 'publish-mode') { gitController.setMode(action.value); refreshPreferences(); return }
    if (!key) return
    const operation = action.action === 'branch' ? gitController.branch(key, action.value ?? '') : action.action === 'new-branch' ? gitController.branch(key, action.value ?? '', true) : action.action === 'publish' ? gitController.publish(key) : action.action === 'git-updates' ? gitController.updates(key) : null
    void operation?.catch(error => activityController.append(String(error), 'error'))
  })
  ipcMain.on('native-git:action', (event, action) => {
    if (event.sender !== mainView.webContents) return
    if (action.action === 'connect' && workspaceController.state.activeKey) void gitController.connect(workspaceController.state.activeKey).catch(error => activityController.append(String(error), 'error'))
    else if (['publish', 'branch', 'new-branch', 'git-updates'].includes(action.action)) host!.emit('shell-action', action)
  })
  const supportSheets = new NativeSupportSheets(sheetController, () => host!.request('captureFeedback'), url => shell.openExternal(url))
  const reviewController = new NativeReviewController(sheetController, url => shell.openExternal(url))
  const settingsController = new NativeSettingsController(sheetController, preferences, refreshPreferences)
  host.on('sheet-action', action => { void sheetController.action(action) })
  const openSheet = (kind: string, key?: string) => {
    if (sheetController.current?.state.busy) return
    if (kind === 'settings') void settingsController.open().catch(error => workspaceController.reportError(error))
    else if (kind === 'feedback') void supportSheets.feedback().catch(error => activityController.append(String(error), 'error'))
    else if (kind === 'diagnose' && workspaceController.state.activeKey) supportSheets.diagnose(workspaceController.state.activeKey)
    else if (kind === 'review' && key) void reviewController.open(key).catch(error => workspaceController.reportError(error))
    else if (kind === 'new-project') sheetController.newProject()
    else if (kind === 'memory' && key) void sheetController.memory(key).catch(error => workspaceController.reportError(error))
  }
  host.on('menu', ({ action }) => { if (['new-project', 'settings', 'feedback', 'diagnose'].includes(action)) openSheet(action) })
  host.on('shell-action', action => { if (action.action === 'select' && action.id?.startsWith('history:')) openSheet('review', action.id.slice(8)); if (action.action === 'memory') openSheet('memory', action.project ?? workspaceController.state.activeKey ?? undefined) })
  ipcMain.on('native-sheet:open', (event, kind, key) => { if (event.sender === mainView.webContents) openSheet(kind, key) })

  ipcMain.on('native-composer:focus', event => {
    if (event.sender === mainView.webContents) host!.send('composerFocus')
  })

  host.on('view-closed', ({ view }) => {
    const v = views.get(view)
    if (v) v.destroyed = true
    views.delete(view)
  })
  host.on('url', ({ view, url }) => {
    const current = views.get(view)
    if (current) current.url = url
    if (view === 'preview' && /^https?:/.test(url)) send('preview:url-changed', url)
  })
  host.on('fullscreen', ({ value }) => send('window:fullscreen', value))
  host.on('external', ({ url }) => {
    void shell.openExternal(url).catch(console.error)
  })
  host.on('load-error', (message) => console.error('Native navigation:', message.message))
  host.on('loaded', ({ view, url }) => {
    const current = views.get(view)
    if (current) current.url = url
    if (view !== 'preview') return
    previewView.webContents.send(channels.PREVIEW_SET_MODE, state.selectMode)
    previewView.webContents.send(channels.PREVIEW_SET_COMMENT_MODE, state.commentMode)
    previewView.webContents.send(channels.PREVIEW_SET_FRAME, state.frameMode)
    previewView.webContents.send(channels.PREVIEW_SET_PINS, state.pins)
    previewView.webContents.send(channels.PREVIEW_SET_STATUS, state.statusText)
    previewView.webContents.send(channels.LAYERS_SET_WATCH, state.layersWatch)
    if (url !== 'about:blank') send('preview:url-changed', url)
  })
  host.on('closed', () => {
    cleanup()
    if (!testing) process.exit(0)
  })
  host.on('host-error', (error) => {
    console.error(error)
    cleanup()
    process.exit(1)
  })
  host.once('ready', async () => {
    host!.send('preferences', { values: preferences.snapshot() })
    mainView.webContents.loadURL(`${url}?praxisSkipIntro=1`)
    console.log('Praxis Native is running on Bun + system WebKit. Electron is not loaded.')
    if (testing) {
      try {
        await runNativeSmoke(host!, fixture!, root)
        cleanup()
        process.exitCode = 0
      } catch (error) {
        console.error(error)
        try {
          writeFileSync(join(root, 'test/artifacts/native/failure.png'), Buffer.from(await host!.request('captureShell'), 'base64'))
          console.error('Native chat state:', await host!.request('chatInspect'))
          console.error('Native geometry:', await host!.request('evaluate', { view: 'main', code: `({native:!!window.praxisNativeChat, placeholder:document.querySelector('.native-chat-surface')?.getBoundingClientRect().toJSON(), chat:document.querySelector('.chat')?.outerHTML.slice(0,500), visibility:document.visibilityState})` }))
        } catch { /* preserve original failure */ }
        cleanup()
        process.exitCode = 1
      } finally {
        setTimeout(() => process.exit(process.exitCode || 0), 1000)
      }
    }
  })
}
main().catch((error) => {
  console.error(error)
  process.exit(1)
})
