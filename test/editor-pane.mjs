/**
 * Code mode's native editor view — the third `WebContentsView` (like the
 * preview). SELF-SKIPPING like the live tier (agent-e2e.mjs, sim-e2e.mjs):
 * a real cold start of code-server takes several seconds and needs a real
 * binary, so this only runs when DSGN_CODE_SERVER_BIN points at one.
 *
 * Assertions are made from the MAIN process via `app.evaluate` over
 * `BrowserWindow#contentView.children` (each a `View` with `.webContents`,
 * `.getVisible()`, `.getBounds()`) rather than renderer DOM — the editor view
 * is a separate CDP target, invisible to renderer page queries, exactly like
 * the preview (see CLAUDE.md's WebContentsView gotcha).
 *
 * Run with:
 *   DSGN_CODE_SERVER_BIN=<path to code-server binary> bun run test:editor-pane
 */

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import electronPath from 'electron'
import { _electron as electron } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const fixture = join(root, 'test', 'fixtures', 'static-app')

if (!process.env.DSGN_CODE_SERVER_BIN) {
  console.log('EDITOR-PANE SKIP — set DSGN_CODE_SERVER_BIN to a code-server binary')
  process.exit(0)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitFor(fn, predicate, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs
  let last
  for (;;) {
    last = await fn()
    if (predicate(last)) return last
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for ${label}; last=${JSON.stringify(last)}`)
    }
    await sleep(500)
  }
}

let app
try {
  app = await electron.launch({
    executablePath: electronPath,
    args: [join(root, 'out', 'main', 'index.js')],
    cwd: root
  })
  const win = await app.firstWindow()
  await win.waitForSelector('.empty__open', { timeout: 15000 })

  // Go through the real "Open project…" flow (dialog stub + menu action, as
  // open-preview.mjs does) rather than calling the workspace store directly —
  // a bare `openOrActivate` activates the workspace ENTRY but doesn't drive
  // `applyProject` (dev-server detect, `useSession.projectRoot`, …), so
  // Code mode's `projectRoot` gate in App.tsx never flips and EditorPane never
  // mounts.
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

  // Main-process view lookups: the editor view is whichever child's
  // webContents URL carries `?folder=` (code-server's workspace param); the
  // preview view is any localhost dev-server URL WITHOUT that param — both
  // can be `127.0.0.1:<port>` URLs, so the folder param is what disambiguates
  // them, not the host.
  const editorState = () =>
    app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]
      const view = win.contentView.children.find((c) =>
        c.webContents?.getURL().includes('folder=')
      )
      if (!view) return null
      return {
        url: view.webContents.getURL(),
        visible: view.getVisible(),
        bounds: view.getBounds()
      }
    })
  const previewState = () =>
    app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]
      const view = win.contentView.children.find(
        (c) =>
          c.webContents &&
          /^http:\/\/(localhost|127\.0\.0\.1|\[::1\]):\d+/.test(c.webContents.getURL()) &&
          !c.webContents.getURL().includes('folder=')
      )
      if (!view) return null
      return {
        url: view.webContents.getURL(),
        visible: view.getVisible(),
        bounds: view.getBounds()
      }
    })

  // Flip to Code mode via the store (not a DOM click — the brief's contract).
  await win.evaluate(() => window.__dsgnEditorMode.getState().setMode('code'))

  // Cold start of a real code-server process: vendored/overridden binary spawn
  // + HTTP readiness poll (editor.ts's READY_BUDGET_MS is 15s) + `editor.load`
  // navigating the view. Generous budget for a genuinely slow first boot.
  const ready = await waitFor(
    editorState,
    (s) => !!s && s.visible === true,
    90000,
    'editor view to become visible'
  )
  if (!ready.url.includes('?folder=')) {
    throw new Error(`editor view URL missing ?folder=: ${ready.url}`)
  }
  if (!(ready.bounds.width > 0 && ready.bounds.height > 0)) {
    throw new Error(`editor view visible but has empty bounds: ${JSON.stringify(ready.bounds)}`)
  }
  console.log('editor ready:', ready.url)

  // Flip back to Preview — the editor view must hide (EditorPane's unmount
  // effect zeroes bounds + calls setVisible(false)) and the preview view must
  // reclaim the slot (nonzero bounds, visible).
  await win.evaluate(() => window.__dsgnEditorMode.getState().setMode('preview'))

  const hiddenEditor = await waitFor(
    editorState,
    (s) => !!s && s.visible === false,
    15000,
    'editor view to hide'
  )
  if (!(hiddenEditor.bounds.width === 0 && hiddenEditor.bounds.height === 0)) {
    throw new Error(
      `hidden editor view should have zeroed bounds, got ${JSON.stringify(hiddenEditor.bounds)}`
    )
  }

  const reclaimedPreview = await waitFor(
    previewState,
    (s) => !!s && s.visible === true && s.bounds.width > 0 && s.bounds.height > 0,
    15000,
    'preview view to reclaim the slot'
  )
  console.log('preview reclaimed:', reclaimedPreview.url)

  console.log(
    'EDITOR-PANE OK — editor view opens/loads/shows a real code-server, then hides cleanly on switch back'
  )
} catch (err) {
  console.error('EDITOR-PANE FAILED:', err?.message ?? err)
  process.exitCode = 1
} finally {
  await app?.close()
}
