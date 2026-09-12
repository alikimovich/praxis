/**
 * Visual + behavioral check for the collapsible projects rail (LKM-16):
 *  - the rail stays MOUNTED when collapsed (so it can animate), gaining
 *    `.rail--collapsed` and animating its width toward 0;
 *  - the floating `.sidebar-toggle` toggles `collapsed` state;
 *  - the toggle renders LAST inside `.panes` (after `.pane--preview`) so its
 *    no-drag region wins over the chat pane's drag strip when collapsed.
 * Screenshots land in test/artifacts/ for eyeballing the slide.
 */

import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import electronPath from 'electron'
import { _electron as electron } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const fixture = join(root, 'test', 'fixtures', 'static-app')
const artifacts = join(root, 'test', 'artifacts')
mkdirSync(artifacts, { recursive: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let app
try {
  app = await electron.launch({
    executablePath: electronPath,
    args: [join(root, 'out', 'main', 'index.js')],
    cwd: root
  })
  const win = await app.firstWindow()
  await win.waitForSelector('.empty__open', { timeout: 15000 })

  await app.evaluate(async ({ dialog }, fixturePath) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [fixturePath] })
  }, fixture)
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.send('menu:action', 'open-project')
  )

  await win.waitForSelector('.rail', { timeout: 60000 })
  await win.waitForSelector('.sidebar-toggle', { timeout: 5000 })
  await win.waitForSelector('.rail__chat', { timeout: 60000 })
  await sleep(300) // settle project initialization and its initial icon state

  // User artwork remains mounted while its actual SVG paths interpolate.
  const sidebarIcon = win.locator('.sidebar-toggle .praxis-icon--sidebar')
  const folderIcon = win.locator('.rail__folder.praxis-icon--folder').first()
  await folderIcon.waitFor()
  await win.waitForFunction(
    () => document.querySelector('.rail__folder.praxis-icon--folder')?.dataset.state === 'open'
  )
  async function verifyMorph(icon, trigger, target) {
    console.log('Checking morph', await icon.getAttribute('data-icon'), 'to', target)
    const node = await icon.elementHandle()
    const before = await icon.evaluate((svg) =>
      Array.from(svg.children, (p) => getComputedStyle(p).d)
    )
    await trigger()
    await icon.evaluate(
      (svg, target) =>
        new Promise((resolve, reject) => {
          if (svg.dataset.state === target) return resolve()
          const timer = setTimeout(() => {
            observer.disconnect()
            reject(new Error(`Icon stayed ${svg.dataset.state}, expected ${target}`))
          }, 1000)
          const observer = new MutationObserver(() => {
            if (svg.dataset.state === target) {
              clearTimeout(timer)
              observer.disconnect()
              resolve()
            }
          })
          observer.observe(svg, { attributes: true })
        }),
      target
    )
    const state = await icon.getAttribute('data-state')
    if (state !== target) throw new Error(`Expected icon state ${target}, got ${state}`)
    const moving = await icon.evaluate((svg) => ({
      same: svg.isConnected,
      animations: svg.getAnimations({ subtree: true }).filter((a) => a.transitionProperty === 'd')
        .length
    }))
    if (!moving.same || !moving.animations)
      throw new Error('Icon did not morph its mounted SVG paths')
    await sleep(300)
    const after = await icon.evaluate((svg) =>
      Array.from(svg.children, (p) => getComputedStyle(p).d)
    )
    if (JSON.stringify(before) === JSON.stringify(after))
      throw new Error('Icon geometry did not change')
    if (!(await node.evaluate((svg) => svg.isConnected)))
      throw new Error('Icon remounted during transition')
  }
  await verifyMorph(folderIcon, () => win.locator('.rail__glyph-btn').first().click(), 'closed')
  await verifyMorph(folderIcon, () => win.locator('.rail__glyph-btn').first().click(), 'open')
  const visibleWhileHovered = await folderIcon.evaluate((svg) => getComputedStyle(svg).opacity)
  if (visibleWhileHovered !== '1') throw new Error('Folder animation hidden behind hover chevron')
  await win.screenshot({ path: join(artifacts, '14-custom-folder-open.png') })
  await verifyMorph(sidebarIcon, () => win.locator('.sidebar-toggle').click(), 'closed')
  await verifyMorph(sidebarIcon, () => win.locator('.sidebar-toggle').click(), 'open')

  await win.emulateMedia({ reducedMotion: 'reduce' })
  await win.locator('.sidebar-toggle').click()
  if (await sidebarIcon.evaluate((svg) => svg.getAnimations({ subtree: true }).length)) {
    throw new Error('Reduced motion still animates icon geometry')
  }
  await win.locator('.sidebar-toggle').click()
  await win.emulateMedia({ reducedMotion: 'no-preference' })
  await sleep(300)

  // The toggle must be the LAST element child of .panes (after .pane--preview).
  const toggleIsLast = await win.evaluate(() => {
    const panes = document.querySelector('.panes')
    return panes?.lastElementChild?.classList.contains('sidebar-toggle') ?? false
  })
  if (!toggleIsLast) throw new Error('.sidebar-toggle is not the last child of .panes')

  await win.screenshot({ path: join(artifacts, '10-rail-expanded.png') })

  // Collapse.
  await win.click('.sidebar-toggle')
  await sleep(120) // mid-animation
  await win.screenshot({ path: join(artifacts, '11-rail-collapsing.png') })
  await sleep(300) // settled

  const collapsed = await win.evaluate(() => {
    const rail = document.querySelector('.rail')
    return {
      mounted: !!rail,
      hasClass: rail?.classList.contains('rail--collapsed') ?? false,
      width: rail ? Math.round(rail.getBoundingClientRect().width) : -1
    }
  })
  if (!collapsed.mounted) throw new Error('rail unmounted on collapse — cannot animate out')
  if (!collapsed.hasClass) throw new Error('rail missing .rail--collapsed class')
  if (collapsed.width > 4) throw new Error(`collapsed rail width ${collapsed.width}px should be ~0`)
  await win.screenshot({ path: join(artifacts, '12-rail-collapsed.png') })

  // Expand again.
  await win.click('.sidebar-toggle')
  await sleep(300)
  const expanded = await win.evaluate(() => {
    const rail = document.querySelector('.rail')
    return {
      hasClass: rail?.classList.contains('rail--collapsed') ?? false,
      width: rail ? Math.round(rail.getBoundingClientRect().width) : -1
    }
  })
  if (expanded.hasClass) throw new Error('rail still collapsed after re-toggle')
  if (expanded.width < 200)
    throw new Error(`expanded rail width ${expanded.width}px should be ~208`)
  await win.screenshot({ path: join(artifacts, '13-rail-reexpanded.png') })

  console.log('RAIL-COLLAPSE OK — collapsed width', collapsed.width, '→ expanded', expanded.width)
} catch (err) {
  console.error('RAIL-COLLAPSE FAILED:', err?.message ?? err)
  process.exitCode = 1
} finally {
  await app?.close()
}
