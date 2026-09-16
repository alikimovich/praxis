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
  // Control only the randomized idle delay, preserving authored frame timings.
  await win.evaluate(() => {
    Math.random = () => 0
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
  await win.waitForTimeout(31000)
  await pose('rest')
  console.log(
    'CAT ANIMATIONS OK — questions, one-shot jump, occasional idle, error/cancel/background and reduced motion'
  )
} finally {
  await app?.close()
  rmSync(profile, { recursive: true, force: true })
}
