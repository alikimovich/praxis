import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import electronPath from 'electron'
import { _electron as electron } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const profile = mkdtempSync(join(tmpdir(), 'praxis-cat-'))
const artifacts = join(root, 'test/artifacts')
mkdirSync(artifacts, { recursive: true })
let app
try {
  app = await electron.launch({
    executablePath: electronPath,
    args: [join(root, 'out/main/index.js')],
    cwd: root,
    env: { ...process.env, PRAXIS_USER_DATA: profile, PRAXIS_TEST_SKIP_INTRO: '1' }
  })
  const win = await app.firstWindow()
  await win.waitForSelector('.empty__open')
  await win.evaluate(() =>
    window.__praxisWorkspace.getState().openOrActivate('/tmp/praxis-cat-project')
  )
  await win.waitForSelector('.composer__input')
  // Use the composer cat even when the shell uses a different chat wrapper.
  const pose = async (name) =>
    win.waitForFunction(
      (name) => document.querySelector('.chat__status > .cat-loader')?.dataset.animation === name,
      name
    )
  await pose('rest')
  // Observe idle timers without changing real frame timings. Checking pending
  // timers proves reduced motion cancels/suppresses idle playback without a
  // 31-second sleep (which previously lost its Electron window mid-wait).
  await win.evaluate(() => {
    Math.random = () => 0
    const schedule = window.setTimeout.bind(window)
    const cancel = window.clearTimeout.bind(window)
    const idleTimers = new Set()
    window.__catIdleTimers = idleTimers
    window.setTimeout = (callback, delay, ...args) => {
      if (!(delay >= 15000 && delay <= 30000)) return schedule(callback, delay, ...args)
      const id = schedule(() => {
        idleTimers.delete(id)
        callback(...args)
      }, delay)
      idleTimers.add(id)
      return id
    }
    window.clearTimeout = (id) => {
      idleTimers.delete(id)
      cancel(id)
    }
  })
  const start = () => win.evaluate(() => window.__praxisStore.getState().startAssistant())
  const inject = (type, key) =>
    app.evaluate(
      ({ BrowserWindow }, { type, key }) => {
        BrowserWindow.getAllWindows()[0].webContents.send('agent:event', {
          type,
          projectKey: key,
          ...(type === 'error' ? { message: 'Test failure' } : {})
        })
      },
      { type, key }
    )
  const key = await win.evaluate(() => window.__praxisStore.getState().activeKey)
  await start()
  await pose('run')
  await win.evaluate(
    (key) =>
      window.__praxisQuestions.getState().addRequest({
        id: 'cat-question',
        sessionKey: key,
        questions: [
          {
            header: 'Style',
            question: 'Which heading style should I use?',
            multiSelect: false,
            options: [{ label: 'Compact' }, { label: 'Spacious' }]
          }
        ]
      }),
    key
  )
  await pose('think')
  await win.waitForTimeout(260)
  assert.notEqual(await win.locator('[data-animation="think"]').getAttribute('data-frame'), '0')
  await win.screenshot({ path: join(artifacts, 'cat-thinking.png') })
  await win.evaluate(() => window.__praxisQuestions.getState().clearPending())
  await pose('run')
  await inject('done', key)
  await pose('jump')
  await win.waitForTimeout(130)
  await win.screenshot({ path: join(artifacts, 'cat-jump.png') })
  await win.waitForTimeout(500)
  await pose('rest')
  assert.equal(await win.evaluate(() => window.__catIdleTimers.size), 1, 'rest schedules an idle timer')
  await pose('idle')
  await win.screenshot({ path: join(artifacts, 'cat-idle.png') })
  await win.waitForTimeout(1500)
  await pose('rest')
  await start()
  await pose('run')
  await inject('error', key)
  await inject('done', key)
  await pose('rest')
  await start()
  await pose('run')
  await win.getByRole('button', { name: 'Stop', exact: true }).click()
  await inject('done', key)
  await pose('rest')
  await start()
  await pose('run')
  await inject('done', `${key}#background`)
  await pose('run')
  await win.emulateMedia({ reducedMotion: 'reduce' })
  await win.waitForTimeout(50)
  await win.waitForTimeout(1000)
  assert.equal(await win.locator('[data-animation="run"]').getAttribute('data-frame'), '0')
  await inject('done', key)
  await pose('rest')
  assert.equal(await win.evaluate(() => window.__catIdleTimers.size), 0, 'reduced motion must not schedule idle')
  // Re-enable motion to prove the observer can see the timer, then disable it
  // while resting to verify cancellation of an already-scheduled idle animation.
  await win.emulateMedia({ reducedMotion: 'no-preference' })
  await win.waitForFunction(() => window.__catIdleTimers.size === 1)
  await win.emulateMedia({ reducedMotion: 'reduce' })
  await win.waitForFunction(() => window.__catIdleTimers.size === 0)
  await pose('rest')
  console.log(
    'CAT ANIMATIONS OK — questions, one-shot jump, occasional idle, error/cancel/background and reduced motion'
  )
} finally {
  await app?.close()
  rmSync(profile, { recursive: true, force: true })
}
