// S15 retirement census (docs/SWIFT-BACKEND-RETIREMENT.md), executable:
// - every Bun module under src/main, src/native and src/shared that writes files, runs a
//   process or sends a signal has exactly one census row, and every row still has one;
// - the gate line counts the Bun-owned rows, so the doc cannot claim readiness while
//   one remains, and the legacy rollback switch is still present while any does;
// - the project sidecars the editing owner commits are the same set in Swift and TS,
//   and the modules moved to it (notes, starter tokens) write nothing themselves.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const read = path => readFileSync(join(root, path), 'utf8')

const WRITES = new Set(['writeFile', 'writeFileSync', 'appendFile', 'appendFileSync', 'rename', 'renameSync', 'mkdir', 'mkdirSync',
  'mkdtemp', 'mkdtempSync', 'rm', 'rmSync', 'rmdir', 'rmdirSync', 'unlink', 'unlinkSync', 'symlink', 'symlinkSync', 'link', 'linkSync',
  'copyFile', 'copyFileSync', 'cp', 'cpSync', 'truncate', 'truncateSync', 'createWriteStream', 'chmod', 'chmodSync', 'utimes', 'utimesSync'])
const PROCESSES = new Set(['spawn', 'spawnSync', 'execFile', 'execFileSync', 'exec', 'execSync', 'fork'])

/** The effects a module can perform, from its imports and Bun/process calls. */
export function effects(source) {
  const found = new Set()
  for (const match of source.matchAll(/import\s+(type\s+)?\{([^}]*)\}\s+from\s+['"](?:node:)?(fs|fs\/promises|child_process)['"]/g)) {
    if (match[1]) continue
    for (const raw of match[2].split(',')) {
      const name = raw.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]
      if (WRITES.has(name)) found.add('fs')
      if (PROCESSES.has(name)) found.add('process')
    }
  }
  // A namespace or default import can reach anything.
  if (/import\s+(?:\*\s+as\s+\w+|\w+)\s+from\s+['"](?:node:)?(fs|fs\/promises|child_process)['"]/.test(source)) found.add('namespace')
  if (/\brequire\(\s*['"](?:node:)?(fs|fs\/promises|child_process)['"]\s*\)/.test(source)) found.add('namespace')
  if (/\bBun\.(spawn|spawnSync|write)\(/.test(source)) found.add('process')
  if (/\bprocess\.kill\(/.test(source)) found.add('signal')
  return found
}

// The scanner itself: a named write, a process, a namespace import, a signal; types and reads are not effects.
assert.deepEqual([...effects("import { readFile, writeFile as w } from 'node:fs/promises'")], ['fs'])
assert.deepEqual([...effects("import { execFile } from 'child_process'")], ['process'])
assert.deepEqual([...effects("import * as fs from 'fs'")], ['namespace'])
assert.deepEqual([...effects("import fs from 'node:fs'")], ['namespace'])
assert.deepEqual([...effects('process.kill(-pid, 0)')], ['signal'])
assert.deepEqual([...effects("import type { ChildProcess } from 'node:child_process'\nimport { readFile, stat } from 'fs/promises'")], [])

const walk = directory => readdirSync(join(root, directory)).flatMap(name => {
  const path = join(directory, name)
  if (statSync(join(root, path)).isDirectory()) return walk(path)
  return path.endsWith('.ts') && !path.endsWith('.d.ts') ? [path] : []
})
const scanned = new Map(['src/main', 'src/native', 'src/shared'].flatMap(walk).map(path => [relative('.', path), effects(read(path))]).filter(([, found]) => found.size))

const doc = read('docs/SWIFT-BACKEND-RETIREMENT.md')
const CLASSES = new Set(['rollback', 'helper', 'test', 'bun'])
const rows = [...doc.matchAll(/^\| `(src\/[^`]+)` \| (\w+) \| ([^|]+) \| ([^|]+) \|$/gm)].map(([, path, kind, owner, effect]) => ({ path, kind, owner: owner.trim(), effect: effect.trim() }))
assert.ok(rows.length > 0, 'the census table parses')

const listed = new Map()
for (const row of rows) {
  assert.ok(!listed.has(row.path), `${row.path} is listed once`)
  listed.set(row.path, row)
  assert.ok(CLASSES.has(row.kind), `${row.path}: unknown class ${row.kind}`)
  assert.ok(row.kind === 'test' || row.owner !== '—', `${row.path} names its final owner`)
  assert.ok(row.effect, `${row.path} names its effect`)
  assert.ok(scanned.has(row.path), `${row.path} has no file, process or signal effect any more: remove its row (and update the gate)`)
  if (row.kind === 'test') assert.match(row.path, /^src\/native\/smoke-/, `${row.path}: only smoke fixtures are test rows`)
}
const missing = [...scanned.keys()].filter(path => !listed.has(path))
assert.deepEqual(missing, [], `modules with effects missing from the census: ${missing.join(', ')}`)

// The gate line agrees with the rows, and blocked means the rollback switch stays.
const bun = rows.filter(row => row.kind === 'bun')
const gate = doc.match(/\*\*Retirement gate: (?:blocked by (\d+) Bun-owned rows?|open)\.\*\*/)
assert.ok(gate, 'the status names the retirement gate')
assert.equal(Number(gate[1] ?? 0), bun.length, 'the gate counts the Bun-owned rows')
if (bun.length) {
  const launcher = read('scripts/start-native.mjs')
  assert.match(launcher, /\['swift', 'legacy'\]/, 'TREZI_BACKEND_OWNER=legacy stays while the gate is blocked')
  assert.ok(rows.some(row => row.kind === 'rollback'), 'rollback owners stay while the gate is blocked')
}

// Project sidecars: one set in Swift and TS; the moved modules only render.
const swiftNames = read('src/service/EditingStores.swift').match(/static let names: Set<String> = \[([^\]]*)\]/)[1]
const tsNames = read('src/main/editing-owner.ts').match(/export const SIDECAR_NAMES[^=]*= \[([^\]]*)\]/)[1]
const names = text => [...text.matchAll(/["']([^"']+)["']/g)].map(match => match[1]).sort()
assert.deepEqual(names(swiftNames), names(tsNames), 'Swift and TS commit the same sidecars')
assert.deepEqual(names(tsNames), ['annotations.json', 'content-controls.json', 'control-panels.json', 'tokens.json'])
for (const path of ['src/main/annotation-store.ts', 'src/main/tokens.ts'])
  assert.deepEqual([...effects(read(path))], [], `${path} writes through the editing owner only`)

// `.trezi/` project files moved to the editing owner: the same helper list and legacy files in Swift and TS.
const literals = text => [...text.matchAll(/["']([^"']+)["']/g)].map(match => match[1])
const swiftProject = read('src/service/EditingProject.swift'), tsSetup = read('src/main/setup-artifacts.ts')
assert.deepEqual(literals(swiftProject.match(/static let helpers = \[([^\]]*)\]/)[1]), literals(tsSetup.match(/export const SETUP_HELPERS[^=]*= \[([^\]]*)\]/)[1]), 'Swift and TS sync the same setup helpers')
assert.deepEqual(literals(swiftProject.match(/static let dsgnFiles = \[([^\]]*)\]/)[1]), ['annotations.json', 'tokens.json', 'control-panels.json'])
assert.match(read('src/main/sidecar-migrate.ts'), /\['annotations\.json', 'tokens\.json', 'control-panels\.json'\]/, 'the TS migration moves the same .dsgn files')

const count = kind => rows.filter(row => row.kind === kind).length
console.log(`RETIREMENT CENSUS OK — ${rows.length} modules with effects classified (${count('rollback')} rollback, ${count('helper')} helper, ${count('test')} test, ${bun.length} Bun-owned: gate ${bun.length ? 'blocked' : 'open'})`)
