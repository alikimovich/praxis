/**
 * Menu + branding test — asserts the app is named "Praxis" and that the native
 * File menu carries New/Open Project plus an "Open Recent" submenu that mirrors
 * the renderer's recents list (up to 8), including the Clear Menu item.
 * Run with: bun run test:menu
 */
import { _electron as electron } from 'playwright'
import electronPath from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// Serialize the application menu to plain {label, sublabel, submenu} for asserting.
const readMenu = (app) =>
  app.evaluate(({ Menu }) => {
    const walk = (items) =>
      (items ?? []).map((mi) => ({
        label: mi.label,
        enabled: mi.enabled,
        submenu: mi.submenu ? walk(mi.submenu.items) : null
      }))
    return walk(Menu.getApplicationMenu()?.items)
  })

const findByLabel = (items, label) => (items ?? []).find((i) => i.label === label)

let app
try {
  app = await electron.launch({
    executablePath: electronPath,
    args: [join(root, 'out', 'main', 'index.js')],
    cwd: root
  })
  const win = await app.firstWindow()
  await win.waitForSelector('.empty__open', { timeout: 15000 })

  // 1) The app renamed from Electron → Praxis.
  const name = await app.evaluate(({ app }) => app.getName())
  if (name !== 'Praxis') throw new Error(`app name should be "Praxis", got "${name}"`)

  // 2) A File menu exists with New/Open Project + Open Recent.
  let menu = await readMenu(app)
  const file = findByLabel(menu, 'File')
  if (!file) throw new Error('no File menu')
  for (const label of ['New Project…', 'Open Project…', 'Open Recent']) {
    if (!findByLabel(file.submenu, label)) throw new Error(`File menu missing "${label}"`)
  }

  // 3) With no recents, Open Recent shows a disabled placeholder. Other e2e
  // tests share this same Electron profile and persist real fixture projects
  // into localStorage — clear first (same 'clear-recents' menu:action the
  // real Clear Menu item fires) so this assertion doesn't depend on suite
  // run order.
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.send('menu:action', 'clear-recents')
  )
  const clearDeadline = Date.now() + 4000
  for (;;) {
    const m = await readMenu(app)
    const oc = findByLabel(findByLabel(m, 'File').submenu, 'Open Recent')
    if (oc.submenu?.[0]?.label === 'No Recent Projects') break
    if (Date.now() > clearDeadline) throw new Error('empty Open Recent should show "No Recent Projects"')
  }

  // 4) Push 9 recents from the renderer → menu lists 8 (capped) + Clear Menu.
  await win.evaluate(() => {
    const recents = Array.from({ length: 9 }, (_v, i) => ({
      root: `/tmp/proj-${i}`,
      name: `Project ${i}`
    }))
    window.api.menu.setRecents(recents)
  })
  // The IPC round-trip rebuilds the menu asynchronously — poll for it.
  const deadline = Date.now() + 4000
  for (;;) {
    menu = await readMenu(app)
    const openRecent = findByLabel(findByLabel(menu, 'File').submenu, 'Open Recent')
    const names = (openRecent.submenu ?? []).map((i) => i.label)
    if (names.includes('Project 0')) {
      const projectItems = names.filter((n) => n.startsWith('Project '))
      if (projectItems.length !== 8)
        throw new Error(`Open Recent should cap at 8, got ${projectItems.length}`)
      if (!names.includes('Clear Menu')) throw new Error('Open Recent missing Clear Menu')
      break
    }
    if (Date.now() > deadline) throw new Error('recents never appeared in the menu')
  }

  console.log('MENU OK — Praxis name + File/Open Recent menu verified')
} catch (err) {
  console.error('MENU FAILED:', err?.message ?? err)
  process.exitCode = 1
} finally {
  await app?.close()
}
