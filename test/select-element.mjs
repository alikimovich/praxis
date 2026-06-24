/**
 * v2 select-element test — exercises the full click-to-select path end to end,
 * through the real IPC, without a human clicking the native preview:
 *
 *   open fixture → enable Select mode (renderer → main → preview preload) →
 *   dispatch a click on a stamped element inside the preview WebContentsView →
 *   main relays the pick → renderer shows the inspector with the resolved
 *   `data-dsgn-source` → "Ask dsgn to change this…" seeds the composer.
 *
 * The preview is a separate CDP target, so we reach it via the main process
 * (`webContents.executeJavaScript`) rather than the renderer page.
 *
 * Run with: bun run test:select
 */
import { _electron as electron } from 'playwright'
import electronPath from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdirSync } from 'node:fs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const fixture = join(root, 'test', 'fixtures', 'selectable-app')
const artifacts = join(root, 'test', 'artifacts')
mkdirSync(artifacts, { recursive: true })

const EXPECTED_SOURCE = 'src/components/Hero.tsx:7'

// Runs inside the preview WebContentsView's page: return the hero heading's
// centre point. We then deliver a *trusted* click there via sendInputEvent —
// the preload rejects synthetic (untrusted) DOM events, so a real input event
// is both required and a more faithful proxy for a user click.
const GET_CENTER = `(() => {
  const el = document.querySelector('#hero-title')
  if (!el) return null
  const b = el.getBoundingClientRect()
  return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) }
})()`

let app
try {
  app = await electron.launch({
    executablePath: electronPath,
    args: [join(root, 'out', 'main', 'index.js')],
    cwd: root
  })

  const win = await app.firstWindow()
  await win.waitForSelector('.btn', { timeout: 15000 })

  // Make the native folder picker return our fixture.
  await app.evaluate(async ({ dialog }, fixturePath) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [fixturePath] })
  }, fixture)

  await win.click('.btn')

  // Wait until the project is running (titlebar shows the localhost URL).
  await win.waitForFunction(
    () => document.querySelector('.titlebar__hint')?.textContent?.includes('localhost'),
    { timeout: 60000 }
  )

  // Turn on Select mode (exact text, not the "Selecting…" active label).
  await win.click('text="Select"')
  await win.waitForFunction(
    () => document.querySelector('[aria-pressed="true"]')?.textContent?.includes('Selecting'),
    { timeout: 5000 }
  )

  // The active toggle must actually render its blue affordance (guards against
  // the modifier rule being shadowed by the base .btn rule via source order).
  // Either active shade counts — #2563eb base or #1d4ed8 hover (cursor may rest
  // on the button after the click); the dead-CSS bug would give white/grey.
  const ACTIVE_BLUES = ['rgb(37, 99, 235)', 'rgb(29, 78, 216)']
  const activeBg = await win.evaluate(() => {
    const btn = document.querySelector('[aria-pressed="true"]')
    return btn ? getComputedStyle(btn).backgroundColor : null
  })
  if (!ACTIVE_BLUES.includes(activeBg)) {
    throw new Error(`active Select button should render blue (#2563eb/#1d4ed8), got ${activeBg}`)
  }

  // Deliver a trusted click at the element's centre, retrying to absorb the
  // set-select-mode IPC round-trip (the preload may not be armed immediately,
  // and input delivery can lag when the window isn't focused under load).
  let picked = false
  for (let i = 0; i < 40 && !picked; i++) {
    const result = await app.evaluate(async ({ webContents }, code) => {
      const wc = webContents
        .getAllWebContents()
        .find((w) => /^http:\/\/localhost:\d+/.test(w.getURL()))
      if (!wc) return 'no-preview'
      const c = await wc.executeJavaScript(code, true)
      if (!c) return 'no-element'
      wc.focus()
      wc.sendInputEvent({ type: 'mouseMove', x: c.x, y: c.y })
      wc.sendInputEvent({ type: 'mouseDown', x: c.x, y: c.y, button: 'left', clickCount: 1 })
      wc.sendInputEvent({ type: 'mouseUp', x: c.x, y: c.y, button: 'left', clickCount: 1 })
      return 'clicked'
    }, GET_CENTER)
    if (result !== 'clicked') {
      await new Promise((r) => setTimeout(r, 300))
      continue
    }
    picked = await win
      .waitForFunction(
        (src) => document.querySelector('.inspector__source')?.textContent?.includes(src),
        EXPECTED_SOURCE,
        { timeout: 1000 }
      )
      .then(() => true)
      .catch(() => false)
  }

  if (!picked) throw new Error('inspector never showed the picked element + its source')

  // The inspector should identify the element we clicked.
  const tag = (await win.textContent('.inspector__tag'))?.trim()
  if (tag !== 'h1#hero-title') throw new Error(`expected tag "h1#hero-title", got "${tag}"`)

  await win.screenshot({ path: join(artifacts, '06-select-element.png') })

  // Hand off to chat: the composer is seeded with the element + source ref.
  await win.click('.inspector__ask')
  await win.waitForFunction(
    (src) => window.__dsgnStore && document.querySelector('.composer__input')?.value?.includes(src),
    EXPECTED_SOURCE,
    { timeout: 5000 }
  )
  const composed = await win.inputValue('.composer__input')
  if (!composed.includes('h1#hero-title')) {
    throw new Error(`composer should reference the element, got: ${composed}`)
  }
  await win.screenshot({ path: join(artifacts, '07-select-handoff.png') })

  console.log('SELECT-ELEMENT OK — picked', EXPECTED_SOURCE, '→ seeded composer')
} catch (err) {
  console.error('SELECT-ELEMENT FAILED:', err?.message ?? err)
  process.exitCode = 1
} finally {
  await app?.close()
}
