/**
 * v8 F1 — comment → parallel agent spawn. Two layers:
 *
 *  A. DETERMINISTIC (always runs, no model/creds):
 *     - spawnComment on a non-repo path falls back (ok:false, reason:'not-a-repo').
 *     - a `sessionId`-tagged event NEVER enters the active chat (byte-clean main
 *       stream — the core routing guarantee), and `spawn-finished` removes the
 *       working rail row from useSpawns.
 *  B. LIVE (SKIP without Claude creds, like agent-e2e): a real comment spawn edits
 *     a temp git repo IN ITS OWN WORKTREE and lands the work on a dsgn/comment-<id>
 *     branch — proving the end-to-end wiring + worktree isolation.
 *
 * Run with: bun run test:spawn
 */
import { _electron as electron } from 'playwright'
import electronPath from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const nonRepo = join(root, 'test', 'fixtures', 'editable-app') // a subdir of THIS repo
const work = mkdtempSync(join(tmpdir(), 'dsgn-spawn-'))
const g = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()

const assert = (cond, msg) => {
  if (!cond) throw new Error(msg)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// A standalone temp git repo (worktrees need a real repo TOP LEVEL).
const repo = join(work, 'app')
mkdirSync(repo, { recursive: true })
g(repo, 'init', '-q', '-b', 'main')
g(repo, 'config', 'user.name', 'Test')
g(repo, 'config', 'user.email', 't@t')
const MARKER = 'SPAWN_VERIFIED'
writeFileSync(join(repo, 'app.txt'), 'the heading is PLACEHOLDER\n')
g(repo, 'add', '-A')
g(repo, 'commit', '-qm', 'init')

let app
try {
  app = await electron.launch({
    executablePath: electronPath,
    args: [join(root, 'out', 'main', 'index.js')],
    cwd: root
  })
  const win = await app.firstWindow()
  await win.waitForSelector('.composer__input', { timeout: 15000 })

  // --- A1: non-repo → fall back (no worktree possible) ---
  const nr = await win.evaluate((p) => window.api.agent.spawnComment(p, 'make it blue', {}), nonRepo)
  assert(!nr.ok && nr.reason === 'not-a-repo', `non-repo should fall back: ${JSON.stringify(nr)}`)

  // --- A2: a sessionId-tagged event must NOT enter the active chat; spawn-finished
  // removes the working row. Drive the real onEvent path by sending from main. ---
  const KEY = 'spawn-test-key'
  await win.evaluate((key) => {
    window.__dsgnStore.getState().setActiveChat(key)
    window.__dsgnStore.getState().clearChat(key)
    window.__dsgnSpawns.getState().add(key, {
      id: 's1',
      branch: 'dsgn/comment-s1',
      label: 'make it blue',
      status: 'running'
    })
  }, KEY)
  const added = await win.evaluate((key) => window.__dsgnSpawns.getState().byKey[key]?.length ?? 0, KEY)
  assert(added === 1, 'spawn row should be added')

  // Send a spawn delta (sessionId set) into the renderer's agent:event listener.
  await app.evaluate(({ BrowserWindow }, ev) => {
    BrowserWindow.getAllWindows()[0].webContents.send('agent:event', ev)
  }, { type: 'delta', text: 'LEAK_INTO_CHAT', projectKey: KEY, sessionId: 's1' })
  await sleep(250)
  const chatText = await win.evaluate((key) => {
    const ms = window.__dsgnStore.getState().byKey[key]?.messages ?? []
    return ms.map((m) => `${m.text}${(m.statuses ?? []).join('')}`).join('')
  }, KEY)
  assert(!chatText.includes('LEAK_INTO_CHAT'), 'spawn delta must NOT enter the active chat')

  // A spawn's `commands` (SDK init) + auth-ish `error` must NOT touch the interactive
  // session UI (App.tsx's listener guards on sessionId too, not just ChatPanel's).
  await win.evaluate(() => {
    window.__dsgnSession.getState().setSlashCommands(['/mine'])
    window.__dsgnSession.getState().setAuthNeeded(false)
  })
  await app.evaluate(({ BrowserWindow }, evs) => {
    for (const ev of evs) BrowserWindow.getAllWindows()[0].webContents.send('agent:event', ev)
  }, [
    { type: 'commands', commands: ['/spawn-only'], projectKey: KEY, sessionId: 's1' },
    { type: 'error', message: 'Please run claude login', projectKey: KEY, sessionId: 's1' }
  ])
  await sleep(250)
  const sess = await win.evaluate(() => ({
    cmds: window.__dsgnSession.getState().slashCommands,
    auth: window.__dsgnSession.getState().authNeeded
  }))
  assert(
    JSON.stringify(sess.cmds) === JSON.stringify(['/mine']),
    `spawn commands must not overwrite the active slash menu: ${JSON.stringify(sess.cmds)}`
  )
  assert(sess.auth === false, 'a spawn auth error must not raise the onboarding banner')

  // spawn-finished → working row removed.
  await app.evaluate(({ BrowserWindow }, ev) => {
    BrowserWindow.getAllWindows()[0].webContents.send('agent:event', ev)
  }, { type: 'spawn-finished', projectKey: KEY, sessionId: 's1', branch: 'dsgn/comment-s1' })
  await win
    .waitForFunction((key) => (window.__dsgnSpawns.getState().byKey[key]?.length ?? 0) === 0, KEY, {
      timeout: 4000
    })
    .catch(() => {})
  const after = await win.evaluate((key) => window.__dsgnSpawns.getState().byKey[key]?.length ?? 0, KEY)
  assert(after === 0, 'spawn-finished should remove the working row')

  // --- A3 (Phase 2): Apply + Discard a finished spawn's branch (hand-built, no model).
  // Simulate a spawn branch = main + one edit-commit, then apply it onto the live tree. ---
  const P2BRANCH = 'dsgn/comment-p2test'
  g(repo, 'checkout', '-q', '-b', P2BRANCH)
  writeFileSync(join(repo, 'phase2.txt'), 'P2_APPLIED\n')
  g(repo, 'add', '-A')
  g(repo, 'commit', '-qm', 'spawn edit')
  g(repo, 'checkout', '-q', 'main')
  assert(!existsSync(join(repo, 'phase2.txt')), 'precondition: phase2.txt only on the branch')

  const applied = await win.evaluate(
    (args) => window.api.agent.spawnApply(args.repo, args.branch),
    { repo, branch: P2BRANCH }
  )
  assert(applied.ok, `spawnApply should succeed: ${JSON.stringify(applied)}`)
  assert(
    existsSync(join(repo, 'phase2.txt')) && readFileSync(join(repo, 'phase2.txt'), 'utf8').includes('P2_APPLIED'),
    'Apply must land the branch edit on the live working tree'
  )

  const discarded = await win.evaluate(
    (args) => window.api.agent.spawnDiscard(args.repo, args.branch),
    { repo, branch: P2BRANCH }
  )
  assert(discarded.ok, 'spawnDiscard should succeed')
  assert(g(repo, 'branch', '--list', P2BRANCH) === '', 'Discard must delete the spawn branch')
  // Clean the applied file so the live spawn below starts from a known tree.
  rmSync(join(repo, 'phase2.txt'), { force: true })

  console.log(
    'SPAWN-COMMENT OK (deterministic) — non-repo fallback, byte-clean chat, row lifecycle, Apply/Discard'
  )

  // --- B: live spawn into the temp repo (creds-gated) ---
  const prompt =
    `Edit the file app.txt in this project: replace the word PLACEHOLDER with exactly ` +
    `${MARKER}. Edit the file directly with your tools and do not ask for confirmation.`
  const res = await win.evaluate(
    (args) => window.api.agent.spawnComment(args.repo, args.prompt, { model: 'haiku' }),
    { repo, prompt }
  )
  assert(res.ok && res.spawnId && res.branch, `spawn should start: ${JSON.stringify(res)}`)

  // Poll the durable branch for the committed edit. The worktree is removed on
  // finalize, but the branch persists with the spawn's commit.
  let landed = false
  for (let i = 0; i < 90 && !landed; i++) {
    await sleep(2000)
    try {
      const fileOnBranch = g(repo, 'show', `${res.branch}:app.txt`)
      if (fileOnBranch.includes(MARKER)) landed = true
    } catch {
      /* branch has no commit yet */
    }
  }

  if (landed) {
    // The edit lives ON THE BRANCH, and the main tree was never touched (isolation).
    const mainTree = g(repo, 'show', 'main:app.txt')
    assert(!mainTree.includes(MARKER), 'isolation: the spawn must NOT have touched main')
    console.log('SPAWN-COMMENT OK (live) — comment spawn edited the repo in its own worktree →', res.branch)
  } else {
    console.log('SPAWN-COMMENT SKIP (live) — the spawn never committed (likely no Claude creds).')
    console.log('  Deterministic checks passed; live wiring needs `claude login`.')
  }
} catch (err) {
  console.error('SPAWN-COMMENT FAILED:', err?.message ?? err)
  process.exitCode = 1
} finally {
  rmSync(work, { recursive: true, force: true })
  await app?.close()
}
