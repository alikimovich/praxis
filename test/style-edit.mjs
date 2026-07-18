/**
 * v10 Styles-tab test — exercises the island's Styles tab + the styles engine
 * end to end through real IPC on a real preview (no auth needed):
 *
 *   open the propedit fixture as a project (its static server serves stamped
 *   HTML) → click-select the Tailwind element → the island's Styles tab renders
 *   the four control groups → `styles.apply` padding-top 13px commits an S1
 *   class rewrite (`pt-[13px]` lands in src/Styled.tsx) → `styles.preview`
 *   injects a live override the preview's computed style reflects (and
 *   clearPreview reverts exactly) → select the inline-styled element →
 *   `styles.apply` merges `paddingTop: "11px"` into its `style={{…}}` literal
 *   (S2) → one `edits.undo` restores the file → island screenshots.
 *
 * Run with: bun run test:style-edit
 */
import { _electron as electron } from 'playwright'
import electronPath from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const fixture = join(root, 'test', 'fixtures', 'propedit-app')
const styled = join(fixture, 'src', 'Styled.tsx')
const TW_SRC = 'src/Styled.tsx:5' // <div className="p-4 rounded-md"> in TwCard
const INLINE_SRC = 'src/Styled.tsx:9' // <div style={{ padding: '8px' }}> in InlineCard
const artifacts = join(root, 'test', 'artifacts')
mkdirSync(artifacts, { recursive: true })

const original = readFileSync(styled, 'utf8')

let app
try {
  app = await electron.launch({
    executablePath: electronPath,
    args: [join(root, 'out', 'main', 'index.js')],
    cwd: root
  })
  const win = await app.firstWindow()
  await win.waitForSelector('.empty__open', { timeout: 15000 })

  // The Styles tab lives in the floating ISLAND (its own webContents,
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
  // Open the island on the Styles tab and wait for its groups. Re-asserts
  // setOpen + the tab click each poll: a straggler click from pickElement's
  // retry loop (input delivery lags when the window is unfocused) can arrive
  // AFTER the first setOpen and close the island again (a fresh pick resets it).
  const openStylesTab = async () => {
    const end = Date.now() + 20000
    for (;;) {
      await win.evaluate(() => window.__dsgnPropsIsland.getState().setOpen(true))
      await expandPanel()
      // Radix TabsTrigger activates on mousedown (a bare .click() only fires click).
      const ok = await panelEval(`(() => {
        const t = [...document.querySelectorAll('.proppanel__tab')].find((b) => b.textContent.trim() === 'Styles')
        if (t) {
          for (const type of ['mousedown', 'mouseup', 'click']) {
            t.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 }))
          }
        }
        return document.querySelectorAll('.stylepanel__grouptitle').length >= 4
      })()`)
      if (ok === true) return
      if (Date.now() > end) throw new Error('the Styles tab never rendered its groups')
      await new Promise((r) => setTimeout(r, 300))
    }
  }

  // Run `code` inside the PREVIEW WebContentsView (a separate CDP target —
  // reachable only via the main process).
  const previewEval = (code) =>
    app.evaluate(async ({ webContents }, c) => {
      const wc = webContents
        .getAllWebContents()
        .find((w) => /^http:\/\/(localhost|127\.0\.0\.1|\[::1\]):\d+/.test(w.getURL()))
      if (!wc) return '__no_preview__'
      try { return await wc.executeJavaScript(c, true) } catch { return '__no_preview__' }
    }, code)

  // Click-select a stamped element in the preview via TRUSTED input events (the
  // preload rejects synthetic DOM events), retrying until the inspector shows it.
  const pickElement = async (domId, source) => {
    const getCenter = `(() => {
      const el = document.querySelector(${JSON.stringify('#' + domId)})
      if (!el) return null
      const b = el.getBoundingClientRect()
      return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) }
    })()`
    for (let i = 0; i < 40; i++) {
      const result = await app.evaluate(async ({ webContents }, code) => {
        const wc = webContents
          .getAllWebContents()
          .find((w) => /^http:\/\/(localhost|127\.0\.0\.1|\[::1\]):\d+/.test(w.getURL()))
        if (!wc) return 'no-preview'
        const c = await wc.executeJavaScript(code, true)
        if (!c) return 'no-element'
        wc.focus()
        wc.sendInputEvent({ type: 'mouseMove', x: c.x, y: c.y })
        wc.sendInputEvent({ type: 'mouseDown', x: c.x, y: c.y, button: 'left', clickCount: 1 })
        wc.sendInputEvent({ type: 'mouseUp', x: c.x, y: c.y, button: 'left', clickCount: 1 })
        return 'clicked'
      }, getCenter)
      if (result === 'clicked') {
        const ok = await win
          .waitForFunction(
            (src) => document.querySelector('.inspector__source')?.textContent?.includes(src),
            source,
            { timeout: 1000 }
          )
          .then(() => true)
          .catch(() => false)
        if (ok) return
      }
      await new Promise((r) => setTimeout(r, 300))
    }
    throw new Error(`inspector never showed ${source} after clicking #${domId}`)
  }

  // Save the island's own pixels (it's a WebContentsView — absent from
  // renderer-page screenshots).
  const shotIsland = async (name) => {
    const b64 = await app.evaluate(async ({ webContents }) => {
      const wc = webContents.getAllWebContents().find((w) => w.getURL().includes('dsgnPanel'))
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

  // --- Select the Tailwind element with a real click. ---
  await win.click('button[aria-label="Select"]')
  await win.waitForSelector('button[aria-label="Select"][aria-pressed="true"]', { timeout: 5000 })
  await pickElement('tw-box', TW_SRC)

  // --- Open the island and switch to the Styles tab; all four v1 groups render. ---
  await openStylesTab()
  const groups = await panelEval(
    "[...document.querySelectorAll('.stylepanel__grouptitle')].map((e) => e.textContent.trim())"
  )
  for (const g of ['Layout', 'Appearance', 'Typography', 'Transition']) {
    if (!groups.includes(g)) throw new Error(`Styles group "${g}" missing; got ${JSON.stringify(groups)}`)
  }
  // …with a linked padding scrub row showing the FRESH computed value (16px
  // from .p-4 — proves the styles:read round trip into the sandboxed preload).
  await waitPanel(
    "[...document.querySelectorAll('.stylepanel__sides .scrubinput__track')].some((e) => e.textContent.includes('16'))"
  )
  await shotIsland('style-edit-island.png')

  // --- S1 commit: the exact call ScrubInput's commit path makes. With the
  // element's utility classes, padding-top 13px must land as a Tailwind
  // arbitrary-value class rewrite in source (13 ∉ the 4px scale). ---
  const twRes = await panelEval(
    `window.api.styles.apply(${JSON.stringify(fixture)}, {
      source: ${JSON.stringify(TW_SRC)},
      prop: 'padding-top',
      value: '13px',
      classes: ['p-4', 'rounded-md']
    })`
  )
  if (!twRes?.applied || twRes.strategy !== 'tailwind') {
    throw new Error(`tailwind apply failed: ${JSON.stringify(twRes)}`)
  }
  const afterTw = readFileSync(styled, 'utf8')
  // The v1 engine commits the padding-top LONGHAND: its Tailwind family is
  // `pt-*`, so with no pt-* class present the rewrite appends `pt-[13px]`
  // (`p-4` is the shorthand family and stays — the longhand wins in Tailwind's
  // cascade). A literal `p-[13px]` could only come from the `padding` shorthand,
  // which is outside STYLE_PROPS.
  if (!afterTw.includes('className="p-4 rounded-md pt-[13px]"')) {
    throw new Error(`S1 class rewrite not on disk; className line: ${afterTw.match(/className="[^"]*"/)?.[0]}`)
  }

  // --- Live preview: styles:preview injects an override the preview's computed
  // style reflects; clearPreview restores the exact prior value. ---
  await panelEval("window.api.styles.preview('padding-top', '33px'); true")
  const readPad = () =>
    previewEval(
      "getComputedStyle(document.querySelector('#tw-box')).getPropertyValue('padding-top')"
    )
  let padNow = ''
  for (let i = 0; i < 20 && padNow !== '33px'; i++) {
    padNow = await readPad()
    if (padNow !== '33px') await new Promise((r) => setTimeout(r, 150))
  }
  if (padNow !== '33px') throw new Error(`live preview did not inject padding-top 33px, computed: ${padNow}`)
  // …and the panel's fresh-read seam sees the override too.
  const readBack = await panelEval("window.api.styles.read(['padding-top'])")
  if (readBack?.['padding-top'] !== '33px') {
    throw new Error(`styles.read should see the live override: ${JSON.stringify(readBack)}`)
  }
  await panelEval('window.api.styles.clearPreview(); true')
  let padAfter = ''
  for (let i = 0; i < 20 && padAfter !== '16px'; i++) {
    padAfter = await readPad()
    if (padAfter !== '16px') await new Promise((r) => setTimeout(r, 150))
  }
  if (padAfter !== '16px') throw new Error(`clearPreview did not restore padding-top, computed: ${padAfter}`)

  // --- Select the inline-styled element; S2 must merge into its style object. ---
  await pickElement('inline-box', INLINE_SRC)
  // A fresh pick closes the island — reopen on the new selection.
  await openStylesTab()
  await shotIsland('style-edit-island-inline.png')

  const beforeInline = readFileSync(styled, 'utf8')
  const inlineRes = await panelEval(
    `window.api.styles.apply(${JSON.stringify(fixture)}, {
      source: ${JSON.stringify(INLINE_SRC)},
      prop: 'padding-top',
      value: '11px',
      classes: []
    })`
  )
  if (!inlineRes?.applied || inlineRes.strategy !== 'inline') {
    throw new Error(`inline apply failed: ${JSON.stringify(inlineRes)}`)
  }
  const afterInline = readFileSync(styled, 'utf8')
  if (!afterInline.includes(`style={{ padding: '8px', paddingTop: "11px" }}`)) {
    throw new Error(`S2 style-object merge not on disk; style line: ${afterInline.match(/style=\{\{[^}]*\}\}/)?.[0]}`)
  }

  // --- Undo (real IPC): one step reverts the inline splice exactly. ---
  const undid = await win.evaluate((a) => window.api.edits.undo(a.fixture), { fixture })
  if (!undid.ok) throw new Error(`undo not ok: ${JSON.stringify(undid)}`)
  if (readFileSync(styled, 'utf8') !== beforeInline) {
    throw new Error('undo did not restore the pre-splice source')
  }

  console.log(
    'STYLE-EDIT OK — Styles tab groups + fresh read, S1 tailwind rewrite (pt-[13px]), ' +
      'live preview inject/clear, S2 inline merge, undo'
  )
} catch (err) {
  console.error('STYLE-EDIT FAILED:', err?.message ?? err)
  process.exitCode = 1
} finally {
  writeFileSync(styled, original) // leave the fixture pristine
  await app?.close()
}
