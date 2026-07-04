/**
 * Code drawer test (v9 phase 2) — the editable CodeMirror drawer under the
 * preview, through real IPC (no dev server, no auth needed):
 *
 *   source.write saves the whole file through commitEdit — refusing a stale
 *   baseline (conflict) and recording an undo step on success; edits.undo reverts
 *   it. The UI: the peek's "Edit" opens the drawer, CodeMirror mounts with the
 *   stamp span highlighted, the native preview reserves a bottom inset while it's
 *   open, and closing releases it.
 *
 * The fixture file is mutated then restored (write → undo) so the repo stays clean.
 *
 * Run with: bun run test:codedrawer
 */
import { _electron as electron } from 'playwright'
import electronPath from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdirSync, readFileSync } from 'node:fs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const fixture = join(root, 'test', 'fixtures', 'propedit-app')
const SRC = 'src/Badge.tsx:17'
const FILE = join(fixture, 'src', 'Badge.tsx')
const artifacts = join(root, 'test', 'artifacts')
mkdirSync(artifacts, { recursive: true })

const disk = () => readFileSync(FILE, 'utf8')

let app
const baseline = disk() // capture BEFORE anything runs, to restore on any exit
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

  // --- Engine: conflict guard — a stale baseline is refused, file untouched. ---
  const conflict = await win.evaluate(
    (a) => window.api.source.write(a.fixture, a.src, 'NOT THE REAL CONTENT', 'x'),
    { fixture, src: SRC }
  )
  if (conflict.ok || !conflict.conflict) throw new Error('stale baseline must conflict')
  if (disk() !== baseline) throw new Error('conflicting write must not touch the file')

  // --- Engine: a good save writes the whole file + records an undo step. ---
  const next = baseline + '\n// dsgn-drawer-test\n'
  const saved = await win.evaluate(
    (a) => window.api.source.write(a.fixture, a.src, a.baseline, a.next),
    { fixture, src: SRC, baseline, next }
  )
  if (!saved.ok) throw new Error(`save failed: ${saved.error ?? saved.conflict}`)
  if (disk() !== next) throw new Error('save did not write the new content')

  // A second save with the now-STALE original baseline must conflict (disk moved).
  const stale = await win.evaluate(
    (a) => window.api.source.write(a.fixture, a.src, a.baseline, a.baseline),
    { fixture, src: SRC, baseline }
  )
  if (stale.ok || !stale.conflict) throw new Error('second save with old baseline must conflict')

  // --- Engine: undo reverts the drawer save (F3b history). ---
  const undo = await win.evaluate((a) => window.api.edits.undo(a.fixture), { fixture })
  if (!undo.ok) throw new Error(`undo failed: ${JSON.stringify(undo)}`)
  if (disk() !== baseline) throw new Error('undo did not restore the file')

  // --- UI: select an element → the Code button opens the editor drawer. ---
  await win.evaluate(
    (args) => {
      window.__dsgnSession.getState().setProjectRoot(args.fixture)
      window.__dsgnSelection.getState().setSelected({
        tag: 'span',
        id: null,
        classes: ['badge'],
        selector: 'span.badge',
        source: args.src,
        componentSource: null,
        text: 'Ready',
        rect: { x: 0, y: 0, width: 0, height: 0 },
        styles: {}
      })
    },
    { fixture, src: SRC }
  )
  // JS-click (not Playwright's actionability click): a schema-backed selection
  // also opens the floating PropPanel, which can overlap the button in the small
  // test window (they live in different panes at real sizes).
  await win.waitForSelector('.inspector__codebtn', { timeout: 5000 })
  await win.$eval('.inspector__codebtn', (el) => el.click())

  // CodeMirror mounts, the stamp span is highlighted, and the bottom inset is reserved.
  await win.waitForSelector('.codedrawer .cm-editor', { timeout: 5000 })
  await win.waitForFunction(() => document.querySelectorAll('.codedrawer .cm-stamp-line').length > 0, undefined, {
    timeout: 5000
  })
  const bottom = await win.evaluate(() => window.__dsgnPanelInset.getState().bottom)
  if (!(bottom > 0)) throw new Error(`drawer did not reserve a bottom inset (got ${bottom})`)
  const drawerText = await win.$eval('.codedrawer .cm-content', (el) => el.textContent ?? '')
  if (!drawerText.includes('variant')) throw new Error('drawer did not load the file source')
  await win.screenshot({ path: join(artifacts, '13-code-drawer.png') })

  // Close releases the inset.
  await win.$eval('.codedrawer__close', (el) => el.click())
  await win.waitForFunction(() => window.__dsgnPanelInset.getState().bottom === 0, undefined, {
    timeout: 5000
  })
  if (await win.$('.codedrawer')) throw new Error('drawer did not unmount on close')

  if (disk() !== baseline) throw new Error('fixture left modified')
  console.log('CODE-DRAWER OK — conflict guard + save + undo, drawer mount/inset/close')
} catch (err) {
  console.error('CODE-DRAWER FAILED:', err?.message ?? err)
  process.exitCode = 1
} finally {
  // Belt-and-suspenders: restore the fixture even if an assertion left it dirty.
  try {
    const { writeFileSync } = await import('node:fs')
    if (disk() !== baseline) writeFileSync(FILE, baseline)
  } catch {
    /* ignore */
  }
  await app?.close()
}
