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
import { mkdtempSync, cpSync } from 'node:fs'
import { tmpdir } from 'node:os'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const fixtureA = join(root, 'test', 'fixtures', 'static-app')
// Second project = a copy of the fixture (distinct root → distinct workspace entry).
const fixtureB = mkdtempSync(join(tmpdir(), 'dsgn-viewport-b-'))
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
  const waitUrl = (port) =>
    win.waitForFunction(
      (p) => (document.querySelector('.previewbar__url')?.textContent ?? '').includes(`:${p}`),
      port,
      { timeout: 60000 }
    )
  const expect = async (label, want) => {
    await sleep(600)
    const got = await win.evaluate(() => ({
      store: window.__dsgnViewport.getState().viewport,
      mobileDom: !!document.querySelector('.preview-slot--mobile')
    }))
    const ok = got.store === want && got.mobileDom === (want === 'mobile')
    if (!ok) {
      failed = true
      console.error(`  ✗ ${label}: want ${want}, got ${JSON.stringify(got)}`)
    }
  }
  const switchProject = () =>
    win.click(
      '.rail__item:not(.rail__item--active) .rail__open, .rail__chip:not(.rail__chip--active)'
    )

  await openVia(fixtureA)
  await waitUrl(7777)
  await expect('A opens at desktop', 'desktop')

  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.send('menu:action', 'viewport:mobile')
  )
  await expect('A toggles to mobile', 'mobile')

  await openVia(fixtureB)
  await waitUrl(7778)
  await expect('B opens at desktop (no leak from A)', 'desktop')

  await switchProject()
  await waitUrl(7777)
  await expect('back on A: its mobile restored', 'mobile')

  await switchProject()
  await waitUrl(7778)
  await expect('back on B: still desktop', 'desktop')

  if (failed) throw new Error('per-project viewport assertions failed')
  console.log('VIEWPORT-PER-PROJECT OK — mobile stays with its project; fresh opens start desktop')
} catch (err) {
  console.error('VIEWPORT-PER-PROJECT FAILED:', err?.message ?? err)
  process.exitCode = 1
} finally {
  await app?.close()
}
