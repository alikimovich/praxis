import { spawn } from 'node:child_process'
import { NativeUpdateController } from './update-controller'
import { installNativeInspector } from './inspector-runtime'
import { NativePreviewRecovery } from './preview-recovery'
import { NativeLayersController } from './layers-controller'
import { agentOptionsFor } from '../shared/chat-settings'
import { NativeEditorController } from './editor-controller'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
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
import { nativeMediaPath, registerMediaProtocol } from '../main/media'
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
import { runNativeCoreSmoke } from './smoke-core'
import { installShutdown } from './shutdown'
import { parsePreferredModelState, resolvePreferredSettings } from '../shared/preferred-model'
import { nativePreferences } from './preferences'
import { workspaceStorage } from './workspace'
import { installNativeChat } from './chat-runtime'
import { NativeShellController } from './shell-controller'
import { NativeSupportSheets } from './support-sheets'
import { NativeGitController } from './git-controller'
import { environmentChanges } from '../shared/environment-changes'
import { NativeContextController } from './context-controller'
import { NativeReviewController } from './review-controller'
import { NativeActivityController } from './activity-controller'
import { NativeSettingsController } from './settings-controller'
import { NativeSheetController } from './sheets-runtime'
import { installNativeWorkspace } from './workspace-runtime'

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
  let host: NativeBridge | undefined
  let cleaned = false
  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    app.emit('before-quit')
    host?.send('quit')
    rmSync(lock, { force: true })
    // Keep the native profile separate from retired Electron installations.
    // Test profiles are disposable.
    if (testDir) setTimeout(() => rmSync(testDir, { recursive: true, force: true }), 500).unref()
  }
  installShutdown(cleanup)
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
    host!.send('layoutWidth', { width: Number(values['praxis:native-chat-width']) || 440 })
  }
  const previewView = new NativeView('preview')
  const window = mainView
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
    ensurePreviewView: () => previewView,
    getPreviewView: () => previewView,
    getMainWindow: () => window,
    sendToMain: send,
    placeholderUrl: 'about:blank',
    isLocalPreviewUrl: (raw) => {
      try {
        const u = new URL(raw)
        return (
          ['http:', 'https:'].includes(u.protocol) &&
          ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)
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
  ipcMain.handle('window:is-fullscreen', () => host!.request('fullscreen'))
  ipcMain.on('menu:native-edit', (_e, action) => host!.send('nativeEdit', { action }))
  ipcMain.on('menu:set-recents', (_e, recents) => host!.send('recents', { recents }))
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

  let shellController: NativeShellController | undefined
  const renderShell = () => shellController?.render()
  const activityController = new NativeActivityController((method, data) => host!.send(method, data))
  host.on('activity-action', ({ action }) => activityController.action(action))
  host.on('menu', ({ action }) => { if (action === 'logs') activityController.action('toggle') })
  serviceEvents.on('event', (channel, line) => { if (channel === 'devserver:log' || channel === 'simulator:log') activityController.append(line, 'server') })
  host.on('native-layout-width', ({ width }) => {
    if (!Number.isFinite(width) || width < 320 || width > 760) return
    preferences.set('praxis:native-chat-width', String(width))
  })
  host.on('native-layout-sizes', sizes => { if (['source','layers','inspector'].every(key => Number.isFinite(sizes[key]))) preferences.set('praxis:native-panel-sizes', JSON.stringify({ source:sizes.source, layers:sizes.layers, inspector:sizes.inspector })) })
  host.on('native-layout-frame', ({ frame }) => {
    void dispatchIPC('main', { type: 'send', channel: 'preview:set-bounds', args: [frame] })
  })
  const chatController = installNativeChat(host!, mainView)
  const workspaceController = installNativeWorkspace(host!, mainView, workspace, chatController, preferences)
  const contextController = new NativeContextController(workspaceController, chatController, () => ({ projectUi: preferences.get('praxis:project-ui:v1') === 'true', projectUiEngine: preferences.get('praxis:project-ui-engine:v1') === 'jev' ? 'jev' : 'agent' }), (channel, ...args) => dispatchIPC('main', { type: 'send', channel, args }))
  const visualEdit = async (root: string, prompt: string) => {
    const entry = workspaceController.state.projects.find(p => p.root === root)
    if (!entry || !prompt.trim()) return
    const chat = chatController.chats.get(entry.activeSessionKey)
    const result = await workspaceController.services.invoke('agent:spawn-comment', root, prompt, entry.activeSessionKey, chat ? agentOptionsFor(chat.settings) : {}, 'text-edit').catch(() => null)
    if (!result?.ok) { await chatController.command({ type: 'seed', chat: entry.activeSessionKey, text: prompt }); activityController.append('Could not start the visual edit in the background; the instruction is in the composer.', 'error') }
  }
  const layersController = new NativeLayersController(workspaceController.services.invoke, (channel, ...args) => dispatchIPC('main', { type: 'send', channel, args }), state => host!.send('layersState', { state }), visualEdit)
  host.on('layers-action', action => { void layersController.action(action).catch(error => activityController.append(String(error), 'error')) })
  host.on('shell-action', action => { if (action.action === 'layers') void layersController.toggle() })
  serviceEvents.on('event', (channel, value) => {
    if (channel === 'layers:changed' || channel === 'preview:url-changed') void layersController.refresh()
    if (channel === 'layers:move-request') void layersController.move(value).catch(error => activityController.append(String(error), 'error'))
  })
  const editorController = new NativeEditorController(workspaceController.services.invoke, state => {
    host!.send('sourceState', { state: { ...state, mediaPath: state.document?.media ? nativeMediaPath(state.document.media.url) : undefined } })
    if (shellController && workspaceController.active?.root === state.root) { shellController.codeOpen = state.visible; shellController.schedule() }
  })
  const openSource = (source?: string, popped?: boolean) => { const root = workspaceController.active?.root; if (root) void editorController.open(root, source, popped) }
  const editorAction = (action: any) => { if (workspaceController.state.projects.some(p => p.root === action.root)) void editorController.action(action) }
  host.on('source-action', editorAction)
  ipcMain.handle('source:popout', (_event, root, source) => editorController.open(root, source, true))
  ipcMain.handle('source:close-window', () => { const root = workspaceController.active?.root; if (root) return editorController.action({ root, action: 'hide' }) })
  host.on('shell-action', action => {
    if (action.action !== 'code') return
    const root = workspaceController.active?.root
    if (!root) return
    if (editorController.session(root).state.visible) editorAction({ root, action: 'hide' })
    else openSource(contextController.projects.get(root)?.selection?.bubble.source ?? undefined)
  })
  serviceEvents.on('event', (channel, value) => {
    if (channel === 'source:reveal' && value.root === workspaceController.active?.root) openSource(`${value.source}:${value.startLine}`)
  })
  workspaceController.services.activate = async entry => {
    host!.send('sourceActive', { root: entry?.root ?? '' })
    void layersController.activate(entry?.root ?? '')
    if (shellController) { shellController.codeOpen = entry ? editorController.session(entry.root).state.visible : false; shellController.schedule() }
    await contextController.activate(entry)
  }
  const projectEffect = chatController.services.effect
  chatController.services.effect = effect => {
    void contextController.effect(effect).catch(error => workspaceController.reportError(error))
    if (effect.type === 'layers') void layersController.toggle()
    else projectEffect(effect)
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
  const { inspector: inspectorController, content: contentController } = installNativeInspector(host!, workspaceController, chatController, contextController, visualEdit, openSource, error => activityController.append(String(error), 'error'))
  const sheetController = new NativeSheetController(host!, workspaceController, chatController)
  const gitController = new NativeGitController(sheetController, activityController, preferences, renderShell)
  shellController = new NativeShellController(workspaceController, chatController, gitController, preferences,
    state => host!.send('shellState', { state }), () => {})
  const renderWorkspace = workspaceController.services.render
  workspaceController.services.render = state => { renderWorkspace(state); shellController!.schedule(); host!.send('recents', { recents: state.recents }) }
  host.on('menu', ({ action }) => {
    const root = workspaceController.active?.root
    if (action === 'toggle-chat') void shellController!.action({ action: 'expand' })
    else if (action === 'reload' && workspaceController.active?.url) host!.send('reload', { view: 'preview' })
    else if (['undo', 'redo'].includes(action) && root) void workspaceController.services.invoke(`edit:${action}`, root).then(result => { if (result.conflict) activityController.append('The file changed on disk; undo/redo refused to overwrite it.', 'error'); void inspectorController.refresh() }).catch(error => activityController.append(String(error), 'error'))
  })
  const renderChatEffect = chatController.services.effect
  chatController.services.effect = effect => { renderChatEffect(effect); if (effect.type === 'mirror') shellController!.schedule() }
  host.on('shell-action', action => {
    if (['expand', 'device', 'select-object', 'address', 'home'].includes(action.action)) void shellController!.action(action).catch(error => activityController.append(String(error), 'error'))
  })
  serviceEvents.on('event', (channel, value) => {
    if (channel === 'preview:url-changed') { shellController!.location = value; shellController!.schedule() }
    if (channel === 'preview:toggle-select') void shellController!.action({ action: 'select-object' }).catch(error => activityController.append(String(error), 'error'))
    if (channel === 'preview:select-cancelled') { shellController!.selecting = false; shellController!.schedule() }
  })
  serviceEvents.on('command', (channel, args) => { if (channel === 'preview:set-select-mode') { shellController!.selecting = !!args[0]; shellController!.schedule() } })
  const activateContext = workspaceController.services.activate
  workspaceController.services.activate = async entry => { await activateContext(entry); if (entry) void gitController.refresh(entry.root).catch(error => activityController.append(String(error), 'error')) }
  host.on('shell-action', action => {
    const key = action.project ?? workspaceController.state.activeKey
    if (action.action === 'publish-mode') { gitController.setMode(action.value); refreshPreferences(); return }
    if (!key) return
    const operation = action.action === 'branch' ? gitController.branch(key, action.value ?? '') : action.action === 'new-branch' ? gitController.branch(key, action.value ?? '', true) : action.action === 'publish' ? gitController.publish(key) : action.action === 'git-updates' ? gitController.updates(key) : null
    void operation?.catch(error => activityController.append(String(error), 'error'))
  })
  const updates = new NativeUpdateController(sheetController, root, () => {
    const project = workspaceController.active?.root
    cleanup()
    const processNext = spawn(process.execPath, [join(root, 'out/native/index.cjs'), ...(project ? ['--project', project] : [])], { cwd: root, detached: true, stdio: 'ignore', env: process.env })
    processNext.on('error', error => { console.error('Could not restart Praxis Native:', error); process.exit(1) }); processNext.once('spawn', () => { processNext.unref(); process.exit(0) })
  }, undefined, undefined, () => [...chatController.chats.values()].some(chat => chat.isRunning || chat.text || chat.attachments.length) ? 'Finish running chats and send or clear your drafts before restarting.' : [...editorController.sessions.values()].some(session => [...session.documents.values()].some(doc => doc.text !== doc.baseline)) ? 'Save source editor drafts before restarting.' : [...contentController.sessions.values()].some(session => session.dirty || session.busy) ? 'Save content editor drafts before restarting.' : null)
  host.on('menu', ({ action }) => { if (action === 'updates') void updates.open().catch(error => activityController.append(String(error), 'error')) })
  host.on('download-error', ({ message }) => activityController.append(`Download failed: ${message}`, 'error'))
  host.on('download-finished', () => activityController.append('Download finished.', 'success'))
  const supportSheets = new NativeSupportSheets(sheetController, () => host!.request('captureFeedback'), url => shell.openExternal(url))
  const previewRecovery = new NativePreviewRecovery(sheetController)
  host.on('menu', ({ action }) => { if (action === 'servers' && workspaceController.state.activeKey) previewRecovery.open(workspaceController.state.activeKey) })
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
  host.on('shell-action', action => { if (action.action === 'rename-chat' && action.id && workspaceController.state.activeKey) sheetController.renameChat(action.id, workspaceController.state.activeKey); if (action.action === 'select' && action.id?.startsWith('history:')) openSheet('review', action.id.slice(8)); if (action.action === 'memory') openSheet('memory', action.project ?? workspaceController.state.activeKey ?? undefined) })
  host.on('native-preview-action', action => {
    if (workspaceController.state.activeKey !== action.project) return
    if (action.action === 'logs') activityController.action('show')
    else if (action.action === 'servers') previewRecovery.open(action.project)
    else if (action.action === 'diagnose') openSheet('diagnose')
    else if (action.action === 'run') void workspaceController.command({ type: 'restart', key: action.project, ...(action.command?.trim() ? { command: action.command.trim() } : {}) }).catch(error => activityController.append(String(error), 'error'))
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
  host.on('load-error', message => { activityController.append(message.message, 'error'); if (message.view === 'preview' && workspaceController.active) { workspaceController.state.status = { kind: 'error', message: message.message }; workspaceController.changed() } })
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
    host!.send('layoutWidth', { width: Number(preferences.get('praxis:native-chat-width')) || 440 })
    try { host!.send('layoutSizes', { sizes: JSON.parse(preferences.get('praxis:native-panel-sizes') ?? '{}') }) } catch {}
    shellController!.render()
    let preferred: unknown
    try { preferred = JSON.parse(preferences.get('praxis:preferred-model') ?? 'null') } catch {}
    await workspaceController.command({ type: 'attach', preferred: resolvePreferredSettings(parsePreferredModelState(preferred)) })
    await chatController.command({ type: 'attach' })
    if (requestedProject && !testing) await workspaceController.command({ type: 'open', root: resolve(requestedProject) })
    console.log('Praxis Native is running on Bun + system WebKit. ')
    if (testing) {
      try {
        await runNativeCoreSmoke(host!, fixture!, root)
        cleanup()
        process.exitCode = 0
      } catch (error) {
        console.error(error)
        try {
          writeFileSync(join(root, 'test/artifacts/native/failure.png'), Buffer.from(await host!.request('captureShell'), 'base64'))
          console.error('Native chat state:', await host!.request('chatInspect'))
          console.error('Native geometry:', await host!.request('layoutInspect'))
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
