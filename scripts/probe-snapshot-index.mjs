// Demonstrate semantic hazards of private index reuse. No production changes.
// Run: bun scripts/probe-snapshot-index.mjs
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { captureBase } from '../src/main/worktrees.ts'

const exec = promisify(execFile)
const temp = await mkdtemp(join(tmpdir(), 'praxis-index-probes-'))
try {
  for (const probe of ['ignore-rules-without-reseed', 'attributes-change', 'autocrlf-change', 'restored-mtime-with-trustctime-disabled']) {
    const repo = join(temp, probe)
    await mkdir(repo)
    const g = async (args, env = {}) => (await exec('git', args, {
      cwd: repo, env: {...process.env, ...env}
    })).stdout.trim()
    await g(['init', '-q', '-b', 'main'])
    await g(['config', 'user.name', 'Probe'])
    await g(['config', 'user.email', 'probe@local'])
    await g(['config', 'core.autocrlf', 'false'])
    if (probe.includes('trustctime')) await g(['config', 'core.trustctime', 'false'])
    const file = join(repo, 'file.txt')
    await writeFile(file, 'hello\r\n')
    // Avoid a racily-clean index entry forcing a rehash and masking this probe.
    const old = new Date('2020-01-01T00:00:00Z')
    await utimes(file, old, old)
    await g(['add', '-A'])
    await g(['commit', '-qm', 'initial'])
    const env = {GIT_INDEX_FILE: join(temp, `${probe}.index`)}
    await g(['read-tree', 'HEAD'], env)
    if (probe.startsWith('ignore')) await writeFile(join(repo, 'new.txt'), 'untracked')
    await g(['add', '-A'], env)
    const before = await stat(file)
    if (probe.startsWith('ignore')) await writeFile(join(repo, '.gitignore'), 'new.txt\n')
    if (probe === 'attributes-change') await writeFile(join(repo, '.gitattributes'), '*.txt text eol=lf\n')
    if (probe === 'autocrlf-change') await g(['config', 'core.autocrlf', 'true'])
    if (probe.includes('trustctime')) {
      await writeFile(file, 'world\r\n')
      await utimes(file, before.atime, before.mtime)
    }
    if (!probe.startsWith('ignore')) await g(['read-tree', '-m', '-i', 'HEAD'], env)
    await g(['add', '-A'], env)
    const candidate = await g(['write-tree'], env)
    const reference = await captureBase(repo, join(temp, `${probe}-fresh.index`))
    const expected = await g(['rev-parse', `${reference}^{tree}`])
    const differs = candidate !== expected
    const differingPaths = differs ? (await g(['diff', '--name-only', expected, candidate])).split('\n') : []
    await rm(env.GIT_INDEX_FILE)
    await g(['read-tree', 'HEAD'], env)
    await g(['add', '-A'], env)
    const freshRebuildMatches = (await g(['write-tree'], env)) === expected
    assert(freshRebuildMatches, `${probe}: invalidating the index restores equivalence`)
    console.log(JSON.stringify({probe, cachedMatchesFresh: !differs,
      differingPaths, freshRebuildMatches}))
    // The ignored-file pitfall is deterministic and the reason for HEAD reseeding.
    if (probe.startsWith('ignore')) assert(differs)
  }
} finally {
  await rm(temp, {recursive: true, force: true})
}
