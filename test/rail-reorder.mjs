import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import electronPath from 'electron'
import { _electron as electron } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const fixture = join(root, 'test/fixtures/static-app')
const artifacts = join(root, 'test/artifacts')
mkdirSync(artifacts, { recursive: true })
let app
try {
  app = await electron.launch({
    executablePath: electronPath,
    args: [join(root, 'out/main/index.js')],
    cwd: root
  })
  // Native macOS dragging needs the destination physically inside the display.
  await app.evaluate(({ BrowserWindow, screen }) => {
    const area = screen.getPrimaryDisplay().workArea
    BrowserWindow.getAllWindows()[0].setBounds({
      x: area.x + 20,
      y: area.y + 20,
      width: Math.min(1000, area.width - 40),
      height: Math.min(650, area.height - 40)
    })
  })
  const win = await app.firstWindow()
  await win.waitForSelector('.empty__open', { timeout: 15000 })
  await app.evaluate(({ dialog }, fixture) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [fixture] })
  }, fixture)
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.send('menu:action', 'open-project')
  )
  await win.waitForFunction(
    (f) => window.__praxisWorkspace.getState().projects.some((p) => p.root === f && p.url),
    fixture,
    { timeout: 60000 }
  )
  const key = await win.evaluate(() => window.__praxisWorkspace.getState().activeKey)
  const seed = async () =>
    win.evaluate((key) => {
      window.__praxisHistory.setState({ load: async () => {} })
      const ws = window.__praxisWorkspace.getState()
      const p = ws.projects.find((p) => p.key === key)
      const keys = [key, `${key}#one`, `${key}#two`]
      for (const [i, sk] of keys.entries()) {
        window.__praxisStore.getState().hydrate(sk, [], false)
        window.__praxisStore.getState().setTitle(sk, ['First chat', 'Second chat', 'Third chat'][i])
      }
      ws.hydrate(
        [
          { ...p, name: 'Alpha', sessionKeys: keys, chatsCollapsed: false },
          {
            ...p,
            name: 'Bravo',
            key: 'project-b',
            root: '/tmp/praxis-rail-bravo',
            sessionKeys: ['project-b'],
            activeSessionKey: 'project-b',
            chatsCollapsed: true
          },
          {
            ...p,
            name: 'Charlie',
            key: 'project-c',
            root: '/tmp/praxis-rail-charlie',
            sessionKeys: ['project-c'],
            activeSessionKey: 'project-c',
            chatsCollapsed: true
          }
        ],
        key
      )
      window.__praxisHistory.setState((s) => ({
        byKey: {
          ...s.byKey,
          [key]: [1, 2, 3].map((n) => ({
            id: `history-${n}`,
            projectRoot: p.root,
            projectKey: key,
            title: `Past ${n}`,
            startedAt: Date.now(),
            transcript: [],
            filesTouched: []
          }))
        }
      }))
    }, key)
  await seed()
  await win.waitForTimeout(250)
  const projectNames = () => win.locator('.rail__name').allTextContents()
  const chatNames = () =>
    win
      .locator('.rail__chats [data-reorder-id]')
      .evaluateAll((nodes) => nodes.map((n) => n.textContent.trim()))
  const drag = async (source, target) => {
    await source.scrollIntoViewIfNeeded()
    const a = await source.boundingBox()
    await win.mouse.move(a.x + 35, a.y + a.height / 2)
    await win.mouse.down()
    await win.mouse.move(a.x + 43, a.y + a.height / 2, { steps: 4 })
    await win.waitForSelector('[data-reorder-dragging]')
    const b = await target.boundingBox()
    await win.mouse.move(b.x + 35, b.y + 3, { steps: 12 })
    await win.mouse.up()
    await win.waitForSelector('[data-reorder-dragging]', { state: 'detached' })
  }
  const project = (name) => win.locator('.rail__name-btn').filter({ hasText: name })
  const chat = (name) => win.locator('.rail__chats [data-reorder-id]').filter({ hasText: name })
  const before = await win.evaluate(() => {
    const s = window.__praxisWorkspace.getState()
    return {
      active: s.activeKey,
      entries: s.projects.map((p) => ({
        key: p.key,
        touchedAt: p.touchedAt,
        sessionKeys: p.sessionKeys,
        activeSessionKey: p.activeSessionKey,
        chatsCollapsed: p.chatsCollapsed
      }))
    }
  })
  assert.deepEqual(await projectNames(), ['Alpha', 'Bravo', 'Charlie'])
  await drag(project('Charlie'), project('Alpha'))
  await win.waitForFunction(() => document.querySelector('.rail__name')?.textContent === 'Charlie')
  assert.deepEqual(await projectNames(), ['Charlie', 'Alpha', 'Bravo'])
  await drag(chat('First chat'), chat('Third chat'))
  await win.waitForFunction(
    () =>
      document.querySelector('.rail__chats [data-reorder-id]')?.textContent.includes('First chat'),
    undefined,
    { timeout: 5000 }
  )
  assert.deepEqual(await chatNames(), ['First chat', 'Third chat', 'Second chat'])
  await chat('First chat').focus()
  await win.keyboard.press('Alt+ArrowDown')
  assert.deepEqual(await chatNames(), ['Third chat', 'First chat', 'Second chat'])
  assert.equal(
    await chat('First chat').evaluate((el) => el === document.activeElement),
    true,
    'Keyboard move retains focus'
  )
  const after = await win.evaluate(() => {
    const s = window.__praxisWorkspace.getState()
    return {
      active: s.activeKey,
      entries: s.projects.map((p) => ({
        key: p.key,
        touchedAt: p.touchedAt,
        sessionKeys: p.sessionKeys,
        activeSessionKey: p.activeSessionKey,
        chatsCollapsed: p.chatsCollapsed
      }))
    }
  })
  assert.equal(after.active, before.active)
  assert.deepEqual(
    after.entries.sort((a, b) => a.key.localeCompare(b.key)),
    before.entries.sort((a, b) => a.key.localeCompare(b.key))
  )
  // Cross-project/list drops must not reparent a live provider session.
  const saved = await win.evaluate(() => localStorage.getItem('praxis.rail-order.v1'))
  await drag(chat('Second chat'), project('Bravo'))
  assert.equal(await win.evaluate(() => localStorage.getItem('praxis.rail-order.v1')), saved)
  await win.locator('.rail__section-toggle').click()
  const past = (n) =>
    win.locator('.rail__history [data-reorder-id]').filter({ hasText: `Past ${n}` })
  await drag(past(3), past(1))
  assert.deepEqual(
    await win
      .locator('.rail__history [data-reorder-id]')
      .evaluateAll((nodes) => nodes.map((n) => n.dataset.reorderId)),
    ['history-3', 'history-1', 'history-2']
  )
  // Native vibrancy is absent from renderer screenshots; use the matching opaque surface for capture.
  await win.evaluate(() => {
    document.querySelector('.rail').style.background = 'var(--bg-subtle)'
  })
  await win.screenshot({ path: join(artifacts, 'rail-reordered.png') })
  // Native Escape cancels a drag before commit and removes source/target styling.
  const a = await project('Bravo').boundingBox(),
    b = await project('Charlie').boundingBox()
  await win.mouse.move(a.x + 30, a.y + 8)
  await win.mouse.down()
  await win.mouse.move(b.x + 30, b.y + 4, { steps: 12 })
  await win.waitForSelector('[data-reorder-edge]')
  await win.screenshot({ path: join(artifacts, 'rail-reorder-drag.png') })
  await win.keyboard.press('Escape')
  await win.mouse.up()
  await win.waitForSelector('[data-reorder-dragging]', { state: 'detached' })
  assert.deepEqual(await projectNames(), ['Charlie', 'Alpha', 'Bravo'])
  // Rename remains available without accidentally beginning a drag.
  const first = chat('First chat').locator('..')
  await first.hover()
  await first.getByRole('button', { name: 'Rename chat First chat' }).click()
  const edit = win.getByRole('textbox', { name: 'Rename chat First chat' })
  await edit.fill('Renamed chat')
  await edit.press('Enter')
  await win.waitForFunction(() =>
    document.querySelector('.rail__chats')?.textContent.includes('Renamed chat')
  )
  // Recreate the renderer (and ordering store), then reseed non-live fixture peers.
  await win.reload()
  await win.waitForSelector('.rail__name', { timeout: 30000 })
  await seed()
  assert.deepEqual(await projectNames(), ['Charlie', 'Alpha', 'Bravo'])
  assert.deepEqual(await chatNames(), ['Third chat', 'First chat', 'Second chat'])
  await win.locator('.rail__section-toggle').click()
  assert.ok(
    (await win.locator('.rail__history [data-reorder-id]').first().textContent()).includes('Past 3')
  )
  // New live chats appear first while the established manual order stays intact.
  await win.evaluate((key) => {
    const ws = window.__praxisWorkspace.getState()
    const p = ws.projects.find((p) => p.key === key)
    window.__praxisStore.getState().hydrate(`${key}#new`, [], false)
    window.__praxisStore.getState().setTitle(`${key}#new`, 'New chat')
    ws.patchEntry(key, { sessionKeys: [...p.sessionKeys, `${key}#new`] })
  }, key)
  assert.deepEqual(await chatNames(), ['New chat', 'Third chat', 'First chat', 'Second chat'])
  // Long lists scroll at the edge during a native drag, without committing.
  await win.evaluate((key) => {
    const ws = window.__praxisWorkspace.getState(),
      p = ws.projects.find((p) => p.key === key)
    ws.hydrate(
      [
        ...ws.projects,
        ...Array.from({ length: 30 }, (_, i) => ({
          ...p,
          key: `extra-${i}`,
          name: `Extra ${i}`,
          chatsCollapsed: true
        }))
      ],
      key
    )
  }, key)
  const scrollBox = win.locator('.rail__inner')
  const firstProject = project('Charlie')
  await firstProject.scrollIntoViewIfNeeded()
  const start = await firstProject.boundingBox(),
    edge = await scrollBox.boundingBox()
  await win.mouse.move(start.x + 35, start.y + 8)
  await win.mouse.down()
  await win.mouse.move(start.x + 44, start.y + 8, { steps: 4 })
  await win.waitForSelector('[data-reorder-dragging]')
  const scrollBefore = await scrollBox.evaluate((el) => el.scrollTop)
  await win.mouse.move(edge.x + 60, edge.y + edge.height - 12, { steps: 20 })
  // macOS delivers native drag-over on its own cadence; sustain the edge hover.
  await win.waitForTimeout(120)
  await win.mouse.move(edge.x + 60, edge.y + edge.height - 12)
  await win.waitForTimeout(120)
  await win.mouse.move(edge.x + 60, edge.y + edge.height - 14)
  await win.waitForFunction(
    (before) => document.querySelector('.rail__inner').scrollTop > before + 30,
    scrollBefore,
    { timeout: 5000 }
  )
  await win.keyboard.press('Escape')
  await win.mouse.up()
  await win.waitForSelector('[data-reorder-dragging]', { state: 'detached' })
  console.log(
    'RAIL-REORDER OK — native project/chat/history drops, keyboard focus, cancellation, group isolation, lifecycle invariants, rename, reload persistence and edge auto-scroll'
  )
} finally {
  await app?.close()
}
