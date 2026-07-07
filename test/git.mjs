/**
 * Unit test for branch management against a real temp git repo (no electron).
 * Run via bun so the .ts import transpiles: bun run test:git
 */
import assert from 'node:assert'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ensureBranch,
  getCurrentBranch,
  isGitRepo,
  normalizeBranchName,
  switchBranch
} from '../src/main/git.ts'

// --- pure name coercion: always a git-ref-safe dsgn/<…> ---
assert.equal(normalizeBranchName('feature x'), 'dsgn/feature-x')
assert.equal(normalizeBranchName('dsgn/foo'), 'dsgn/foo')
assert.equal(normalizeBranchName('  weird~^:?*name  '), 'dsgn/weird-name')
assert.equal(normalizeBranchName('dsgn/'), 'dsgn/work')
assert.equal(normalizeBranchName('/a/b/'), 'dsgn/a/b')

// --- not a git repo: a clean no-op ---
const nonRepo = mkdtempSync(join(tmpdir(), 'dsgn-nonrepo-'))
assert.equal(await isGitRepo(nonRepo), false)
assert.deepEqual(await ensureBranch(nonRepo), { isRepo: false, branch: null, created: false })
rmSync(nonRepo, { recursive: true, force: true })

// --- a real repo on `main` ---
const dir = mkdtempSync(join(tmpdir(), 'dsgn-repo-'))
const g = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'pipe' })
g('init', '-b', 'main')
g('config', 'user.email', 't@example.com')
g('config', 'user.name', 'Test')
writeFileSync(join(dir, 'f.txt'), 'hi')
g('add', '.')
g('commit', '-m', 'init')
assert.equal(await getCurrentBranch(dir), 'main')

// ensureBranch from main → creates dsgn/main and checks it out
assert.deepEqual(await ensureBranch(dir), { isRepo: true, branch: 'dsgn/main', created: true })
assert.equal(await getCurrentBranch(dir), 'dsgn/main')

// ensureBranch when already on a dsgn/* branch → keep it, don't recreate
assert.deepEqual(await ensureBranch(dir), { isRepo: true, branch: 'dsgn/main', created: false })

// switch to a new named branch (coerced + created)
assert.deepEqual(await switchBranch(dir, 'feature-y'), {
  isRepo: true,
  branch: 'dsgn/feature-y',
  created: true
})
assert.equal(await getCurrentBranch(dir), 'dsgn/feature-y')

// switch back to an existing branch → not created
assert.deepEqual(await switchBranch(dir, 'dsgn/main'), {
  isRepo: true,
  branch: 'dsgn/main',
  created: false
})

rmSync(dir, { recursive: true, force: true })
console.log('GIT OK — normalize, non-repo, ensure (create/keep), switch (create/existing)')
