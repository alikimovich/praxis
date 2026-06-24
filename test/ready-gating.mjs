/**
 * Readiness gating + setup test:
 *  - setup.scaffold writes the dev-only source-stamping plugin (idempotent).
 *  - A component with no resolvable schema is NOT editable — no prop panel, the
 *    chip shows the prompt-only hint + a "set up the project" link.
 *  - The on-open setup dialogue renders with a "Set it up" action.
 *
 * Run with: bun run test:gating
 */
import { _electron as electron } from 'playwright'
import electronPath from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const fixtures = join(root, 'test', 'fixtures')
const artifacts = join(root, 'test', 'artifacts')
mkdirSync(artifacts, { recursive: true })
const scaffoldDir = mkdtempSync(join(tmpdir(), 'dsgn-setup-'))

let app
try {
  app = await electron.launch({
    executablePath: electronPath,
    args: [join(root, 'out', 'main', 'index.js')],
    cwd: root
  })
  const win = await app.firstWindow()
  await win.waitForSelector('.composer__input', { timeout: 15000 })

  // --- setup.scaffold writes the stamping plugin (and is idempotent). ---
  const first = await win.evaluate((d) => window.api.setup.scaffold(d), scaffoldDir)
  if (!first.ok || !first.written) throw new Error(`scaffold: ${JSON.stringify(first)}`)
  const pluginPath = join(scaffoldDir, 'dsgn-source-plugin.cjs')
  if (!existsSync(pluginPath)) throw new Error('plugin file not written')
  if (!readFileSync(pluginPath, 'utf8').includes('data-dsgn-source')) {
    throw new Error('plugin missing the stamping logic')
  }
  const second = await win.evaluate((d) => window.api.setup.scaffold(d), scaffoldDir)
  if (second.written) throw new Error('scaffold should not overwrite an existing plugin')

  // --- Gating: a host <span> (no component schema) is prompt-only, no panel. ---
  await win.evaluate(
    (args) => {
      window.__dsgnSession.getState().setProjectRoot(args.fixture)
      window.__dsgnSelection.getState().setSelected({
        tag: 'span',
        id: null,
        classes: ['badge'],
        selector: 'span.badge',
        source: 'src/Badge.tsx:13', // the <span> inside Badge — host element, no props schema
        text: 'x',
        rect: { x: 0, y: 0, width: 0, height: 0 },
        styles: {}
      })
    },
    { fixture: join(fixtures, 'propedit-app') }
  )
  await win.waitForSelector('.inspector__ready--no', { timeout: 5000 })
  if (await win.locator('.proppanel').count()) {
    throw new Error('a no-schema element should not open the prop panel')
  }
  if (!(await win.locator('.inspector__link').count())) {
    throw new Error('prompt-only hint should offer a setup link')
  }
  await win.screenshot({ path: join(artifacts, '13-gating.png') })

  // Positive case: a schema-backed <Badge> usage DOES open the floating panel
  // (keeps the gate honest in both directions).
  await win.evaluate(
    (args) => {
      window.__dsgnSelection.getState().setSelected({
        tag: 'span',
        id: null,
        classes: ['badge'],
        selector: 'span.badge',
        source: 'src/Badge.tsx:17', // the <Badge …/> usage — a typed component
        text: 'Ready',
        rect: { x: 0, y: 0, width: 0, height: 0 },
        styles: {}
      })
    },
    { fixture: join(fixtures, 'propedit-app') }
  )
  await win.waitForSelector('.proppanel__row', { timeout: 5000 })

  // --- The on-open setup dialogue renders with the action. ---
  await win.evaluate(() => window.__dsgnSetup.getState().setNeeded(true))
  await win.waitForSelector('.setup', { timeout: 5000 })
  const yes = (await win.textContent('.setup__yes'))?.trim()
  if (yes !== 'Set it up') throw new Error(`setup action label: ${yes}`)

  console.log('READY-GATING OK — scaffold writes plugin, no-schema is prompt-only, offer shows')
} catch (err) {
  console.error('READY-GATING FAILED:', err?.message ?? err)
  process.exitCode = 1
} finally {
  rmSync(scaffoldDir, { recursive: true, force: true })
  await app?.close()
}
