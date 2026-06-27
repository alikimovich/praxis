/**
 * worktrees.ts unit test (pure — no Electron). The F1 crux: each comment-spawned
 * agent edits in its OWN git worktree so parallel runs never cross-write, the spawn
 * leaves a durable branch, and its diff applies back onto the live (possibly dirty)
 * working tree via 3-way patch — NOT `git merge` (which fails on uncommitted WIP).
 *
 * Asserts: create forks WIP without touching the main tree; two concurrent creates
 * are isolated; commit captures the authoritative file list; diff→apply lands the
 * change onto a DIRTY main tree; remove reclaims the checkout (keeping the branch);
 * pruneOrphans reclaims a leftover. Uses real temp git repos.
 *
 * Run with: bun run test:worktrees
 */
import {
  createWorktree,
  commitWorktree,
  diffWorktree,
  applyToWorkingTree,
  removeWorktree,
  pruneOrphans
} from '../src/main/worktrees.ts'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const base = mkdtempSync(join(tmpdir(), 'dsgn-wt-'))
const repo = join(base, 'repo')
const worktreesDir = join(base, 'worktrees')
const tmpDir = join(base, 'tmp')
let failed = 0
const ok = (cond, msg) => {
  if (!cond) {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}
const g = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' })

try {
  // --- temp repo with one committed file + a branch ---
  mkdirSync(repo, { recursive: true })
  g(repo, 'init', '-q', '-b', 'main')
  g(repo, 'config', 'user.name', 'Test')
  g(repo, 'config', 'user.email', 'test@local')
  const appFile = join(repo, 'App.tsx')
  writeFileSync(appFile, 'export const App = () => <div className="root">hi</div>\n')
  g(repo, 'add', '-A')
  g(repo, 'commit', '-q', '-m', 'init')

  // Simulate the interactive main agent having UNCOMMITTED WIP in the live tree.
  writeFileSync(appFile, 'export const App = () => <div className="root">hi</div>\n// WIP\n')
  // ...AND an UNTRACKED new file — the dsgn agent constantly creates files; the fork
  // base must include these (git stash create would silently drop them).
  writeFileSync(join(repo, 'Untracked.tsx'), 'export const New = () => null\n')
  const dirtyBefore = readFileSync(appFile, 'utf8')

  // --- create: forks the WIP, and does NOT disturb the main tree ---
  const wtA = await createWorktree(repo, worktreesDir, { label: 'make it blue' })
  ok(wtA.branch === 'dsgn/comment-' + wtA.id, `branch name: ${wtA.branch}`)
  ok(existsSync(wtA.path), 'worktree checkout exists')
  ok(readFileSync(appFile, 'utf8') === dirtyBefore, 'create did NOT touch the main working tree')
  // The worktree forked from the live WIP — tracked modification...
  ok(
    readFileSync(join(wtA.path, 'App.tsx'), 'utf8').includes('// WIP'),
    'worktree forked from the live WIP (tracked), not just HEAD'
  )
  // ...AND the untracked new file (the captureBase fix; stash-create would drop it).
  ok(
    existsSync(join(wtA.path, 'Untracked.tsx')),
    'worktree base includes UNTRACKED live files (new components the agent just made)'
  )

  // --- two concurrent creates are isolated (distinct dirs + branches) ---
  const [w1, w2] = await Promise.all([
    createWorktree(repo, worktreesDir, {}),
    createWorktree(repo, worktreesDir, {})
  ])
  ok(w1.id !== w2.id && w1.path !== w2.path && w1.branch !== w2.branch, 'concurrent creates distinct')
  // Edit each independently — no cross-write.
  writeFileSync(join(w1.path, 'App.tsx'), 'one\n')
  writeFileSync(join(w2.path, 'App.tsx'), 'two\n')
  ok(readFileSync(join(w1.path, 'App.tsx'), 'utf8') === 'one\n', 'w1 isolated')
  ok(readFileSync(join(w2.path, 'App.tsx'), 'utf8') === 'two\n', 'w2 isolated')
  await removeWorktree(repo, w1, {})
  await removeWorktree(repo, w2, {})

  // --- the spawn edits its tree → commit captures the authoritative file list ---
  writeFileSync(
    join(wtA.path, 'App.tsx'),
    'export const App = () => <div className="root accent">hi</div>\n// WIP\n'
  )
  writeFileSync(join(wtA.path, 'New.tsx'), 'export const New = () => null\n')
  // A stray .dsgn write (a spawn runs bypassPermissions, so the sidecar deny is off)
  // must be excluded from the commit — the sidecar is dsgn-managed, not the agent's.
  mkdirSync(join(wtA.path, '.dsgn'), { recursive: true })
  writeFileSync(join(wtA.path, '.dsgn', 'annotations.json'), '[{"sneaky":true}]\n')
  const committed = await commitWorktree(wtA, 'make it blue')
  ok(committed.committed, 'commitWorktree committed')
  ok(
    committed.files.includes('App.tsx') && committed.files.includes('New.tsx'),
    `committed files: ${JSON.stringify(committed.files)}`
  )
  ok(
    !committed.files.some((f) => f.startsWith('.dsgn')),
    `.dsgn must be excluded from a spawn commit: ${JSON.stringify(committed.files)}`
  )

  // --- diff → apply onto the DIRTY live tree (3-way, tolerates WIP) ---
  const patch = await diffWorktree(wtA)
  ok(/accent/.test(patch) && /New\.tsx/.test(patch), 'diff carries both changes')
  const applied = await applyToWorkingTree(repo, patch, tmpDir)
  ok(applied.ok && !applied.conflict, `apply onto dirty tree: ${JSON.stringify(applied)}`)
  const liveApp = readFileSync(appFile, 'utf8')
  ok(liveApp.includes('accent'), 'live App.tsx got the spawn edit')
  ok(liveApp.includes('// WIP'), "the main agent's WIP survived the apply")
  ok(existsSync(join(repo, 'New.tsx')), 'new file landed in the live tree')

  // --- remove reclaims the checkout but keeps the branch (durable record) ---
  await removeWorktree(repo, wtA, { keepBranch: true })
  ok(!existsSync(wtA.path), 'worktree checkout removed')
  const branches = g(repo, 'branch', '--list', wtA.branch)
  ok(branches.includes(wtA.branch), 'branch kept as the durable record')

  // --- pruneOrphans reclaims a leftover checkout, recovering its dirty work to the
  // branch — but SKIPS a checkout named as live (an active spawn this session) ---
  const orphan = await createWorktree(repo, worktreesDir, {})
  writeFileSync(join(orphan.path, 'Scratch.tsx'), 'leftover\n')
  const live = await createWorktree(repo, worktreesDir, {}) // pretend this one is active
  const reclaimed = await pruneOrphans(repo, worktreesDir, new Set([live.id]))
  ok(reclaimed.includes(orphan.id), `pruneOrphans reclaimed the orphan: ${JSON.stringify(reclaimed)}`)
  ok(!existsSync(orphan.path), 'orphan checkout removed by prune')
  ok(existsSync(live.path), 'pruneOrphans must SKIP a live (active) spawn checkout')
  ok(!reclaimed.includes(live.id), 'live spawn id not reclaimed')
  // The orphan's dirty work was committed to its branch before removal (not lost).
  ok(g(repo, 'show', `${orphan.branch}:Scratch.tsx`).includes('leftover'), 'orphan work recovered to its branch')
  await removeWorktree(repo, live, {})

  // --- empty patch applies as a no-op success ---
  const noop = await applyToWorkingTree(repo, '', tmpDir)
  ok(noop.ok && !noop.conflict, 'empty patch is a no-op success')

  if (failed === 0) console.log('WORKTREES OK — isolated create/commit/diff/apply-to-dirty/remove/prune')
  else console.error(`WORKTREES: ${failed} assertion(s) failed`)
  process.exitCode = failed === 0 ? 0 : 1
} catch (err) {
  console.error('WORKTREES FAILED:', err?.message ?? err)
  process.exitCode = 1
} finally {
  rmSync(base, { recursive: true, force: true })
}
