/**
 * UI test for the propose-first fix card. Injects a diagnosis via the store
 * (no AI/auth needed) and checks it renders repo/host steps, that Apply seeds
 * the composer + clears the card, and that Dismiss clears it.
 *
 * Run with: bun run test:diagnose-card
 */
import { _electron as electron } from 'playwright'
import electronPath from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdirSync } from 'node:fs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const artifacts = join(root, 'test', 'artifacts')
mkdirSync(artifacts, { recursive: true })

const DIAG = {
  signature: 'sig-test',
  summary: 'Missing dependency @ai-sdk/xai',
  detail: "The app's server imports a package that isn't installed.",
  steps: [
    { text: 'Install the missing dependency', command: 'bun add @ai-sdk/xai', scope: 'repo' },
    { text: 'Accept the Xcode license', command: 'sudo xcodebuild -license accept', scope: 'host' }
  ],
  seenBefore: false,
  status: 'proposed'
}

let app
try {
  app = await electron.launch({
    executablePath: electronPath,
    args: [join(root, 'out', 'main', 'index.js')],
    cwd: root
  })
  const win = await app.firstWindow()
  await win.waitForSelector('.composer__input', { timeout: 15000 })

  await win.evaluate((d) => window.__dsgnDiagnosis.getState().setCurrent(d), DIAG)
  await win.waitForSelector('.diag', { timeout: 5000 })

  const summary = await win.textContent('.diag__summary')
  if (!summary?.includes('@ai-sdk/xai')) throw new Error(`summary: ${summary}`)
  const steps = await win.$$('.diag__step')
  if (steps.length !== 2) throw new Error(`expected 2 steps, got ${steps.length}`)
  if ((await win.$$('.diag__scope--repo')).length !== 1) throw new Error('missing repo scope')
  if ((await win.$$('.diag__scope--host')).length !== 1) throw new Error('missing host scope')
  if ((await win.$$('.diag__copy')).length !== 2) throw new Error('missing copy buttons')
  await win.screenshot({ path: join(artifacts, '30-diagnose-card.png') })

  // Apply seeds the composer with the repo fix and clears the card.
  await win.click('button:has-text("Apply repo fix")')
  await win.waitForSelector('.diag', { state: 'detached', timeout: 5000 })
  const input = await win.inputValue('.composer__input')
  if (!input.includes('@ai-sdk/xai')) throw new Error(`composer not seeded: "${input}"`)

  // Dismiss clears the card too.
  await win.evaluate((d) => window.__dsgnDiagnosis.getState().setCurrent(d), DIAG)
  await win.waitForSelector('.diag', { timeout: 5000 })
  await win.click('button:has-text("Dismiss")')
  await win.waitForSelector('.diag', { state: 'detached', timeout: 5000 })

  console.log('DIAGNOSE-CARD OK — renders repo/host steps, Apply seeds composer, Dismiss clears')
} catch (err) {
  console.error('DIAGNOSE-CARD FAILED:', err?.message ?? err)
  process.exitCode = 1
} finally {
  await app?.close()
}
