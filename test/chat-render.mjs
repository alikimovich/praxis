/**
 * Visual test of chat rendering (markdown + tool-status lines) without needing
 * the agent/auth: drives the exposed store directly in the renderer, then
 * screenshots the result.
 *
 * Run with: bun run test:chat
 */
import { _electron as electron } from 'playwright'
import electronPath from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdirSync } from 'node:fs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const artifacts = join(root, 'test', 'artifacts')
mkdirSync(artifacts, { recursive: true })

const SAMPLE = [
  '## Updated the hero section',
  '',
  "I changed the heading color to **teal** and tightened the spacing. Here's the key edit:",
  '',
  '```tsx',
  'export function Hero() {',
  '  return <h1 className="title">Welcome</h1>',
  '}',
  '```',
  '',
  '- Adjusted `--accent` token to `#0d9488`',
  '- Reduced top padding from `64px` to `48px`',
  '',
  '> Preview should hot-reload automatically.'
].join('\n')

let app
try {
  app = await electron.launch({
    executablePath: electronPath,
    args: [join(root, 'out', 'main', 'index.js')],
    cwd: root
  })

  const win = await app.firstWindow()
  await win.waitForSelector('.empty__open', { timeout: 15000 })
  await win.evaluate(() => window.__dsgnWorkspace.getState().openOrActivate('/tmp/dsgn-test-project'))
  await win.waitForSelector('.composer__input', { timeout: 15000 })

  await win.evaluate(async (sample) => {
    const store = window.__dsgnStore
    const s = store.getState()
    s.appendUser('Make the hero heading teal and tighten the spacing')
    s.startAssistant()
    s.appendStatus('Read · src/components/Hero.tsx')
    s.appendStatus('Edit · src/components/Hero.tsx')
    // Stream the markdown in chunks to mimic real deltas.
    for (let i = 0; i < sample.length; i += 12) {
      store.getState().appendDelta(sample.slice(i, i + 12))
    }
    store.getState().finish()
  }, SAMPLE)

  await win.waitForSelector('.markdown pre code', { timeout: 5000 })
  await win.screenshot({ path: join(artifacts, '04-chat-render.png') })

  // v6: the agent's tool steps collapse into a disclosure (latest step + count);
  // expanding reveals the full list. (It starts collapsed once the turn finished —
  // so clicking is what reveals the step lines; if it were open, the click would
  // close it and the wait below would fail.)
  await win.waitForSelector('.msg__steps-trigger', { timeout: 5000 })
  const stepsTrigger = (await win.textContent('.msg__steps-trigger')) ?? ''
  if (!/2 steps/.test(stepsTrigger)) {
    throw new Error(`steps disclosure should summarize the count: ${stepsTrigger}`)
  }
  await win.click('.msg__steps-trigger') // expand
  await win.waitForSelector('.msg__status', { timeout: 3000 })
  const steps = await win.$$eval('.msg__status', (els) => els.map((e) => e.textContent?.trim() ?? ''))
  if (steps.length !== 2 || !steps.some((s) => /Hero\.tsx/.test(s))) {
    throw new Error(`expanded steps wrong: ${JSON.stringify(steps)}`)
  }

  // Toolbar + "/" slash menu: seed commands and open the menu.
  await win.evaluate(() => {
    window.__dsgnSession
      .getState()
      .setSlashCommands(['design-review', 'accessibility-review', 'commit', 'compact', 'init'])
  })
  await win.fill('.composer__input', '/')
  await win.waitForSelector('.slash__item', { timeout: 5000 })
  await win.screenshot({ path: join(artifacts, '05-toolbar-slash.png') })

  // First-run auth onboarding: flipping authNeeded shows the guidance banner.
  await win.fill('.composer__input', '')
  await win.evaluate(() => window.__dsgnSession.getState().setAuthNeeded(true))
  await win.waitForSelector('.banner--auth code', { timeout: 5000 })
  const authText = (await win.textContent('.banner--auth'))?.toLowerCase() ?? ''
  if (!authText.includes('setup-token')) {
    throw new Error('auth banner should mention claude setup-token')
  }
  await win.screenshot({ path: join(artifacts, '08-auth-onboarding.png') })
  await win.evaluate(() => window.__dsgnSession.getState().setAuthNeeded(false))

  // Permission cards: seed a pending tool prompt, confirm it renders, approve it.
  // NOTE: no project is open here, so clicking Allow only exercises the renderer's
  // optimistic card removal — the main-side respond IPC is a no-op without a
  // session. The full canUseTool round-trip is covered by the live agent-e2e
  // (which needs Claude credentials), not this store-driven visual test.
  await win.evaluate(() => {
    window.__dsgnPermissions.getState().addRequest({
      id: 'tu_test',
      toolName: 'Bash',
      title: 'Allow Bash?',
      displayName: 'Run command',
      detail: 'npm run build'
    })
  })
  await win.waitForSelector('.perm', { timeout: 5000 })
  const permTitle = (await win.textContent('.perm__title'))?.trim()
  if (permTitle !== 'Allow Bash?') throw new Error(`unexpected permission title: ${permTitle}`)
  await win.screenshot({ path: join(artifacts, '09-permission-card.png') })
  await win.click('.perm__allow')
  await win.waitForFunction(() => !document.querySelector('.perm'), { timeout: 5000 })

  // dsgn runs in Auto (approve-all) by default — no permission-mode selector.
  if (await win.$('select[aria-label="Permission mode"]'))
    throw new Error('permission-mode selector should be removed (Auto is the default)')
  const defaultMode = await win.evaluate(() => window.__dsgnPermissions.getState().mode)
  if (defaultMode !== 'auto')
    throw new Error(`default permission mode should be auto, got ${defaultMode}`)

  // v7 backend picker: native <select> spanning the implemented backends; selecting
  // a non-Claude one surfaces its subscription-login hint.
  const backends = await win.$$eval('select[aria-label="Backend"] option', (os) =>
    os.map((o) => o.value)
  )
  if (JSON.stringify(backends) !== JSON.stringify(['claude', 'codex', 'gemini'])) {
    throw new Error(`unexpected backends: ${JSON.stringify(backends)}`)
  }
  await win.selectOption('select[aria-label="Backend"]', 'codex')
  await win.waitForSelector('.provider-hint', { timeout: 5000 })
  const hint = (await win.textContent('.provider-hint'))?.toLowerCase() ?? ''
  if (!hint.includes('codex login')) throw new Error(`provider hint should mention codex login: ${hint}`)
  await win.selectOption('select[aria-label="Backend"]', 'claude') // reset
  if ((await win.$('.provider-hint')) !== null) throw new Error('hint should hide for Claude')

  // Working-branch pill: shows the branch and opens a switcher dropdown on click;
  // "New branch…" reveals the inline rename editor.
  await win.evaluate(() => window.__dsgnSession.getState().setBranch('dsgn/main'))
  await win.waitForSelector('.branch', { timeout: 5000 })
  const pill = (await win.textContent('.branch'))?.trim()
  if (!pill?.includes('dsgn/main')) throw new Error(`branch pill: ${pill}`)
  await win.click('.branch')
  await win.waitForSelector('[role="menuitem"]', { timeout: 5000 })
  await win.click('text=New branch…')
  await win.waitForSelector('.branch__input', { timeout: 5000 })

  // v5 workspace store: open/activate/close transitions, keyed by projectKey.
  const ws = await win.evaluate(() => {
    const w = window.__dsgnWorkspace.getState()
    w.reset()
    const a = w.openOrActivate('/tmp/proj-a/')
    const b = w.openOrActivate('/tmp/proj-b')
    w.openOrActivate('/tmp/proj-a') // dedupe: same key, no new entry
    const afterOpen = window.__dsgnWorkspace.getState()
    window.__dsgnWorkspace.getState().activate(a)
    const afterActivate = window.__dsgnWorkspace.getState().activeKey
    window.__dsgnWorkspace.getState().close(a)
    const afterClose = window.__dsgnWorkspace.getState()
    return {
      a,
      b,
      count: afterOpen.projects.length,
      activeAfterOpen: afterOpen.activeKey,
      afterActivate,
      remaining: afterClose.projects.map((p) => p.key),
      activeAfterClose: afterClose.activeKey
    }
  })
  if (ws.count !== 2) throw new Error(`workspace should dedupe to 2 projects, got ${ws.count}`)
  if (ws.activeAfterOpen !== ws.a) throw new Error('re-opening A should make A active')
  if (ws.afterActivate !== ws.a) throw new Error('activate(A) failed')
  if (ws.remaining.length !== 1 || ws.remaining[0] !== ws.b) {
    throw new Error(`close(A) should leave only B, got ${JSON.stringify(ws.remaining)}`)
  }
  if (ws.activeAfterClose !== ws.b) throw new Error('closing the active project should fall back to B')

  // Rail collapse: one project (B) is open, so the rail renders. The floating
  // toggle by the traffic lights hides it entirely, then brings it back.
  await win.waitForSelector('.rail', { timeout: 5000 })
  await win.click('button[aria-label="Hide projects sidebar"]')
  // Since #60 the rail stays mounted when collapsed (it slides out); assert the
  // collapsed state + hidden-from-a11y instead of unmounting.
  await win.waitForFunction(
    () => document.querySelector('.rail')?.classList.contains('rail--collapsed'),
    null,
    { timeout: 5000 }
  )
  await win.click('button[aria-label="Show projects sidebar"]')
  await win.waitForFunction(
    () => {
      const r = document.querySelector('.rail')
      return !!r && !r.classList.contains('rail--collapsed')
    },
    null,
    { timeout: 5000 }
  )

  // Paste an image into the composer → a thumbnail attachment chip appears.
  await win.evaluate(() => {
    // 1x1 transparent PNG.
    const b64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const file = new File([bytes], 'pixel.png', { type: 'image/png' })
    const dt = new DataTransfer()
    dt.items.add(file)
    const ta = document.querySelector('.composer__input')
    ta.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
  })
  await win.waitForSelector('.composer__input ~ * img, .composer img', { timeout: 5000 }).catch(() => {})
  const thumb = await win.$('img[alt="attachment"]')
  if (!thumb) throw new Error('pasted image should add a thumbnail attachment')
  // Removing it clears the chip.
  await win.click('button[aria-label="Remove image"]')
  await win.waitForFunction(() => !document.querySelector('img[alt="attachment"]'), { timeout: 5000 })

  // Composer responsiveness: at a narrow chat pane the send button stays visible
  // (selects wrap), and the textarea auto-grows up to ~6 lines for a long prompt.
  await win.evaluate(() => {
    document.querySelector('.pane--chat').style.width = '320px'
  })
  await win.fill('.composer__input', 'a\nb\nc\nd\ne\nf\ng\nh')
  await win.waitForFunction(
    () => parseFloat(document.querySelector('.composer__input').style.height) > 90,
    { timeout: 4000 }
  )
  const sendVisible = await win.evaluate(() => {
    const br = document.querySelector('.composer__send').getBoundingClientRect()
    const pr = document.querySelector('.pane--chat').getBoundingClientRect()
    return br.width > 0 && br.right <= pr.right + 1
  })
  if (!sendVisible) throw new Error('send button must stay visible at a narrow chat width')
  await win.fill('.composer__input', '') // reset

  // Thinking-level selector is removed (effort is pinned to high).
  if (await win.$('select[aria-label="Thinking level"]'))
    throw new Error('the Thinking selector should be gone')

  // Theme follows the OS — no in-app toggle in the rail.
  if (await win.$('button[aria-label="Toggle dark mode"]'))
    throw new Error('the theme toggle should be removed (theme matches the OS)')

  // Native Actions menu is installed with the expected items.
  const actions = await app.evaluate(({ Menu }) => {
    const m = Menu.getApplicationMenu()
    const a = m?.items.find((i) => i.label === 'Actions')
    return a?.submenu?.items.map((i) => i.label || i.role || 'separator') ?? null
  })
  if (!actions) throw new Error('Actions menu not installed')
  // Open/New Project moved to the File menu (see test/menu-recents.mjs).
  for (const label of ['Reload Preview', 'Select Element', 'Stop Project', 'Viewport']) {
    if (!actions.some((l) => l === label)) throw new Error(`Actions menu missing "${label}": ${actions}`)
  }

  // A menu:action command from main flips the viewport store (the renderer dispatch).
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].webContents.send('menu:action', 'viewport:mobile')
  })
  await win.waitForFunction(() => window.__dsgnViewport.getState().viewport === 'mobile', { timeout: 5000 })
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].webContents.send('menu:action', 'viewport:desktop')
  })
  await win.waitForFunction(() => window.__dsgnViewport.getState().viewport === 'desktop', { timeout: 5000 })

  console.log(
    'CHAT-RENDER OK — markdown, toolbar, auth banner, branch pill, workspace store, rail collapse, image paste, composer responsive, actions menu + viewport'
  )
} catch (err) {
  console.error('CHAT-RENDER FAILED:', err?.message ?? err)
  process.exitCode = 1
} finally {
  await app?.close()
}
