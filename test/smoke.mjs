/**
 * Electron smoke test — launches the built app, exercises the shell, and saves
 * screenshots to test/artifacts/. Run with: bun run test:smoke
 *
 * This is how we verify the app actually works without a human watching: it
 * drives the real renderer over CDP (via Playwright's Electron support) and
 * captures images you can open.
 */
import { _electron as electron } from 'playwright'
import electronPath from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdirSync } from 'node:fs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const artifacts = join(root, 'test', 'artifacts')
mkdirSync(artifacts, { recursive: true })

const shot = (win, name) => win.screenshot({ path: join(artifacts, name) })

let app
try {
  app = await electron.launch({
    executablePath: electronPath,
    args: [join(root, 'out', 'main', 'index.js')],
    cwd: root
  })

  const win = await app.firstWindow()
  await win.waitForSelector('.titlebar__brand', { timeout: 15000 })
  await shot(win, '01-launch.png')

  // The shell renders: brand, both panes, composer.
  const brand = (await win.textContent('.titlebar__brand'))?.trim()
  if (brand !== 'dsgn') throw new Error(`expected brand "dsgn", got "${brand}"`)
  for (const sel of ['.pane--chat', '.pane--preview', '.composer__input', '.btn']) {
    await win.waitForSelector(sel, { timeout: 5000 })
  }

  // The composer accepts input and the send button enables.
  await win.fill('.composer__input', 'Hello from the smoke test')
  const sendDisabled = await win.getAttribute('.composer__send', 'disabled')
  if (sendDisabled !== null) throw new Error('send button should be enabled after typing')
  await shot(win, '02-typed.png')

  console.log('SMOKE OK — artifacts in test/artifacts/')
} catch (err) {
  console.error('SMOKE FAILED:', err?.message ?? err)
  process.exitCode = 1
} finally {
  await app?.close()
}
