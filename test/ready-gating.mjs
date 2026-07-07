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
import { mkdtempSync, mkdirSync, readFileSync, rmSync, existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const fixtures = join(root, 'test', 'fixtures')
const artifacts = join(root, 'test', 'artifacts')
mkdirSync(artifacts, { recursive: true })
const scaffoldDir = mkdtempSync(join(tmpdir(), 'dsgn-setup-'))
// Setup is framework-first now: give it a React package.json so detect() branches
// to the Babel-plugin strategy (full per-framework coverage is in setup-detect.mjs).
writeFileSync(
  join(scaffoldDir, 'package.json'),
  JSON.stringify({ name: 'gating-fixture', dependencies: { react: '^18.2.0' } })
)

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

  // The props panel lives in the floating ISLAND (its own webContents,
  // ?dsgnPanel=1) — query its DOM there.
  const panelEval = (code) =>
    app.evaluate(async ({ webContents }, c) => {
      const wc = webContents.getAllWebContents().find((w) => w.getURL().includes('dsgnPanel'))
      if (!wc) return '__no_panel__'
      try { return await wc.executeJavaScript(c) } catch { return '__no_panel__' }
    }, code)
  const waitPanel = async (code, timeout = 10000) => {
    const end = Date.now() + timeout
    for (;;) {
      const r = await panelEval(code)
      if (r !== '__no_panel__' && r) return r
      if (Date.now() > end) throw new Error('island condition timed out: ' + code.slice(0, 100))
      await new Promise((res) => setTimeout(res, 250))
    }
  }
  // Tests assume the expanded card (a previous run may have collapsed it).
  const expandPanel = () =>
    panelEval("localStorage.setItem('dsgn.proppanel.collapsed','0'); document.querySelector('.proppanel__expand')?.click(); true")

  // --- setup.scaffold writes the stamping plugin (and is idempotent). ---
  const first = await win.evaluate((d) => window.api.setup.scaffold(d), scaffoldDir)
  if (!first.ok || !first.written) throw new Error(`scaffold: ${JSON.stringify(first)}`)
  if (first.framework !== 'react') throw new Error(`expected react detect: ${JSON.stringify(first)}`)
  const pluginPath = join(scaffoldDir, '.dsgn', 'dsgn-source.cjs')
  if (!existsSync(pluginPath)) throw new Error('plugin file not written')
  if (!readFileSync(pluginPath, 'utf8').includes('data-dsgn-source')) {
    throw new Error('plugin missing the stamping logic')
  }
  const second = await win.evaluate((d) => window.api.setup.scaffold(d), scaffoldDir)
  if (second.written) throw new Error('scaffold should not overwrite an existing plugin')

  // --- Gating: a STAMPED host <span> (no component schema) is prompt-only, no
  // panel — and, since it already has a source stamp, it must NOT nag to "set up
  // the project" (the project is clearly set up). It's prompt-only → ask dsgn. ---
  await win.evaluate(
    (args) => {
      window.__dsgnSession.getState().setProjectRoot(args.fixture)
      window.__dsgnSelection.getState().setSelected({
        tag: 'span',
        id: null,
        classes: ['badge'],
        selector: 'span.badge',
        source: 'src/Badge.tsx:13', // the <span> inside Badge — host element, no props schema
        componentSource: null, // not inside a stamped component instance
        text: 'x',
        rect: { x: 0, y: 0, width: 0, height: 0 },
        styles: {}
      })
    },
    { fixture: join(fixtures, 'propedit-app') }
  )
  // The island opens for EVERY selection; a no-schema element shows the
  // prompt-only readiness message inside it (no editable fields).
  await expandPanel()
  await waitPanel("!!document.querySelector('.proppanel .proppanel__ready--no')")
  if (await panelEval("document.querySelectorAll('.proppanel__row').length")) {
    throw new Error('a no-schema element should not render editable prop rows')
  }
  const stampedHint = (await panelEval("document.querySelector('.proppanel__ready--no')?.textContent ?? ''")) ?? ''
  if (!/ask dsgn/i.test(stampedHint)) {
    throw new Error(`stamped host element should be prompt-only (ask dsgn): ${stampedHint}`)
  }
  if (await panelEval("document.querySelectorAll('.proppanel__link').length")) {
    throw new Error('a stamped element must NOT show the "set up the project" link')
  }
  await win.screenshot({ path: join(artifacts, '13-gating.png') })

  // --- A genuinely UNSTAMPED element (source: null) is what warrants the setup
  // link — that's the only "not set up for prop editing" case. ---
  await win.evaluate(() => {
    window.__dsgnSelection.getState().setSelected({
      tag: 'div',
      id: null,
      classes: [],
      selector: 'div',
      source: null, // no data-dsgn-source stamp → project isn't set up
      componentSource: null,
      text: null,
      rect: { x: 0, y: 0, width: 0, height: 0 },
      styles: {}
    })
  })
  await waitPanel("!!document.querySelector('.proppanel__link')")

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
  await waitPanel("!!document.querySelector('.proppanel__row')")

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
