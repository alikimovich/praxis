/**
 * The agent must know what page is currently shown in the preview (link
 * clicks, SPA route changes) — before this, that location only lived in
 * PreviewUrl.tsx's local component state and never reached the chat. Now
 * main's `preview:url-changed` (did-navigate / did-navigate-in-page) is
 * mirrored into a global store (usePreviewLocation), and the composer
 * prepends it as hidden context on every send — same pattern as the
 * selected-element pill.
 *
 * Run with: bun run test:preview-location
 */
import { _electron as electron } from 'playwright'
import electronPath from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

let app
try {
  app = await electron.launch({
    executablePath: electronPath,
    args: [join(root, 'out', 'main', 'index.js')],
    cwd: root
  })
  const win = await app.firstWindow()
  await win.waitForSelector('.empty__open', { timeout: 15000 })
  const key = await win.evaluate(() =>
    window.__dsgnWorkspace.getState().openOrActivate('/tmp/dsgn-test-project')
  )
  await win.waitForSelector('.composer__input', { timeout: 15000 })

  const assert = (cond, msg) => {
    if (!cond) throw new Error(msg)
  }

  // Give the project a dev-server base so the helper can relativize against it.
  await win.evaluate((k) => {
    window.__dsgnWorkspace.getState().patchEntry(k, { url: 'http://localhost:5173' })
  }, key)

  // Nothing shown yet — no navigation reported, no hidden prefix.
  const before = await win.evaluate(() => window.__dsgnPreviewLocation.getState().url)
  assert(before === null, `expected no preview location yet, got ${before}`)
  const emptyPrefix = await win.evaluate(() =>
    window.__dsgnDescribePreviewLocationForPrompt('http://localhost:5173')
  )
  assert(emptyPrefix === '', `expected empty prefix before any navigation, got "${emptyPrefix}"`)

  // Main reports a navigation (mirrors did-navigate / did-navigate-in-page).
  await app.evaluate(({ BrowserWindow }, url) => {
    BrowserWindow.getAllWindows()[0].webContents.send('preview:url-changed', url)
  }, 'http://localhost:5173/about?tab=team')
  await win.waitForFunction(() => window.__dsgnPreviewLocation.getState().url !== null)

  const url = await win.evaluate(() => window.__dsgnPreviewLocation.getState().url)
  assert(url === 'http://localhost:5173/about?tab=team', `store should mirror the reported url, got ${url}`)

  // The helper relativizes against the project's dev-server origin.
  const prefix = await win.evaluate(() =>
    window.__dsgnDescribePreviewLocationForPrompt('http://localhost:5173')
  )
  assert(
    prefix === 'The preview is currently showing /about?tab=team. ',
    `unexpected prefix: "${prefix}"`
  )

  // A different origin (base didn't match) falls back to the full URL.
  const otherOriginPrefix = await win.evaluate(() =>
    window.__dsgnDescribePreviewLocationForPrompt('http://localhost:9999')
  )
  assert(
    otherOriginPrefix === 'The preview is currently showing http://localhost:5173/about?tab=team. ',
    `unexpected cross-origin prefix: "${otherOriginPrefix}"`
  )

  // The composer actually sends this prefix ahead of the user's typed text —
  // spy on window.api.agent.send (not frozen by contextBridge) rather than
  // needing a real provider turn.
  await win.evaluate(() => {
    window.__sendCalls = []
    window.api.agent.send = (text, images) => {
      window.__sendCalls.push({ text, images })
      return Promise.resolve()
    }
  })
  await win.fill('.composer__input', 'make the heading bigger')
  await win.click('.composer__send')
  await win.waitForFunction(() => window.__sendCalls?.length > 0)
  const sent = await win.evaluate(() => window.__sendCalls[0].text)
  assert(
    sent === 'The preview is currently showing /about?tab=team. make the heading bigger',
    `composer should prepend the page context, got "${sent}"`
  )
  // The visible transcript must stay clean — only the user's own words.
  const shown = await win.evaluate(() => window.__dsgnStore.getState().messages.at(-1).text)
  assert(shown === 'make the heading bigger', `transcript should hide the prefix, got "${shown}"`)

  console.log('PREVIEW-LOCATION OK — store mirrors navigation; composer prepends it as hidden context')
} catch (err) {
  console.error('PREVIEW-LOCATION FAILED:', err?.message ?? err)
  process.exitCode = 1
} finally {
  await app?.close()
}
