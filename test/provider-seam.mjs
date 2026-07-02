/**
 * v7 model-provider seam — proves dispatch + graceful degradation without any
 * subscription login:
 *
 *   open project with { provider: 'codex' }  → routes to the Codex backend
 *   send a turn                              → @openai/codex-sdk isn't installed,
 *                                              so it emits a clear error + done
 *                                              (tagged projectKey), never crashes
 *   open project with no provider            → Claude path (default) still starts
 *
 * The Claude path's real behavior is covered by agent-multi / agent-e2e; here we
 * only assert the seam dispatches and the non-Claude path fails soft.
 *
 * Run with: bun run test:providerseam
 */
import { _electron as electron } from 'playwright'
import electronPath from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const A = join(root, 'test', 'fixtures', 'static-app')

let app
try {
  app = await electron.launch({
    executablePath: electronPath,
    args: [join(root, 'out', 'main', 'index.js')],
    cwd: root
  })
  const win = await app.firstWindow()
  await win.waitForSelector('.empty__open', { timeout: 15000 })
  await win.evaluate(() => window.__dsgnWorkspace.getState().openOrActivate('/tmp/dsgn-test-project'))
  await win.waitForSelector('.composer__input', { timeout: 15000 })
  const assert = (cond, msg) => {
    if (!cond) throw new Error(msg)
  }

  // Capture the raw agent:event stream.
  await win.evaluate(() => {
    window.__ev = []
    window.api.agent.onEvent((e) => window.__ev.push(e))
  })

  // Poll the captured stream until the turn's `done` lands (robust under load —
  // the codex preflight spawns a subprocess, so a fixed sleep can be too tight).
  const waitForDone = () =>
    win
      .waitForFunction(() => window.__ev.some((e) => e.type === 'done'), { timeout: 20000 })
      .catch(() => {})

  // Select the Codex backend and send a turn. The `codex` CLI isn't installed in CI,
  // so the provider must emit an error + done rather than throwing.
  await win.evaluate((p) => window.api.agent.openProject(p, { provider: 'codex' }), A)
  await win.evaluate(() => window.api.agent.send('hello from the seam test'))
  await waitForDone()

  const ev = await win.evaluate(() => window.__ev)
  const err = ev.find((e) => e.type === 'error')
  const done = ev.find((e) => e.type === 'done')
  assert(err, `codex backend should emit an error when the SDK is absent (got ${JSON.stringify(ev)})`)
  assert(/codex/i.test(err.message), `error should name codex (got "${err.message}")`)
  assert(done, 'codex backend should still emit done after the error (turn completes)')
  assert(err.projectKey && err.projectKey === done.projectKey, 'events tagged with the project key')

  // Gemini dispatch: the `gemini` CLI isn't installed in CI, so the subprocess
  // spawn fails — the provider must still emit error + done, not throw.
  await win.evaluate((p) => window.api.agent.closeProject(p), A)
  await win.evaluate(() => {
    window.__ev = []
  })
  await win.evaluate((p) => window.api.agent.openProject(p, { provider: 'gemini' }), A)
  await win.evaluate(() => window.api.agent.send('hello gemini'))
  await waitForDone()
  const gev = await win.evaluate(() => window.__ev)
  assert(
    gev.find((e) => e.type === 'error') && gev.find((e) => e.type === 'done'),
    `gemini backend should fail soft (error+done) when the CLI is absent (got ${JSON.stringify(gev)})`
  )

  // The default (no provider) path must still construct a session — open it and
  // confirm the session is live via the is-open IPC (Claude backend).
  await win.evaluate((p) => window.api.agent.closeProject(p), A)
  await win.evaluate((p) => window.api.agent.openProject(p), A)
  const open = await win.evaluate((p) => window.api.agent.isOpen(p), A)
  assert(open === true, 'default provider (Claude) session should be open')

  console.log('PROVIDER-SEAM OK — codex + gemini dispatch fail soft (error+done), Claude path live')
} catch (err) {
  console.error('PROVIDER-SEAM FAILED:', err?.message ?? err)
  process.exitCode = 1
} finally {
  await app?.close()
}
