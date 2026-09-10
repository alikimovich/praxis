// Investigation only. Run: bun scripts/benchmark-snapshot-index.mjs [rounds=5]
// All mutations use disposable repos exported from this repository's HEAD.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { chmod, mkdir, mkdtemp, readFile, rename, rm, stat, symlink, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { captureBase, excludedWorktreePath } from '../src/main/worktrees.ts'

const exec = promisify(execFile)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const rounds = Number(process.argv[2] ?? 5)
assert(Number.isInteger(rounds) && rounds >= 3 && rounds <= 20)
const temp = await mkdtemp(join(tmpdir(), 'praxis-index-bench-'))
const results = {}
const command = async (cwd, args, env = {}) => (await exec('git', args, {
  cwd, env: {...process.env, ...env}, maxBuffer: 128 * 1024 * 1024
})).stdout.trim()
async function measure(name, fn) {
  const start = performance.now()
  const value = await fn()
  ;(results[name] ??= []).push(performance.now() - start)
  return value
}

// Private, disposable index; never copied from the user's index. Re-seeding from
// HEAD each time prevents prior untracked snapshot files becoming "tracked" and
// bypassing changed ignore rules. -m preserves stat data only for matching entries.
function prototype(repo, index, mode, prefix) {
  let prior = null
  return async () => {
    const env = {GIT_INDEX_FILE: index, GIT_AUTHOR_NAME: 'Praxis', GIT_AUTHOR_EMAIL: 'praxis@local',
      GIT_COMMITTER_NAME: 'Praxis', GIT_COMMITTER_EMAIL: 'praxis@local'}
    const g = (step, args) => measure(`${prefix}:${mode}:${step}`, () => command(repo, args, env))
    try {
      const refs = await g('head', ['rev-parse', 'HEAD', 'HEAD^{tree}'])
      const [head, headTree] = refs.split('\n')
      if (mode === 'fresh' || mode === 'clean-head') {
        await g('read-tree', ['read-tree', head])
      } else {
        try { await g('read-tree', ['read-tree', '-m', '-i', head]) }
        catch {
          prior = null
          await rm(index, {force: true})
          await g('rebuild-index', ['read-tree', head])
        }
      }
      await g('add', ['add', '-A'])
      const names = await g('exclusions', ['diff', '--cached', '--name-only', '-z', head])
      const excluded = names.split('\0').filter(Boolean).filter(excludedWorktreePath)
      if (excluded.length) await g('reset-excluded', ['reset', '-q', head, '--', ...excluded])
      const tree = await g('write-tree', ['write-tree'])
      if ((mode === 'reuse' || mode === 'clean-head') && tree === headTree) return head
      if (mode === 'reuse' && prior?.head === head && prior.tree === tree) return prior.sha
      const sha = await g('commit-tree', ['commit-tree', tree, '-p', head, '-m', 'praxis: snapshot benchmark'])
      prior = {head, tree, sha}
      return sha
    } catch (error) {
      prior = null
      await rm(index, {force: true})
      throw error
    } finally {
      if (mode === 'fresh' || mode === 'clean-head') await rm(index, {force: true})
    }
  }
}

async function init(repo) {
  await mkdir(repo)
  await command(repo, ['init', '-q', '-b', 'main'])
  await command(repo, ['config', 'user.name', 'Benchmark'])
  await command(repo, ['config', 'user.email', 'benchmark@local'])
}
async function commit(repo) {
  await command(repo, ['add', '-A'])
  await command(repo, ['commit', '-qm', 'fixture'])
}
async function tree(repo, sha) { return command(repo, ['rev-parse', `${sha}^{tree}`]) }

try {
  console.log(JSON.stringify({revision: await command(root, ['rev-parse', 'HEAD']), rounds,
    platform: process.platform, arch: process.arch, bun: Bun.version,
    git: await command(root, ['--version'])}))
  // Correctness oracle is the current production captureBase, not an invented diff.
  const repo = join(temp, 'correctness')
  await init(repo)
  await writeFile(join(repo, 'tracked.txt'), 'original\n')
  await writeFile(join(repo, '.gitignore'), '*.ignored\n')
  await writeFile(join(repo, 'mode.sh'), '#!/bin/sh\ntrue\n')
  await commit(repo)
  const index = join(temp, 'correctness-index')
  const cached = prototype(repo, index, 'reuse', 'correctness')
  let checks = 0
  async function check(label) {
    const before = await readFile(join(repo, '.git/index'))
    const expected = await captureBase(repo, join(temp, 'oracle-index'))
    const actual = await cached()
    assert.equal(await tree(repo, actual), await tree(repo, expected), label)
    assert.deepEqual(await readFile(join(repo, '.git/index')), before, `${label}: user index unchanged`)
    checks++
    console.log(JSON.stringify({check: label, pass: true}))
    return actual
  }
  assert.equal(await check('clean HEAD reuse'), await command(repo, ['rev-parse', 'HEAD']))
  await writeFile(join(repo, 'tracked.txt'), 'staged\n')
  await command(repo, ['add', 'tracked.txt'])
  await writeFile(join(repo, 'tracked.txt'), 'unstaged\n')
  await writeFile(join(repo, 'new.txt'), 'untracked\n')
  const first = await check('staged and unstaged WIP plus new file')
  assert.equal(await check('unchanged dirty snapshot reuse'), first)
  await writeFile(join(repo, 'tracked.txt'), 'new edit\n')
  await check('same-length rapid external edit')
  const info = await stat(join(repo, 'tracked.txt'))
  await writeFile(join(repo, 'tracked.txt'), 'new data\n')
  await utimes(join(repo, 'tracked.txt'), info.atime, info.mtime)
  await check('same-length edit with restored mtime, default Git stat settings')
  await writeFile(join(repo, '.gitignore'), '*.ignored\nnew.txt\n')
  await check('previous snapshot untracked file becomes ignored')
  await rm(join(repo, 'tracked.txt'))
  await rename(join(repo, 'mode.sh'), join(repo, 'renamed.sh'))
  await chmod(join(repo, 'renamed.sh'), 0o755)
  await symlink('renamed.sh', join(repo, 'link'))
  await check('delete, rename, executable mode, symlink')
  await writeFile(join(repo, '.env'), 'synthetic=secret\n')
  await mkdir(join(repo, '.praxis'))
  await writeFile(join(repo, '.praxis', 'state.json'), '{}')
  await mkdir(join(repo, 'node_modules'))
  await writeFile(join(repo, 'node_modules', 'synthetic.js'), 'not snapshotted')
  await check('unignored runtime and sidecar exclusions')
  await writeFile(index, 'corrupt index')
  await check('corrupt cache rebuild')
  await rm(index)
  await check('missing cache rebuild')
  await command(repo, ['commit', '-qm', 'advance HEAD with staged content'])
  await check('HEAD advances independently of working files')
  await command(repo, ['update-index', '--assume-unchanged', 'tracked.txt'])
  await writeFile(join(repo, 'tracked.txt'), 'changed despite live index flag\n')
  await check('user assume-unchanged flag does not leak into private index')
  await command(repo, ['update-index', '--no-assume-unchanged', 'tracked.txt'])
  await command(repo, ['update-index', '--skip-worktree', 'tracked.txt'])
  await check('user skip-worktree flag does not leak into private index')
  console.log(JSON.stringify({correctnessChecks: checks}))

  const archive = join(temp, 'source.tar')
  await command(root, ['archive', '--format=tar', `--output=${archive}`, 'HEAD'])
  for (const scenario of ['praxis', 'many-files', 'large-assets']) {
    const source = join(temp, scenario)
    await init(source)
    await exec('tar', ['-xf', archive, '-C', source])
    if (scenario === 'many-files') {
      await mkdir(join(source, 'benchmark-files'))
      for (let i = 0; i < 5000; i++) await writeFile(join(source, 'benchmark-files', `${i}.txt`), `file ${i}\n`.repeat(100))
    }
    if (scenario === 'large-assets') {
      await mkdir(join(source, 'benchmark-assets'))
      for (let i = 0; i < 8; i++) await writeFile(join(source, 'benchmark-assets', `${i}.bin`), randomBytes(8 * 1024 * 1024))
    }
    await commit(source)
    const modes = {
      production: () => captureBase(source, join(temp, `${scenario}-production-index`)),
      fresh: prototype(source, join(temp, `${scenario}-fresh-index`), 'fresh', scenario),
      'clean-head': prototype(source, join(temp, `${scenario}-clean-head-index`), 'clean-head', scenario),
      retained: prototype(source, join(temp, `${scenario}-retained-index`), 'retained', scenario),
      reuse: prototype(source, join(temp, `${scenario}-reuse-index`), 'reuse', scenario)
    }
    for (const [name, fn] of Object.entries(modes)) {
      await measure(`${scenario}:cold:${name}`, fn)
    }
    for (const workload of ['clean', 'dirty-unchanged', 'external-edit']) {
      if (workload !== 'clean') await writeFile(join(source, 'benchmark-wip.txt'), 'initial WIP\n')
      for (let i = 0; i < rounds; i++) {
        if (workload === 'external-edit') await writeFile(join(source, 'benchmark-wip.txt'), `edit ${i}\n`)
        const entries = Object.entries(modes)
        const ordered = [...entries.slice(i % entries.length), ...entries.slice(0, i % entries.length)]
        let expected
        for (const [name, fn] of ordered) {
          const sha = await measure(`${scenario}:${workload}:${name}`, fn)
          const value = await tree(source, sha)
          expected ??= value
          assert.equal(value, expected, `${scenario}/${workload}/${name}`)
        }
      }
    }
    console.log(JSON.stringify({scenario, pass: true}))
  }
  for (const [name, values] of Object.entries(results)) {
    if (name.startsWith('correctness:')) continue
    const sorted = [...values].sort((a, b) => a - b)
    const median = (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2
    console.log(JSON.stringify({name, medianMs: +median.toFixed(1), minMs: +sorted[0].toFixed(1),
      maxMs: +sorted.at(-1).toFixed(1), samplesMs: values.map(n => +n.toFixed(1))}))
  }
} finally {
  await rm(temp, {recursive: true, force: true})
}
