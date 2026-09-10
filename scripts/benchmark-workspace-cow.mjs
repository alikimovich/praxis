// macOS/APFS investigation, not a production workspace implementation.
// Run: bun scripts/benchmark-workspace-cow.mjs [rounds=5]
// Only reads this repository's HEAD; all mutations are in an auto-removed temp dir.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, statfsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createChatWorktree, syncFromLive } from '../src/main/chat-worktrees.ts'
import { captureBase, retireWorktreeBranch } from '../src/main/worktrees.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const rounds = Number(process.argv[2] ?? 5)
assert(Number.isInteger(rounds) && rounds >= 3 && rounds <= 20)
assert.equal(process.platform, 'darwin', 'This benchmark targets macOS/APFS')
const temp = mkdtempSync(join(tmpdir(), 'praxis-cow-bench-'))
const run = (cmd, args, cwd = temp) => execFileSync(cmd, args, {
  cwd, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe']
})
const git = (cwd, ...args) => run('git', args, cwd).trim()
const measurements = {}
async function timed(key, fn) {
  const start = performance.now()
  const result = await fn()
  ;(measurements[key] ??= []).push(performance.now() - start)
  return result
}

// Native FORCE cloning: Node v26.7.0 returned ENOSYS for FICLONE_FORCE on this
// machine although clonefile itself succeeds. Compilation is outside timings.
const cloneCode = `
#include <copyfile.h>
#include <dirent.h>
#include <stdio.h>
#include <string.h>
#include <sys/stat.h>
#include <limits.h>
int clone_path(const char *source, const char *dest, int top) {
  struct stat info;
  if (lstat(source, &info)) { perror(source); return 1; }
  if (!S_ISDIR(info.st_mode)) {
    if (copyfile(source,dest,NULL,COPYFILE_ALL | COPYFILE_NOFOLLOW | COPYFILE_CLONE_FORCE)) {
      perror(source); return 1;
    }
    return 0;
  }
  DIR *dir = opendir(source);
  if (!dir) { perror("opendir"); return 1; }
  mkdir(dest, info.st_mode & 0777);
  struct dirent *entry;
  while ((entry = readdir(dir))) {
    const char *name = entry->d_name;
    if (!strcmp(name,".") || !strcmp(name,"..")) continue;
    if (top && (!strcmp(name,".git") || !strcmp(name,"node_modules") || !strcmp(name,".env"))) continue;
    char src[PATH_MAX], dst[PATH_MAX];
    if (snprintf(src,sizeof(src),"%s/%s",source,name) >= sizeof(src) ||
        snprintf(dst,sizeof(dst),"%s/%s",dest,name) >= sizeof(dst)) return 2;
    if (clone_path(src,dst,0)) { closedir(dir); return 1; }
  }
  closedir(dir);
  return 0;
}
int main(int argc, char **argv) {
  return argc == 3 ? clone_path(argv[1],argv[2],1) : 2;
}
`
const helper = join(temp, 'clone-source')
const cloneSource = (source, dest) => run(helper, [source, dest])

try {
  writeFileSync(`${helper}.c`, cloneCode)
  run('clang', ['-O2', `${helper}.c`, '-o', helper])
  console.log(JSON.stringify({
    revision: git(root, 'rev-parse', 'HEAD'), rounds,
    os: run('sw_vers', ['-productVersion']).trim(), arch: process.arch,
    bun: Bun.version, node: run('node', ['--version']).trim(),
    filesystemType: statfsSync(temp).type
  }))
  // Export committed files without copying Git history, dependencies or secrets.
  const archive = join(temp, 'source.tar')
  run('git', ['archive', '--format=tar', `--output=${archive}`, 'HEAD'], root)
  for (const scenario of ['praxis', 'many-files', 'large-assets']) {
    const repo = join(temp, scenario)
    mkdirSync(repo)
    run('tar', ['-xf', archive, '-C', repo])
    if (scenario === 'many-files') {
      mkdirSync(join(repo, 'benchmark-files'))
      for (let i = 0; i < 5000; i++) {
        writeFileSync(join(repo, 'benchmark-files', `${i}.txt`), `file ${i}\n`.repeat(100))
      }
    }
    if (scenario === 'large-assets') {
      mkdirSync(join(repo, 'benchmark-assets'))
      for (let i = 0; i < 8; i++) {
        writeFileSync(join(repo, 'benchmark-assets', `${i}.bin`), randomBytes(8 * 1024 * 1024))
      }
    }
    git(repo, 'init', '-q', '-b', 'main')
    git(repo, 'config', 'user.name', 'Benchmark')
    git(repo, 'config', 'user.email', 'benchmark@local')
    git(repo, 'add', '-A')
    git(repo, 'commit', '-q', '-m', 'fixture')
    const files = git(repo, 'ls-files', '-z').split('\0').filter(Boolean)
    console.log(JSON.stringify({scenario, files: files.length,
      logicalMiB: +(files.reduce((n, f) => n + statSync(join(repo, f)).size, 0) / 2 ** 20).toFixed(2)}))
    // Exercise tracked WIP, untracked WIP, and live staged-state preservation.
    writeFileSync(join(repo, 'README.md'), readFileSync(join(repo, 'README.md'), 'utf8') + '\nBenchmark WIP\n')
    git(repo, 'add', 'README.md')
    writeFileSync(join(repo, 'benchmark-untracked.txt'), 'untracked WIP\n')
    const stagedBefore = git(repo, 'diff', '--cached')
    const worktrees = join(temp, `${scenario}-worktrees`)
    mkdirSync(worktrees)
    for (let i = 0; i < rounds; i++) {
      // Alternate ordering to reduce a consistent cache/order advantage.
      for (const mode of i % 2 ? ['cow', 'current'] : ['current', 'cow']) {
        const id = `${mode}-${i}`
        const dest = join(worktrees, id)
        let wt
        if (mode === 'current') {
          wt = await timed(`${scenario}:current-create`, () => createChatWorktree(repo, id, worktrees))
        } else {
          wt = await timed(`${scenario}:cow-hybrid-create`, async () => {
            const baseSha = await captureBase(repo, join(worktrees, `.index-${id}`))
            const branch = `praxis/chat-${id}`
            git(repo, 'worktree', 'add', '--no-checkout', '-b', branch, dest, baseSha)
            cloneSource(repo, dest)
            git(dest, 'read-tree', baseSha)
            return {id, repoRoot: repo, path: dest, branch, baseSha}
          })
        }
        // Prototype copies a quiescent fixture, not a live atomic snapshot. A
        // production fast path must verify content against baseSha before use.
        assert.equal(git(dest, 'diff', 'HEAD'), '')
        assert.equal(readFileSync(join(dest, 'benchmark-untracked.txt'), 'utf8'), 'untracked WIP\n')
        await retireWorktreeBranch(wt)
        const sync = await timed(`${scenario}:${mode}-unchanged-sync`, () => syncFromLive(repo, wt))
        assert.equal(sync.synced, false)
        writeFileSync(join(repo, 'benchmark-untracked.txt'), 'live drift\n')
        const drift = await timed(`${scenario}:${mode}-changed-sync`, () => syncFromLive(repo, wt))
        assert.equal(drift.synced, true)
        assert.equal(readFileSync(join(dest, 'benchmark-untracked.txt'), 'utf8'), 'live drift\n')
        writeFileSync(join(dest, 'benchmark-untracked.txt'), 'private edit\n')
        assert.equal(readFileSync(join(repo, 'benchmark-untracked.txt'), 'utf8'), 'live drift\n')
        writeFileSync(join(repo, 'benchmark-untracked.txt'), 'untracked WIP\n')
        git(repo, 'worktree', 'remove', '--force', dest)
        git(repo, 'branch', '-D', wt.branch)
      }
      const raw = join(temp, `${scenario}-raw-${i}`)
      await timed(`${scenario}:raw-cow-source-only`, () => cloneSource(repo, raw))
      rmSync(raw, {recursive: true, force: true})
      await timed(`${scenario}:capture-base`, () => captureBase(repo, join(worktrees, '.index-probe')))
    }
    assert.equal(git(repo, 'diff', '--cached'), stagedBefore)
    console.log(JSON.stringify({scenario, checks: 'content, untracked WIP, private writes, sync, staged state: pass'}))
  }
  for (const [name, values] of Object.entries(measurements)) {
    const sorted = [...values].sort((a, b) => a - b)
    console.log(JSON.stringify({name, medianMs: +sorted[Math.floor(sorted.length / 2)].toFixed(1),
      minMs: +sorted[0].toFixed(1), maxMs: +sorted.at(-1).toFixed(1), samplesMs: values.map(n => +n.toFixed(1))}))
  }
} finally {
  rmSync(temp, {recursive: true, force: true})
}
