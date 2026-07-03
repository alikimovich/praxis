/**
 * Code peek test — the inspector's "view the source right here" slice, through
 * real IPC (no dev server, no auth needed):
 *
 *   source.read resolves the stamped file + the element's line span (single- and
 *   multi-line, root-escape refused); the Inspector's Code toggle renders the
 *   highlighted, line-numbered peek scrolled to the stamp; openInEditor fails
 *   soft on a bad stamp instead of throwing.
 *
 * Run with: bun run test:codepeek
 */
import { _electron as electron } from 'playwright'
import electronPath from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdirSync } from 'node:fs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const fixture = join(root, 'test', 'fixtures', 'propedit-app')
const SRC = 'src/Badge.tsx:17' // the <Badge …> usage line (single-line element)
const artifacts = join(root, 'test', 'artifacts')
mkdirSync(artifacts, { recursive: true })

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

  // --- Engine: source.read returns the file + stamp line + element span. ---
  const view = await win.evaluate((a) => window.api.source.read(a.fixture, a.src), {
    fixture,
    src: SRC
  })
  if (!view) throw new Error('source.read returned null')
  if (view.file !== 'src/Badge.tsx') throw new Error(`file: ${view.file}`)
  if (view.line !== 17) throw new Error(`line: ${view.line}`)
  if (!view.code.includes('interface BadgeProps')) throw new Error('code missing file content')
  if (view.elementStart !== 17 || view.elementEnd !== 17) {
    throw new Error(`single-line span: ${view.elementStart}..${view.elementEnd} (expected 17..17)`)
  }

  // Multi-line element (Tall's <div>, lines 83–85): the span covers open→close.
  const tall = await win.evaluate((a) => window.api.source.read(a.fixture, a.src), {
    fixture,
    src: 'src/Badge.tsx:83'
  })
  if (tall?.elementStart !== 83 || tall?.elementEnd !== 85) {
    throw new Error(`multi-line span: ${tall?.elementStart}..${tall?.elementEnd} (expected 83..85)`)
  }

  // Root-escape refused: a stamp pointing outside the project reads nothing.
  const escape = await win.evaluate(
    (a) => window.api.source.read(a.fixture, '../../package.json:1'),
    { fixture }
  )
  if (escape !== null) throw new Error('source.read must refuse paths outside the root')

  // openInEditor fails soft (never throws) on an unresolvable stamp.
  const badOpen = await win.evaluate((a) => window.api.source.openInEditor(a.fixture, 'nope'), {
    fixture
  })
  if (badOpen.ok) throw new Error('openInEditor should fail on an unresolvable stamp')

  // --- UI: select an element → Code toggle → highlighted peek renders. ---
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
  await win.waitForSelector('.inspector__codebtn', { timeout: 5000 })
  await win.click('.inspector__codebtn')
  await win.waitForSelector('.codepeek__code', { timeout: 5000 })

  const peekText = await win.$eval('.codepeek__code', (el) => el.textContent ?? '')
  if (!peekText.includes('variant="ok"')) {
    throw new Error('peek does not show the stamped line’s source')
  }
  const highlighted = await win.$$eval('.codepeek__code .hljs-keyword', (ns) => ns.length)
  if (highlighted === 0) throw new Error('no syntax highlighting in the peek')
  const gutterLast = await win.$eval(
    '.codepeek__gutter',
    (el) => (el.textContent ?? '').trim().split('\n').at(-1)
  )
  const stamp = await win.$eval('.codepeek', (el) => el.getAttribute('data-stamp-line'))
  if (stamp !== '17') throw new Error(`data-stamp-line: ${stamp}`)
  // Auto-scroll happened: the stamp line (17) was brought toward the viewport
  // (the scroll effect runs a paint after the peek mounts — poll for it).
  await win.waitForFunction(
    () => (document.querySelector('.codepeek__scroll')?.scrollTop ?? 0) > 0,
    undefined,
    { timeout: 5000 }
  )
  await win.screenshot({ path: join(artifacts, '12-code-peek.png') })

  console.log(
    `CODE-PEEK OK — read + spans + escape guard, UI peek (${gutterLast} lines, scrolled to 17)`
  )
} catch (err) {
  console.error('CODE-PEEK FAILED:', err?.message ?? err)
  process.exitCode = 1
} finally {
  await app?.close()
}
