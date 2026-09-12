/**
 * Viewport is a PER-PROJECT choice. Selecting Mobile on one project must not
 * leak into the next: a fresh open starts at desktop, and switching between
 * warm projects restores each one's own viewport.
 *
 * Run with: bun run test:viewport
 */
import { _electron as electron } from 'playwright'
import electronPath from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdtempSync, cpSync, mkdirSync, writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { tmpdir } from 'node:os'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const fixtureA = join(root, 'test', 'fixtures', 'static-app')
// Second project = a copy of the fixture (distinct root → distinct workspace entry).
const fixtureB = mkdtempSync(join(tmpdir(), 'praxis-viewport-b-'))
cpSync(fixtureA, fixtureB, { recursive: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let app
let failed = false
try {
  app = await electron.launch({
    executablePath: electronPath,
    args: [join(root, 'out', 'main', 'index.js')],
    cwd: root
  })
  const win = await app.firstWindow()
  await win.waitForSelector('.empty__open', { timeout: 15000 })

  const openVia = async (path) => {
    await app.evaluate(async ({ dialog }, p) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [p] })
    }, path)
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].webContents.send('menu:action', 'open-project')
    )
  }
  // Port-agnostic: the runner takes the first FREE port ≥ 7777, so a live app
  // session (or anything else) squatting on 7777 must not fail the test. Wait
  // for any localhost URL in the bar (optionally different from the previous
  // project's) and remember it for the switch-back assertions.
  const URL_RE = /http:\/\/(?:localhost|127\.0\.0\.1|\[::1\]):\d+/
  const waitNewUrl = async (notUrl) => {
    await win.waitForFunction(
      (args) => {
        const t = document.querySelector('.previewbar__url')?.textContent ?? ''
        const m = t.match(/http:\/\/(?:localhost|127\.0\.0\.1|\[::1\]):\d+/)
        return !!m && (!args || m[0] !== args)
      },
      notUrl ?? null,
      { timeout: 60000 }
    )
    return await win.evaluate(() =>
      (document.querySelector('.previewbar__url')?.textContent ?? '').match(
        /http:\/\/(?:localhost|127\.0\.0\.1|\[::1\]):\d+/
      )[0]
    )
  }
  const waitUrl = (url) =>
    win.waitForFunction(
      (u) => (document.querySelector('.previewbar__url')?.textContent ?? '').includes(u),
      url,
      { timeout: 60000 }
    )
  const expect = async (label, want) => {
    await sleep(600)
    const got = await win.evaluate(() => ({
      store: window.__praxisViewport.getState().viewport,
      mobileDom: !!document.querySelector('.preview-slot--mobile')
    }))
    const ok = got.store === want && got.mobileDom === (want === 'mobile')
    if (!ok) {
      failed = true
      console.error(`  ✗ ${label}: want ${want}, got ${JSON.stringify(got)}`)
    }
  }
  const switchProject = async () => {
    const item = win.locator('.rail__item:not(.rail__item--active)')
    await item.locator('.rail__name-btn').click()
    await item.locator('.rail__chats button.rail__chat').first().click()
  }

  await openVia(fixtureA)
  const urlA = await waitNewUrl()
  await expect('A opens at desktop', 'desktop')

  // Read the actual native page, not the renderer's reserved rectangle.
  const nativeSize = () => app.evaluate(async ({ webContents }) => {
    const wc = webContents.getAllWebContents().find(w => /^http:\/\/(localhost|127\.0\.0\.1):/.test(w.getURL()))
    return wc.executeJavaScript(`(() => {
      const host = document.querySelector('[data-praxis-viewport-size]')
      const badge = host?.shadowRoot.firstElementChild
      return { text: badge?.textContent, visible: badge?.style.display === 'block',
        expected: innerWidth + 'px × ' + innerHeight + 'px' }
    })()`)
  })
  await sleep(1100)
  assert.equal((await nativeSize()).visible, false, 'readout hides while idle')
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]
    const [width, height] = w.getSize()
    w.setSize(width - 80, height - 60)
  })
  await sleep(200)
  const resized = await nativeSize()
  assert.equal(resized.visible, true)
  assert.equal(resized.text, resized.expected, 'native readout matches CSS viewport')
  const artifacts = join(root, 'test', 'artifacts')
  mkdirSync(artifacts, { recursive: true })
  const capture = await app.evaluate(async ({ webContents }) => {
    const wc = webContents.getAllWebContents().find(w => /^http:\/\/(localhost|127\.0\.0\.1):/.test(w.getURL()))
    return (await wc.capturePage()).toPNG().toString('base64')
  })
  writeFileSync(join(artifacts, 'viewport-size-native.png'), Buffer.from(capture, 'base64'))
  // Inject a responsive probe: its layout must change DURING the drag, and the
  // native view must remain visible rather than being replaced by a stretched PNG.
  await app.evaluate(async ({ webContents }) => {
    const wc = webContents.getAllWebContents().find(w => /^http:\/\/(localhost|127\.0\.0\.1):/.test(w.getURL()))
    await wc.executeJavaScript(`(() => {
      const style = document.createElement('style')
      style.textContent = '#resize-probe {display:grid;grid-template-columns:1fr 1fr;font:20px/1.5 sans-serif} @media(max-width:680px){#resize-probe{grid-template-columns:1fr}}'
      document.head.append(style)
      const probe = document.createElement('div')
      probe.id = 'resize-probe'
      probe.innerHTML = '<div>Responsive column one</div><div>Responsive column two</div>'
      document.body.replaceChildren(probe)
    })()`)
  })
  const divider = await win.locator('.divider').boundingBox()
  await win.mouse.move(divider.x + divider.width / 2, divider.y + 100)
  await win.mouse.down()
  await sleep(250)
  await win.mouse.move(divider.x + 140, divider.y + 100, { steps: 6 })
  await win.waitForFunction(() => {
    const badge = document.querySelector('[data-praxis-viewport-size]')?.shadowRoot.firstElementChild
    const rect = document.querySelector('.preview-slot').getBoundingClientRect()
    return badge?.style.display === 'block' && badge.textContent === `${Math.round(rect.width)}px × ${Math.round(rect.height)}px`
  })
  assert.equal(await win.locator('.preview-freeze').count(), 0, 'drag never creates a snapshot')
  await sleep(200)
  const live = await app.evaluate(async ({ BrowserWindow, webContents }) => {
    const wc = webContents.getAllWebContents().find(w => /^http:\/\/(localhost|127\.0\.0\.1):/.test(w.getURL()))
    const view = BrowserWindow.getAllWindows()[0].contentView.children.find(v => v.webContents?.id === wc.id)
    return {
      visible: view.getVisible(),
      layout: await wc.executeJavaScript(`({width: innerWidth, columns: getComputedStyle(document.querySelector('#resize-probe')).gridTemplateColumns, font: getComputedStyle(document.querySelector('#resize-probe')).fontSize})`),
      capture: (await wc.capturePage()).toPNG().toString('base64')
    }
  })
  assert.equal(live.visible, true, 'native preview stays visible while held')
  assert.ok(live.layout.width < 680, 'viewport shrinks before mouseup')
  assert.equal(live.layout.columns.split(' ').length, 1, 'media query reflows before mouseup')
  assert.equal(live.layout.font, '20px', 'text keeps its actual font size')
  writeFileSync(join(artifacts, 'viewport-size-drag.png'), Buffer.from(live.capture, 'base64'))
  // Reverse direction while still held to prove capture keeps delivering events.
  await win.mouse.move(divider.x - 60, divider.y + 100, { steps: 6 })
  await sleep(150)
  assert.equal(await win.locator('.preview-freeze').count(), 0)
  const wide = await app.evaluate(async ({ webContents }) => {
    const wc = webContents.getAllWebContents().find(w => /^http:\/\/(localhost|127\.0\.0\.1):/.test(w.getURL()))
    return wc.executeJavaScript(`getComputedStyle(document.querySelector('#resize-probe')).gridTemplateColumns`)
  })
  assert.equal(wide.split(' ').length, 2, 'reverse drag restores the wide layout before mouseup')
  await win.mouse.up()
  assert.equal(await win.evaluate(() => document.body.classList.contains('is-resizing')), false)
  // Lost focus (e.g. Cmd-Tab) must stop subsequent pointer moves.
  const afterDrag = await win.locator('.divider').boundingBox()
  await win.mouse.move(afterDrag.x, afterDrag.y + 100)
  await win.mouse.down()
  await win.evaluate(() => window.dispatchEvent(new Event('blur')))
  await win.mouse.move(afterDrag.x + 40, afterDrag.y + 100)
  await win.mouse.up()
  assert.equal(await win.evaluate(() => document.body.classList.contains('is-resizing')), false)
  assert.equal(Math.round((await win.locator('.divider').boundingBox()).x), Math.round(afterDrag.x))
  await sleep(1200)
  assert.equal((await nativeSize()).visible, false, 'readout disappears after resize')

  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.send('menu:action', 'viewport:mobile')
  )
  await expect('A toggles to mobile', 'mobile')

  await openVia(fixtureB)
  const urlB = await waitNewUrl(urlA)
  await expect('B opens at desktop (no leak from A)', 'desktop')

  await switchProject()
  await waitUrl(urlA)
  await expect('back on A: its mobile restored', 'mobile')

  await switchProject()
  await waitUrl(urlB)
  await expect('back on B: still desktop', 'desktop')

  if (failed) throw new Error('per-project viewport assertions failed')
  console.log('VIEWPORT-PER-PROJECT OK — mobile stays with its project; fresh opens start desktop')
} catch (err) {
  console.error('VIEWPORT-PER-PROJECT FAILED:', err?.message ?? err)
  process.exitCode = 1
} finally {
  await app?.close()
}
