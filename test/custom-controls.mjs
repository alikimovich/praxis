/**
 * v10 Custom Controls island test — a CANNED manifest (no live agent) proves
 * the render + literal-apply path end to end through real IPC:
 *
 *   write a valid .praxis/control-panels.json into the propedit fixture (one
 *   panel on src/Styled.tsx: a literal number anchored on `const DEMO_SCALE = `,
 *   a literal text, a literal select, and one param whose anchor does NOT occur
 *   — the stale path) → open the fixture as a real project → click-select the
 *   stamped element → the island grows a Custom tab (it renders only when the
 *   selection resolves panels) → the valid rows render enabled with FRESH
 *   values lexed from source, the broken one disabled with its reason + a
 *   Regenerate button → a scrub-cadence BURST of controls.applyLiteral
 *   (3 commits ~250ms apart) lands the final number on disk and coalesces in
 *   edit-history, so ONE edits.undo restores the pre-burst file byte-for-byte
 *   → a UI-driven select change routes through the REAL CustomPanel →
 *   applyLiteral wiring (a main-rendered `"center"` lands) → the store file
 *   survives byte-identical (applies never rewrite it) → island screenshot.
 *
 * Run with: bun run test:custom-controls
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import electronPath from 'electron'
import { _electron as electron } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const fixture = join(root, 'test', 'fixtures', 'propedit-app')
const styled = join(fixture, 'src', 'Styled.tsx')
const TW_SRC = 'src/Styled.tsx:5' // <div className="p-4 rounded-md"> in TwCard
const praxisDir = join(fixture, '.praxis')
const storeFile = join(praxisDir, 'control-panels.json')
const artifacts = join(root, 'test', 'artifacts')
mkdirSync(artifacts, { recursive: true })

const original = readFileSync(styled, 'utf8')
const hadPraxisDir = existsSync(praxisDir)

// The canned manifest: what a define_controls turn would have persisted. The
// panel matches the selection by FILE (fileOf the element's stamp), so picking
// #tw-box (src/Styled.tsx:5) surfaces it even though the anchors live in
// CustomCard further down the same file.
const storeJson =
  JSON.stringify(
    {
      version: 1,
      panels: [
        {
          id: 'custom-demo',
          file: 'src/Styled.tsx',
          component: 'CustomCard',
          title: 'Demo controls',
          createdAt: '2026-07-18T00:00:00.000Z',
          params: [
            {
              id: 'scale',
              label: 'Scale',
              kind: 'number',
              min: 0,
              max: 10,
              step: 0.1,
              apply: { strategy: 'literal', anchor: 'const DEMO_SCALE = ' }
            },
            {
              id: 'caption',
              label: 'Caption',
              kind: 'text',
              apply: { strategy: 'literal', anchor: 'const DEMO_LABEL = ' }
            },
            {
              id: 'align',
              label: 'Align',
              kind: 'select',
              options: ['left', 'center', 'right'],
              apply: { strategy: 'literal', anchor: 'const DEMO_ALIGN = ' }
            },
            {
              id: 'ghost',
              label: 'Ghost',
              kind: 'number',
              apply: { strategy: 'literal', anchor: 'const NOPE_MISSING = ' }
            }
          ]
        }
      ]
    },
    null,
    2
  ) + '\n'

mkdirSync(praxisDir, { recursive: true })
writeFileSync(storeFile, storeJson)

let app
try {
  app = await electron.launch({
    executablePath: electronPath,
    args: [join(root, 'out', 'main', 'index.js')],
    cwd: root
  })
  const win = await app.firstWindow()
  await win.waitForSelector('.empty__open', { timeout: 15000 })

  // The Custom tab lives in the floating ISLAND (its own webContents,
  // ?praxisPanel=1) — query its DOM there.
  const panelEval = (code) =>
    app.evaluate(async ({ webContents }, c) => {
      const wc = webContents.getAllWebContents().find((w) => w.getURL().includes('praxisPanel'))
      if (!wc) return '__no_panel__'
      try {
        return await wc.executeJavaScript(c)
      } catch {
        return '__no_panel__'
      }
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
  // Save the island's own pixels (it's a WebContentsView — absent from
  // renderer-page screenshots).
  const shotIsland = async (name) => {
    const b64 = await app.evaluate(async ({ webContents }) => {
      const wc = webContents.getAllWebContents().find((w) => w.getURL().includes('praxisPanel'))
      if (!wc) return null
      const img = await wc.capturePage()
      return img.toPNG().toString('base64')
    })
    if (!b64) throw new Error(`island screenshot failed for ${name}`)
    writeFileSync(join(artifacts, name), Buffer.from(b64, 'base64'))
  }

  // --- Open the fixture as a REAL project (dev server + preview + preload). ---
  await app.evaluate(async ({ dialog }, fixturePath) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [fixturePath] })
  }, fixture)
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.send('menu:action', 'open-project')
  )
  await win.waitForFunction(
    () =>
      /http:\/\/(localhost|127\.0\.0\.1|\[::1\]):\d+/.test(
        document.querySelector('.previewbar__url')?.textContent ?? ''
      ),
    { timeout: 60000 }
  )

  // Agent request must select and open Custom without a click or manual Props toggle.
  await app.evaluate(({ BrowserWindow }, request) => {
    BrowserWindow.getAllWindows()[0].webContents.send('controls:open', request)
  }, { root: fixture, source: TW_SRC, tab: 'custom', requestId: 'agent-open-test' })
  await waitPanel("!!document.querySelector('.custompanel__grouptitle')", 20000)
  const selectedSource = await win.evaluate(() => window.__praxisSelection.getState().selected?.source)
  if (selectedSource !== TW_SRC) throw new Error('Agent request did not select the requested object')

  // --- Rows: fresh values lexed from source for the valid params; the broken
  // anchor renders disabled with its reason + a Regenerate button. ---
  const rows = JSON.parse(
    await waitPanel(`(() => {
      const title = document.querySelector('.custompanel__grouptitle')?.textContent.trim()
      if (title !== 'Demo controls') return false
      const invalid = document.querySelector('.custompanel__row--invalid')
      if (!invalid) return false
      return JSON.stringify({
        scrub: [...document.querySelectorAll('.custompanel__rows .scrubinput__track')].map((e) => e.textContent),
        text: document.querySelector('.custompanel__input')?.value ?? null,
        select: document.querySelector('.custompanel__select')?.value ?? null,
        reason: invalid.querySelector('.custompanel__reason')?.textContent ?? null,
        hasRegen: !!invalid.querySelector('.custompanel__regen'),
        invalidCount: document.querySelectorAll('.custompanel__row--invalid').length
      })
    })()`)
  )
  if (!rows.scrub.some((t) => t.includes('1.5'))) {
    throw new Error(`number row should show the lexed 1.5: ${JSON.stringify(rows.scrub)}`)
  }
  if (rows.text !== 'Hello caption') throw new Error(`text row value: ${JSON.stringify(rows.text)}`)
  if (rows.select !== 'left') throw new Error(`select row value: ${JSON.stringify(rows.select)}`)
  if (rows.reason !== 'anchor not found') {
    throw new Error(`stale param reason: ${JSON.stringify(rows.reason)}`)
  }
  if (!rows.hasRegen) throw new Error('stale param has no Regenerate button')
  if (rows.invalidCount !== 1)
    throw new Error(`exactly one invalid row expected: ${rows.invalidCount}`)
  await shotIsland('custom-controls-island.png')

  // --- Scrub-cadence burst through the island api path: 3 applyLiteral commits
  // 250ms apart (CustomPanel's WRITE_THROTTLE_MS), all inside edit-history's
  // 500ms coalesce window. One island round trip so IPC latency can't stretch
  // the gaps.
  //
  // Paced against a fixed DEADLINE, and spinning rather than sleeping: a
  // renderer's setTimeout drifts hard when the Electron window isn't the
  // frontmost app (a 250ms timer measures ~450ms under Playwright here), which
  // alone stretches the burst past the 500ms window and makes this assert an
  // environment probe instead of a coalescing one. A fixed cadence is also the
  // faithful model — CustomPanel's throttle fires every WRITE_THROTTLE_MS
  // regardless of when the previous write resolved. ---
  const beforeBurst = readFileSync(styled, 'utf8')
  const burst = JSON.parse(
    await panelEval(`(async () => {
      const root = ${JSON.stringify(fixture)}
      const out = []
      const t0 = Date.now()
      const vals = [2, 2.5, 3]
      for (let i = 0; i < vals.length; i++) {
        while (Date.now() - t0 < i * 250) { /* spin — the only accurate wait here */ }
        out.push(await window.api.controls.applyLiteral(root, 'custom-demo', 'scale', vals[i]))
      }
      return JSON.stringify(out)
    })()`)
  )
  if (!Array.isArray(burst) || burst.length !== 3 || !burst.every((r) => r?.applied)) {
    throw new Error(`burst applies failed: ${JSON.stringify(burst)}`)
  }
  const afterBurst = readFileSync(styled, 'utf8')
  if (!/const DEMO_SCALE = 3\n/.test(afterBurst)) {
    throw new Error(
      `burst did not land 3 on disk; const line: ${afterBurst.match(/const DEMO_SCALE = [^\n]*/)?.[0]}`
    )
  }

  // --- Exactly ONE undo restores the pre-burst file — if the three commits
  // made separate entries, this lands on the 2.5 intermediate instead. ---
  const undid = await win.evaluate((a) => window.api.edits.undo(a.fixture), { fixture })
  if (!undid.ok) throw new Error(`undo not ok: ${JSON.stringify(undid)}`)
  if (readFileSync(styled, 'utf8') !== beforeBurst) {
    throw new Error('one undo did not restore the pre-burst source (burst not coalesced?)')
  }

  // --- UI-driven commit: a change on the REAL select routes CustomPanel →
  // applyParam → controls.applyLiteral; main renders the replacement literal
  // (JSON.stringify → double quotes). ---
  const changed = await panelEval(`(() => {
    const sel = document.querySelector('.custompanel__select')
    if (!sel) return false
    // React's onChange needs the native value setter + a 'change' event (a
    // plain .value assignment is swallowed by React's value tracker).
    const set = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set
    set.call(sel, 'center')
    sel.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  })()`)
  if (changed !== true) throw new Error('the Align select never rendered for the UI-driven commit')
  let afterSelect = ''
  for (let i = 0; i < 40; i++) {
    afterSelect = readFileSync(styled, 'utf8')
    if (afterSelect.includes('const DEMO_ALIGN = "center"')) break
    await new Promise((r) => setTimeout(r, 150))
  }
  if (!afterSelect.includes('const DEMO_ALIGN = "center"')) {
    throw new Error(
      `UI select commit not on disk; const line: ${afterSelect.match(/const DEMO_ALIGN = [^\n]*/)?.[0]}`
    )
  }
  const undoSelect = await win.evaluate((a) => window.api.edits.undo(a.fixture), { fixture })
  if (!undoSelect.ok) throw new Error(`undo (select) not ok: ${JSON.stringify(undoSelect)}`)
  if (readFileSync(styled, 'utf8') !== beforeBurst) {
    throw new Error('undo did not restore the pre-select source exactly')
  }

  // --- The store file is data, not a write target: applies + resolves must
  // leave it byte-identical (no clobber, no rewrite). ---
  if (readFileSync(storeFile, 'utf8') !== storeJson) {
    throw new Error('.praxis/control-panels.json was rewritten by apply/resolve')
  }

  // Tab hygiene (see prop-edit.mjs): direct `bun run test:*` runs share
  // userData, and Radix unmounts inactive tab content — leave the persisted
  // tab on Props so a stale 'custom' preference can't strand another suite.
  await app.evaluate(({ BrowserWindow }, request) => {
    BrowserWindow.getAllWindows()[0].webContents.send('controls:open', request)
  }, { root: fixture, source: TW_SRC, tab: 'styles', requestId: 'agent-styles-test' })
  await waitPanel("!!document.querySelector('[role=slider][aria-label=padding]')")
  const absentOpacity = await panelEval("!document.querySelector('[role=slider][aria-label=opacity]')")
  if (!absentOpacity) throw new Error('Browser-default opacity should be hidden')
  await shotIsland('30-authored-styles.png')
  await panelEval("[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Show all styles').click(); true")
  await waitPanel("!!document.querySelector('[role=slider][aria-label=opacity]')")

  await panelEval("localStorage.setItem('praxis.island.tab', 'props'); true")

  console.log(
    'CUSTOM-CONTROLS OK — canned manifest resolves (Custom tab trigger + fresh-lexed rows, ' +
      'stale anchor disabled with reason + Regenerate), applyLiteral burst lands + coalesces ' +
      'to one undo, UI-driven select commit, store file untouched'
  )
} catch (err) {
  console.error('CUSTOM-CONTROLS FAILED:', err?.message ?? err)
  process.exitCode = 1
} finally {
  writeFileSync(styled, original) // leave the fixture pristine
  rmSync(storeFile, { force: true })
  if (!hadPraxisDir) rmSync(praxisDir, { recursive: true, force: true })
  await app?.close()
}
