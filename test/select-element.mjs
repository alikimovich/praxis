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
  await win.waitForSelector('.empty__open', { timeout: 15000 })

  // Make the native folder picker return our fixture.
  await app.evaluate(async ({ dialog }, fixturePath) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [fixturePath] })
  }, fixture)

  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('menu:action', 'open-project'))

  // Wait until the project is running (titlebar shows the dev-server URL).
  await win.waitForFunction(
    () =>
      /http:\/\/(localhost|127\.0\.0\.1|\[::1\]):\d+/.test(
        document.querySelector('.previewbar__url')?.textContent ?? ''
      ),
    { timeout: 60000 }
  )

  // Turn on Select mode (the icon button; aria-pressed flips on).
  await win.click('button[aria-label="Select"]')
  await win.waitForSelector('button[aria-label="Select"][aria-pressed="true"]', { timeout: 5000 })

  // The active toggle must render a filled affordance (guards against the
  // .iconbtn.is-active rule being dead/shadowed) — not the transparent base.
  const activeBg = await win.evaluate(() => {
    const btn = document.querySelector('button[aria-label="Select"][aria-pressed="true"]')
    return btn ? getComputedStyle(btn).backgroundColor : null
  })
  if (!activeBg || activeBg === 'rgba(0, 0, 0, 0)' || activeBg === 'transparent') {
    throw new Error(`active Select button should render a filled background, got ${activeBg}`)
  }

  // Deliver a trusted click at the element's centre, retrying to absorb the
  // set-select-mode IPC round-trip (the preload may not be armed immediately,
  // and input delivery can lag when the window isn't focused under load).
  let picked = false
  for (let i = 0; i < 40 && !picked; i++) {
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

  // Hand off to chat: the selection rides as a PILL in the composer (the element
  // reference is prepended to the prompt invisibly on send) — the visible input
  // stays clean, no selector text is seeded.
  const composed = await win.inputValue('.composer__input')
  if (composed.includes('selected the') || composed.includes(EXPECTED_SOURCE)) {
    throw new Error(`composer must stay clean of selector text, got: ${composed}`)
  }
  // The element-scoped actions appear as a floating toolbar INSIDE the preview,
  // adjacent to the selection (comment/annotate/code/delete).
  const toolbarShown = await app.evaluate(async ({ webContents }) => {
    const wc = webContents
      .getAllWebContents()
      .find((w) => /^http:\/\/(localhost|127\.0\.0\.1|\[::1\]):\d+/.test(w.getURL()))
    if (!wc) return 'no-preview'
    return wc.executeJavaScript(`(() => {
      const host = document.querySelector('[data-dsgn-overlay]')
      const bar = host?.shadowRoot?.querySelector('[data-dsgn-toolbar]')
      if (!bar) return 'no-toolbar'
      if (getComputedStyle(bar).display === 'none') return 'hidden'
      return 'visible:' + [...bar.querySelectorAll('button')].map((b) => b.dataset.kind).join(',')
    })()`)
  })
  if (!/^visible:comment,annotate,code,delete$/.test(toolbarShown)) {
    throw new Error(`in-preview selection toolbar wrong: ${toolbarShown}`)
  }
  await win.screenshot({ path: join(artifacts, '07-select-handoff.png') })
  // The pill is removable — × clears the selection AND the in-preview toolbar.
  await win.click('.inspector__close')
  await win.waitForFunction(() => !window.__dsgnSelection.getState().selected, { timeout: 5000 })
  const toolbarAfter = await app.evaluate(async ({ webContents }) => {
    const wc = webContents
      .getAllWebContents()
      .find((w) => /^http:\/\/(localhost|127\.0\.0\.1|\[::1\]):\d+/.test(w.getURL()))
    return wc?.executeJavaScript(`(() => {
      const bar = document.querySelector('[data-dsgn-overlay]')?.shadowRoot?.querySelector('[data-dsgn-toolbar]')
      return bar ? getComputedStyle(bar).display : 'gone'
    })()`)
  })
  if (toolbarAfter !== 'none' && toolbarAfter !== 'gone') {
    throw new Error(`toolbar should hide when the pill is cleared, got: ${toolbarAfter}`)
  }
  // Re-select for the owner-jump flow below (the pick flow was proven above).
  await win.evaluate((src) => {
    window.__dsgnSelection.getState().setSelected({
      tag: 'h1', id: 'hero-title', classes: [], selector: '#hero-title',
      source: src, componentSource: null, text: 'Welcome',
      rect: { x: 0, y: 0, width: 0, height: 0 }, styles: {}
    })
  }, EXPECTED_SOURCE)

  // --- v8 F3a: click a host that carries a forwarded component-instance stamp.
  // The pick resolves to the host source; the inspector offers "edit owner", which
  // re-points the selection at the component-instance call site. ---
  const GET_AMOUNT = `(() => { const el = document.querySelector('#amount'); if (!el) return null;
    const b = el.getBoundingClientRect(); return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) }; })()`
  let pickedAmount = false
  for (let i = 0; i < 40 && !pickedAmount; i++) {
    const r = await app.evaluate(async ({ webContents }, code) => {
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
    }, GET_AMOUNT)
    if (r !== 'clicked') {
      await new Promise((res) => setTimeout(res, 300))
      continue
    }
    pickedAmount = await win
      .waitForFunction(
        () => document.querySelector('.inspector__source')?.textContent?.includes('src/ui/Field.tsx:4'),
        { timeout: 1000 }
      )
      .then(() => true)
      .catch(() => false)
  }
  if (!pickedAmount) throw new Error('inspector never showed the host source for #amount')

  // The store carries the forwarded component-instance source.
  const cs = await win.evaluate(() => window.__dsgnSelection.getState().selected?.componentSource)
  if (cs !== 'src/screens/Wallet.tsx:18') {
    throw new Error(`componentSource should be the instance call site, got "${cs}"`)
  }
  // The "edit owner component" affordance is offered, and re-points the selection.
  await win.waitForSelector('.inspector__owner', { timeout: 5000 })
  await win.click('.inspector__owner')
  await win.waitForFunction(
    () => window.__dsgnSelection.getState().selected?.source === 'src/screens/Wallet.tsx:18',
    { timeout: 5000 }
  )

  console.log('SELECT-ELEMENT OK — picked', EXPECTED_SOURCE, '→ selection pill (clean composer); F3a owner re-select')
} catch (err) {
  console.error('SELECT-ELEMENT FAILED:', err?.message ?? err)
  process.exitCode = 1
} finally {
  await app?.close()
}
