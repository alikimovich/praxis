import assert from 'node:assert/strict'
import { _electron as electron } from 'playwright'
import electronPath from 'electron'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = process.cwd(), base = mkdtempSync(join(tmpdir(), 'praxis-git-ui-'))
const remote = join(base, 'origin.git'), seed = join(base, 'seed'), project = join(base, 'project')
const artifacts = join(root, 'test/artifacts'); mkdirSync(artifacts, { recursive: true })
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const commit = (text) => { writeFileSync(join(seed, 'index.html'), `<meta name="color-scheme" content="light dark"><h1>${text}</h1>`); git(seed, 'add', '-A'); git(seed, 'commit', '-m', text) }
let app
try {
  git(base, 'init', '--bare', '--initial-branch=main', remote)
  git(base, 'init', '--initial-branch=main', seed)
  git(seed, 'config', 'user.name', 'Test'); git(seed, 'config', 'user.email', 'test@example.com')
  commit('Original')
  git(seed, 'remote', 'add', 'origin', remote); git(seed, 'push', '-u', 'origin', 'main')
  git(base, 'clone', remote, project)
  git(project, 'config', 'user.name', 'Test'); git(project, 'config', 'user.email', 'test@example.com')
  app = await electron.launch({ executablePath: electronPath, args: [join(root, 'out/main/index.js')], cwd: root,
    env: { ...process.env, PRAXIS_USER_DATA: join(base, 'profile'), PRAXIS_TEST_SKIP_INTRO: '1' } })
  const win = await app.firstWindow()
  await win.waitForSelector('.empty__open', { timeout: 15000 })
  await app.evaluate(({ dialog, ipcMain }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] })
    ipcMain.removeHandler('agent:open-project')
    ipcMain.handle('agent:open-project', () => ({ transcript: [] }))
  }, project)
  await win.locator('.empty__open').click()
  await win.waitForFunction((path) => window.__praxisSession.getState().projectRoot === path, project)
  const previewVisible = () => app.evaluate(({ BrowserWindow }) => {
    const preview = BrowserWindow.getAllWindows()[0].contentView.children.find(
      (view) => view.webContents && !view.webContents.getURL().includes('praxisPanel')
    )
    return preview?.getVisible() ?? null
  })
  const expectPreviewVisible = async (expected) => {
    for (let attempt = 0; attempt < 50; attempt++) {
      if (await previewVisible() === expected) return
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    assert.equal(await previewVisible(), expected, `native preview visibility should be ${expected}`)
  }
  await expectPreviewVisible(true)
  commit('Pulled from GitHub'); git(seed, 'push')
  git(seed, 'checkout', '-b', 'feature/design'); commit('Remote design branch'); git(seed, 'push', '-u', 'origin', 'feature/design')
  await win.locator('button.branch').click()
  await win.getByRole('menuitem', { name: 'Git updates…' }).click()
  const dialog = win.getByRole('dialog', { name: 'Git updates' })
  await dialog.waitFor()
  await expectPreviewVisible(false)
  await dialog.getByRole('button', { name: 'Fetch updates', exact: true }).click()
  await win.getByRole('status').filter({ hasText: 'Remote branches are up to date' }).waitFor()
  assert.equal(await dialog.getByRole('option', { name: 'origin/feature/design', exact: true }).count(), 1)
  assert.equal(readFileSync(join(project, 'index.html'), 'utf8'), '<meta name="color-scheme" content="light dark"><h1>Original</h1>', 'fetch leaves files untouched')
  for (const [width, height] of [[390, 844], [768, 1024], [1440, 900]]) {
    await win.setViewportSize({ width, height })
    await dialog.getByRole('button', { name: 'Pull updates', exact: true }).scrollIntoViewIfNeeded()
    const bounds = await dialog.boundingBox()
    assert(bounds.x >= 0 && bounds.x + bounds.width <= width + 1, 'Git dialog fits viewport')
    await win.screenshot({ path: join(artifacts, `git-updates-${width}.png`) })
  }
  await expectPreviewVisible(false)
  await win.screenshot({ path: join(artifacts, 'git-updates.png') })
  await dialog.getByRole('button', { name: 'Pull updates', exact: true }).click()
  await win.getByRole('status').filter({ hasText: 'Pulled origin/main into praxis/main.' }).waitFor()
  await win.waitForFunction(() => window.__praxisLog.getState().lines.some((line) => line.text.includes('Preview restarted at')))
  assert.equal(readFileSync(join(project, 'index.html'), 'utf8'), '<meta name="color-scheme" content="light dark"><h1>Pulled from GitHub</h1>')
  await expectPreviewVisible(false)
  await dialog.getByRole('combobox', { name: 'Remote branch' }).selectOption('refs/remotes/origin/feature/design')
  await dialog.getByRole('button', { name: 'Switch to branch', exact: true }).click()
  await win.getByRole('status').filter({ hasText: 'Switched to feature/design, tracking origin/feature/design.' }).waitFor()
  assert.equal(git(project, 'branch', '--show-current'), 'feature/design')
  assert.equal(git(project, 'rev-parse', '--abbrev-ref', '@{upstream}'), 'origin/feature/design')
  await win.waitForFunction(() => document.querySelector('[role=dialog]')?.getAttribute('aria-busy') === 'false')
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await dialog.waitFor({ state: 'detached' })
  await expectPreviewVisible(true)
  await win.waitForFunction(() => window.__praxisSession.getState().branch === 'feature/design')
  await win.waitForFunction(() => window.__praxisLog.getState().lines.filter((line) => line.text.includes('Preview restarted at')).length >= 2)
  const url = await win.evaluate(() => window.__praxisWorkspace.getState().projects[0].url)
  const shown = await app.evaluate(async (_electron, address) => (await fetch(address)).text(), url)
  assert.match(shown, /Remote design branch/)
  await app.evaluate(async ({ webContents }, address) => {
    const preview = webContents.getAllWebContents().find((wc) => wc.getURL().startsWith(address))
    if (preview.isLoading()) await new Promise((resolve) => preview.once('did-stop-loading', resolve))
    await preview.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
  }, url)
  const shot = await app.evaluate(async ({ webContents }, address) => (await webContents.getAllWebContents().find((wc) => wc.getURL().startsWith(address)).capturePage()).toPNG().toString('base64'), url)
  writeFileSync(join(artifacts, 'git-updates-native.png'), Buffer.from(shot, 'base64'))
  // The ordinary local-branch menu must restart too, even without Git updates.
  await win.locator('button.branch').click()
  await win.getByRole('menuitem', { name: 'main', exact: true }).click()
  await win.waitForFunction(() => window.__praxisSession.getState().branch === 'main')
  await win.waitForFunction(() => window.__praxisLog.getState().lines.filter((line) => line.text.includes('Preview restarted at')).length >= 3)
  const localUrl = await win.evaluate(() => window.__praxisWorkspace.getState().projects[0].url)
  assert.match(await app.evaluate(async (_electron, address) => (await fetch(address)).text(), localUrl), /Original/)
  const localPreview = await app.evaluate(async ({ webContents }, address) => {
    const preview = webContents.getAllWebContents().find((wc) => wc.getURL().startsWith(address))
    if (preview.isLoading()) await new Promise((resolve) => preview.once('did-stop-loading', resolve))
    return preview.executeJavaScript('document.body.innerText')
  }, localUrl)
  assert.match(localPreview, /Original/, 'native preview displays the locally selected branch')
  await win.evaluate((path) => window.api.devServer.stop(path), project)
  console.log('GIT-UPDATES OK — menu, fetch-only, remote branch selection, pull, tracking checkout, preview refresh')
} finally { await app?.close(); rmSync(base, { recursive: true, force: true }) }
