import { _electron as electron } from 'playwright'
import electronPath from 'electron'
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const artifacts = join(root, 'test/artifacts')
mkdirSync(artifacts, { recursive: true })
const app = await electron.launch({ executablePath: electronPath, args: [join(root, 'out/main/index.js')], cwd: root })
try {
  const page = await app.firstWindow()
  await page.waitForSelector('[data-startup-intro]')
  assert.equal(await page.locator('.empty__open').count(), 0, 'intro appears before the app')
  assert.equal(await page.locator('[data-startup-intro] .pixel').count(), 21)
  const centered = await page.locator('[data-startup-intro] svg').evaluate(el => {
    const r = el.getBoundingClientRect()
    return Math.abs(r.x + r.width / 2 - innerWidth / 2) < 1 && Math.abs(r.y + r.height / 2 - innerHeight / 2) < 1
  })
  assert.ok(centered, 'cat is centered in the window')
  await page.waitForFunction(() => document.getAnimations().some(a => a.currentTime >= 1700))
  await page.screenshot({ path: join(artifacts, 'startup-intro-revealing.png') })
  await page.waitForFunction(() => document.getAnimations().some(a => a.currentTime >= 3800))
  await page.screenshot({ path: join(artifacts, 'startup-intro-complete.png') })
  await page.waitForFunction(() => {
    const intro = document.querySelector('[data-startup-intro][data-phase="fade"]')
    const ui = document.querySelector('[data-startup-ui]')
    return intro && ui && Number(getComputedStyle(intro).opacity) < 0.8 && Number(getComputedStyle(ui).opacity) > 0.2
  })
  const fade = await page.evaluate(() => ({
    cat: Number(getComputedStyle(document.querySelector('[data-startup-intro]')).opacity),
    ui: Number(getComputedStyle(document.querySelector('[data-startup-ui]')).opacity),
    pixels: [...document.querySelectorAll('[data-startup-intro] .pixel')].every(p => p.style.opacity === '1')
  }))
  assert.ok(fade.cat > 0 && fade.cat < 1 && fade.ui > 0 && fade.ui < 1, 'cat and UI crossfade together')
  assert.ok(fade.pixels, 'completed cat remains sharp during fade')
  await page.screenshot({ path: join(artifacts, 'startup-crossfade.png') })
  await page.waitForSelector('[data-startup-intro]', { state: 'detached' })
  await page.waitForSelector('.empty__open', { timeout: 10000 })
  assert.equal(await page.locator('[data-startup-intro]').count(), 0)
  assert.equal(await page.evaluate(() => document.getAnimations().filter(a => a.effect?.target?.classList?.contains('pixel')).length), 0)
  await app.evaluate(({ dialog, BrowserWindow }, fixture) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [fixture] })
    BrowserWindow.getAllWindows()[0].webContents.send('menu:action', 'open-project')
  }, join(root, 'test/fixtures/static-app'))
  await page.waitForFunction(() => document.querySelector('.previewbar__url')?.textContent.includes('http'))
  await page.reload()
  await page.waitForSelector('[data-startup-intro]')
  const previewWidth = await app.evaluate(({ BrowserWindow }) => {
    const preview = BrowserWindow.getAllWindows()[0].contentView.children.find(v => v.webContents?.getURL().startsWith('http://127.0.0.1:'))
    return preview?.getBounds().width
  })
  assert.equal(previewWidth, 0, 'existing native preview cannot cover the intro on reload')
  await page.waitForSelector('[data-startup-intro][data-phase="fade"]')
  const fadingPreviewWidth = await app.evaluate(({ BrowserWindow }) => {
    const preview = BrowserWindow.getAllWindows()[0].contentView.children.find(v => v.webContents?.getURL().startsWith('http://127.0.0.1:'))
    return preview?.getBounds().width
  })
  assert.equal(fadingPreviewWidth, 0, 'restored native preview stays behind the entire crossfade')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  // Media-query change listeners and the React commit run asynchronously.
  await page.waitForSelector('[data-startup-intro]', { state: 'detached', timeout: 1000 })
  await page.waitForSelector('.pane--chat', { timeout: 3000 })
  assert.equal(await page.locator('[data-startup-intro]').count(), 0, 'changing reduced motion ends intro')
  await page.reload()
  await page.waitForSelector('.pane--chat', { timeout: 3000 })
  assert.equal(await page.locator('[data-startup-intro]').count(), 0, 'reduced motion skips intro')
  console.log('STARTUP-INTRO OK — centered 21-piece reveal, app handoff, cleanup, reduced motion')
} finally {
  await app.close()
}
