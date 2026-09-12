import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import electronPath from 'electron'
import { _electron as electron } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const fixture = join(root, 'test', 'fixtures', 'static-app')
const artifacts = join(root, 'test', 'artifacts')
const userData = mkdtempSync(join(tmpdir(), 'praxis-memory-ui-'))
mkdirSync(artifacts, { recursive: true })

let app
try {
  app = await electron.launch({
    executablePath: electronPath,
    args: [join(root, 'out', 'main', 'index.js')],
    cwd: root,
    env: { ...process.env, PRAXIS_USER_DATA: userData }
  })
  const win = await app.firstWindow()
  await win.waitForSelector('.empty__open', { timeout: 15_000 })
  await app.evaluate(async ({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] })
  }, fixture)
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.send('menu:action', 'open-project')
  )
  await win.waitForSelector('.rail__project-menu', { timeout: 60_000 })
  await win.locator('.rail__row').hover()
  await win.click('.rail__project-menu')
  await win.getByRole('menuitem', { name: 'Memory', exact: true }).click()
  await win.waitForSelector('[aria-label$="project memory"]', { timeout: 10_000 })

  const decision =
    '# Decisions\n\n' + '- Keep durable project decisions available for every chat.\n'.repeat(260).trimEnd()
  await win.fill('[aria-label$="project memory"]', decision)
  await win.click('button:has-text("Save memory")')
  await win.waitForFunction(() => document.body.textContent.includes('Project memory saved.'))

  const saved = await win.evaluate(
    (projectRoot) => window.api.projectMemory.get(projectRoot),
    fixture
  )
  if (saved.content !== decision)
    throw new Error(`memory did not round-trip: ${JSON.stringify(saved)}`)
  await win.screenshot({ path: join(artifacts, '21-project-memory.png') })

  await win.click('button:has-text("Close")')
  await win.waitForSelector('[aria-label$="project memory"]', { state: 'detached' })
  await win.locator('.rail__row').hover()
  await win.click('.rail__project-menu')
  await win.getByRole('menuitem', { name: 'Memory', exact: true }).click()
  await win.waitForSelector('[aria-label$="project memory"]', { timeout: 10_000 })
  const restored = await win.inputValue('[aria-label$="project memory"]')
  if (restored !== decision)
    throw new Error('memory did not survive closing and reopening the editor')

  for (const [width, height] of [[1100, 800], [800, 600]]) {
    await app.evaluate(({ BrowserWindow }, size) => {
      BrowserWindow.getAllWindows()[0].setSize(...size)
    }, [width, height])
    await win.waitForFunction(() => {
      const dialog = document.querySelector('[role="dialog"]').getBoundingClientRect()
      return dialog.top >= 0 && dialog.bottom <= window.innerHeight
    })
    const editor = win.locator('[aria-label$="project memory"]')
    await editor.evaluate((el) => { el.scrollTop = 0 })
    await editor.hover()
    await win.mouse.wheel(0, 1000)
    await win.waitForFunction(() =>
      document.querySelector('[aria-label$="project memory"]').scrollTop > 0
    )
    await editor.focus()
    await editor.evaluate((el) => el.setSelectionRange(0, 0))
    await win.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End')
    await win.waitForFunction(() => {
      const el = document.querySelector('[aria-label$="project memory"]')
      return el.scrollTop + el.clientHeight >= el.scrollHeight - 2
    })
    for (const name of ['Save memory', 'Close']) {
      const bounds = await win.getByRole('button', { name, exact: true }).last().boundingBox()
      const viewportHeight = await win.evaluate(() => window.innerHeight)
      if (!bounds || bounds.y < 0 || bounds.y + bounds.height > viewportHeight)
        throw new Error(`${name} is outside the window at ${width}x${height}`)
    }
    await win.screenshot({ path: join(artifacts, `21-project-memory-long-${height}.png`) })
  }

  if (await win.locator('button:has-text("Clear context")').count()) {
    throw new Error('project memory must not expose a privileged chat-context reset')
  }

  console.log('PROJECT-MEMORY-UI OK — edit, save, and reopen peer-shared memory')
} catch (error) {
  console.error('PROJECT-MEMORY-UI FAILED:', error?.stack ?? error)
  process.exitCode = 1
} finally {
  await app?.close()
  rmSync(userData, { recursive: true, force: true })
}
