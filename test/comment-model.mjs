import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron } from 'playwright'
import electronPath from 'electron'

const userData = mkdtempSync(join(tmpdir(), 'praxis-comment-model-'))
let app
try {
  app = await _electron.launch({ executablePath: electronPath,
    args: [join(process.cwd(), 'out/main/index.js')],
    env: { ...process.env, PRAXIS_USER_DATA: userData } })
  const win = await app.firstWindow()
  await win.waitForSelector('.empty__open')
  await app.evaluate(({ ipcMain }) => {
    globalThis.commentCalls = []
    ipcMain.removeHandler('agent:spawn-comment')
    ipcMain.handle('agent:spawn-comment', (_event, root, text, parent, options, origin) => {
      globalThis.commentCalls.push({ root, parent, options, origin })
      return { ok: true, spawnId: `test-${globalThis.commentCalls.length}`, queued: true }
    })
  })
  const cases = [
    { provider: 'claude', model: 'claude:opus', modelId: 'opus', expected: 'sonnet', label: 'Claude sonnet' },
    { provider: 'codex', model: 'codex:gpt-6-astra', modelId: 'gpt-6-astra', expected: 'gpt-5.6-sol', label: 'gpt-5.6-sol' },
    { provider: 'codex', model: 'conn:gateway:deepseek', modelId: 'deepseek/exact-model', connectionId: 'gateway', expected: 'deepseek/exact-model', label: 'deepseek/exact-model' }
  ]
  for (const [index, choice] of cases.entries()) {
    const before = await win.evaluate(choice => {
      const root = '/tmp/praxis-comment-model-project'
      const key = window.__praxisWorkspace.getState().openOrActivate(root)
      window.__praxisStore.getState().setActiveChat(key)
      window.__praxisSession.getState().setProjectRoot(root)
      window.__praxisSession.getState().setChatAgentSettings({ ...choice, effort: 'high', permissionMode: 'auto' })
      const state = window.__praxisSession.getState()
      return { model: state.model, modelId: state.modelId, provider: state.provider, connectionId: state.connectionId }
    }, choice)
    await win.fill('.composer__input', 'Keep this draft')
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].webContents.send('preview:comment', {
        kind: 'comment', text: 'Make this heading smaller',
        el: { tag: 'h1', id: 'heading', classes: [], selector: '#heading', text: 'Heading', source: null,
          rect: { x: 0, y: 0, width: 100, height: 30 }, styles: {} }
      })
    })
    await win.waitForFunction(id => Object.values(window.__praxisSpawns.getState().byKey).flat().some(row => row.id === id), `test-${index + 1}`)
    const call = await app.evaluate(() => globalThis.commentCalls.at(-1))
    assert.equal(call.options.model, choice.expected)
    assert.equal(call.options.connectionId, choice.connectionId)
    assert.equal(call.origin, 'comment')
    const state = await win.evaluate(id => {
      const s = window.__praxisSession.getState()
      return { settings: { model: s.model, modelId: s.modelId, provider: s.provider, connectionId: s.connectionId },
        row: Object.values(window.__praxisSpawns.getState().byKey).flat().find(row => row.id === id),
        messages: window.__praxisStore.getState().messages }
    }, `test-${index + 1}`)
    assert.deepEqual(state.settings, before)
    assert.equal(state.row.modelLabel, choice.label)
    assert.equal(state.row.status, 'queued')
    assert.equal(state.messages.length, 0)
    assert.equal(await win.inputValue('.composer__input'), 'Keep this draft')
  }
  await win.screenshot({ path: join(process.cwd(), 'test/artifacts/comment-model-routing.png') })
  console.log('COMMENT-MODEL OK — submitted models and queued sidebar labels match; parent model, draft and transcript unchanged')
} finally {
  await app?.close()
  rmSync(userData, { recursive: true, force: true })
}
