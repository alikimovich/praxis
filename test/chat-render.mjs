/**
 * Visual test of chat rendering (markdown + tool-status lines) without needing
 * the agent/auth: drives the exposed store directly in the renderer, then
 * screenshots the result.
 *
 * Run with: bun run test:chat
 */
import { _electron as electron } from 'playwright'
import electronPath from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdirSync } from 'node:fs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const artifacts = join(root, 'test', 'artifacts')
mkdirSync(artifacts, { recursive: true })

const SAMPLE = [
  '## Updated the hero section',
  '',
  "I changed the heading color to **teal** and tightened the spacing. Here's the key edit:",
  '',
  '```tsx',
  'export function Hero() {',
  '  return <h1 className="title">Welcome</h1>',
  '}',
  '```',
  '',
  '- Adjusted `--accent` token to `#0d9488`',
  '- Reduced top padding from `64px` to `48px`',
  '',
  '> Preview should hot-reload automatically.'
].join('\n')

let app
try {
  app = await electron.launch({
    executablePath: electronPath,
    args: [join(root, 'out', 'main', 'index.js')],
    cwd: root
  })

  const win = await app.firstWindow()
  await win.waitForSelector('.composer__input', { timeout: 15000 })

  await win.evaluate(async (sample) => {
    const store = window.__dsgnStore
    const s = store.getState()
    s.appendUser('Make the hero heading teal and tighten the spacing')
    const id = s.startAssistant()
    s.appendStatus(id, 'Read · src/components/Hero.tsx')
    s.appendStatus(id, 'Edit · src/components/Hero.tsx')
    // Stream the markdown in chunks to mimic real deltas.
    for (let i = 0; i < sample.length; i += 12) {
      store.getState().appendDelta(id, sample.slice(i, i + 12))
    }
    store.getState().finish()
  }, SAMPLE)

  await win.waitForSelector('.markdown pre code', { timeout: 5000 })
  await win.screenshot({ path: join(artifacts, '04-chat-render.png') })

  // Toolbar + "/" slash menu: seed commands and open the menu.
  await win.evaluate(() => {
    window.__dsgnSession
      .getState()
      .setSlashCommands(['design-review', 'accessibility-review', 'commit', 'compact', 'init'])
  })
  await win.fill('.composer__input', '/')
  await win.waitForSelector('.slash__item', { timeout: 5000 })
  await win.screenshot({ path: join(artifacts, '05-toolbar-slash.png') })

  // First-run auth onboarding: flipping authNeeded shows the guidance banner.
  await win.fill('.composer__input', '')
  await win.evaluate(() => window.__dsgnSession.getState().setAuthNeeded(true))
  await win.waitForSelector('.banner--auth code', { timeout: 5000 })
  const authText = (await win.textContent('.banner--auth'))?.toLowerCase() ?? ''
  if (!authText.includes('setup-token')) {
    throw new Error('auth banner should mention claude setup-token')
  }
  await win.screenshot({ path: join(artifacts, '08-auth-onboarding.png') })

  console.log('CHAT-RENDER OK')
} catch (err) {
  console.error('CHAT-RENDER FAILED:', err?.message ?? err)
  process.exitCode = 1
} finally {
  await app?.close()
}
