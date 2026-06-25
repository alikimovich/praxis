/**
 * Multi-session agent lifecycle (v5-B) — through real IPC, no Claude creds
 * needed. We don't run real turns; we probe the "no active session" error
 * (emitted synchronously by agent:send before any SDK interaction) to prove the
 * per-project session map + active routing + close/fallback:
 *
 *   no project          → send errors "Open a project first"
 *   open A, open B      → a session is active (no such error)
 *   close B (active)    → active cleared, NOT auto-promoted (error returns)
 *   reopen A            → A is active again (no error)
 *   close A             → no active session again (error returns)
 *
 * Run with: bun run test:agentmulti
 */
import { _electron as electron } from 'playwright'
import electronPath from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const projA = join(root, 'test', 'fixtures', 'static-app')
const projB = join(root, 'test', 'fixtures', 'selectable-app')

let app
try {
  app = await electron.launch({
    executablePath: electronPath,
    args: [join(root, 'out', 'main', 'index.js')],
    cwd: root
  })
  const win = await app.firstWindow()
  await win.waitForSelector('.composer__input', { timeout: 15000 })

  // Collect agent events independently of the app's own chat listener.
  await win.evaluate(() => {
    window.__agentEvents = []
    window.api.agent.onEvent((e) => window.__agentEvents.push(e))
  })

  const clear = () => win.evaluate(() => (window.__agentEvents.length = 0))
  // Send, let the synchronous no-session error (if any) land, then report whether
  // it appeared. If a session was active we interrupt the turn we just started so
  // it can't do real work (and 401s fast without creds).
  const sawNoSession = async (text) => {
    await win.evaluate((t) => window.api.agent.send(t), text)
    await new Promise((r) => setTimeout(r, 500))
    const flagged = await win.evaluate(() =>
      window.__agentEvents.some(
        (e) => e.type === 'error' && String(e.message).includes('Open a project first')
      )
    )
    await win.evaluate(() => window.api.agent.interrupt())
    return flagged
  }
  const open = (d) => win.evaluate((p) => window.api.agent.openProject(p), d)
  const close = (d) => win.evaluate((p) => window.api.agent.closeProject(p), d)

  const assert = (cond, msg) => {
    if (!cond) throw new Error(msg)
  }

  // No project → send must error with the no-session message.
  await clear()
  assert(await sawNoSession('ping'), 'expected a no-session error before any project is open')

  // Open A then B → B is the active session; no no-session error.
  await open(projA)
  await open(projB)
  await clear()
  assert(!(await sawNoSession('ping')), 'a session should be active after opening A and B')

  // Close B (the active project) → active cleared, NOT auto-promoted to A.
  await close(projB)
  await clear()
  assert(
    await sawNoSession('ping'),
    'closing the active project should clear active (no auto-promote)'
  )

  // Reopen A → A is active again (explicit re-activation via open).
  await open(projA)
  await clear()
  assert(!(await sawNoSession('ping')), 'reopening A should re-activate its session')

  // Close A → no active session again.
  await close(projA)
  await clear()
  assert(await sawNoSession('ping'), 'closing the last project should clear the active session')

  console.log('AGENT-MULTI OK — per-project sessions, active routing, close clears active, reopen re-activates')
} catch (err) {
  console.error('AGENT-MULTI FAILED:', err?.message ?? err)
  process.exitCode = 1
} finally {
  await app?.close()
}
