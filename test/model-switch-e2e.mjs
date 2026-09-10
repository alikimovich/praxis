import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron } from 'playwright'
import electronPath from 'electron'
const root = mkdtempSync(join(tmpdir(), 'praxis-model-context-'))
const userData = mkdtempSync(join(tmpdir(), 'praxis-model-context-ui-'))
writeFileSync(join(root, 'index.html'), '<h1>Model context test</h1>')
const secret = randomUUID()
let app
let firstTurn = true
try {
  app = await _electron.launch({ executablePath: electronPath, args: [join(process.cwd(), 'out/main/index.js')], env: { ...process.env, PRAXIS_USER_DATA: userData } })
  const win = await app.firstWindow()
  await win.waitForSelector('.empty__open')
  await win.evaluate(() => window.__praxisSession.getState().setProvider('codex'))
  await app.evaluate(({ dialog, BrowserWindow }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] })
    BrowserWindow.getAllWindows()[0].webContents.send('menu:action', 'open-project')
  }, root)
  await win.waitForFunction(() => /http:/.test(document.querySelector('.previewbar__url')?.textContent ?? ''))
  const turn = async (prompt) => {
    await win.evaluate(() => { window.__modelEvents = []; window.api.agent.onEvent(e => window.__modelEvents.push(e)) })
    await win.fill('.composer__input', prompt)
    await win.click('.composer__send')
    await win.waitForFunction(() => window.__modelEvents.some(e => e.type === 'done'), undefined, { timeout: 180000 })
    const events = await win.evaluate(() => window.__modelEvents)
    const error = events.find(e => e.type === 'error')
    if (firstTurn && error && /login|sign in|not logged in|ENOENT|credentials/i.test(error.message)) {
      const unavailable = new Error(error.message)
      unavailable.code = 'NO_CREDENTIALS'
      throw unavailable
    }
    assert(!error, JSON.stringify(events))
    firstTurn = false
    return events.filter(e => e.type === 'delta').map(e => e.text).join('')
  }
  await turn(`Remember this conversation-only reference: ${secret}. Reply "Remembered". Do not use tools, read files, or write this reference anywhere.`)
  const restarted = await win.evaluate(async (root) => window.api.agent.restartChat(root,
    window.__praxisStore.getState().activeKey, { provider: 'codex', model: 'gpt-6-astra' }), root)
  assert(restarted.ok, restarted.error)
  const reply = await turn('What was the conversation-only reference in my earlier message? Reply with that exact reference only. Do not use tools or read files.')
  assert(reply.includes(secret), `new model lost history: ${reply}`)
  const messages = await win.evaluate(() => window.__praxisStore.getState().messages)
  assert(!JSON.stringify(messages).includes('Conversation (JSON)'), 'handoff must not pollute displayed history')
  console.log('MODEL-SWITCH-E2E OK — fresh Codex model recalls a conversation-only random reference')
} catch (error) {
  if (error.code === 'NO_CREDENTIALS') console.log('MODEL-SWITCH-E2E SKIP — Codex is not connected')
  else throw error
} finally {
  await app?.close()
  rmSync(root, { recursive: true, force: true })
  rmSync(userData, { recursive: true, force: true })
}
