/**
 * Framework-aware setup test — through real IPC (no dev server/auth):
 *  - detect() reads package.json deps FIRST and branches per framework.
 *  - React/Solid → a Babel plugin under .dsgn/; Svelte → a markup preprocessor
 *    (with the right svelteMajor); Vue → inspector strategy, no file written;
 *    unknown → strategy 'none', nothing written.
 *  - scaffold is idempotent (second run: written=false).
 *  - uninstall removes the .dsgn helpers AND the legacy root-level plugin.
 *
 * Run with: bun run test:setup
 */
import { _electron as electron } from 'playwright'
import electronPath from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const work = mkdtempSync(join(tmpdir(), 'dsgn-setup-'))

/** Create a temp project dir with the given package.json deps. */
function project(name, deps) {
  const dir = join(work, name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, dependencies: deps }, null, 2))
  return dir
}

const reactDir = project('react', { react: '^18.2.0', '@vitejs/plugin-react': '^4.0.0' })
const svelte5Dir = project('svelte5', { '@sveltejs/kit': '^2.0.0', svelte: '^5.0.0' })
const svelte4Dir = project('svelte4', { svelte: '^4.2.0' })
const solidDir = project('solid', { 'solid-js': '^1.8.0' })
const vueDir = project('vue', { vue: '^3.4.0' })
const unknownDir = project('plain', { lodash: '^4.0.0' })

const assert = (cond, msg) => {
  if (!cond) throw new Error(msg)
}

let app
try {
  app = await electron.launch({
    executablePath: electronPath,
    args: [join(root, 'out', 'main', 'index.js')],
    cwd: root
  })
  const win = await app.firstWindow()
  await win.waitForSelector('.composer__input', { timeout: 15000 })

  const scaffold = (dir) => win.evaluate((d) => window.api.setup.scaffold(d), dir)
  const uninstall = (dir) => win.evaluate((d) => window.api.setup.uninstall(d), dir)

  // React → Babel plugin under .dsgn/
  const react = await scaffold(reactDir)
  assert(react.ok && react.framework === 'react' && react.strategy === 'babel-plugin', `react detect: ${JSON.stringify(react)}`)
  assert(react.files?.[0] === '.dsgn/dsgn-source.cjs', `react file: ${JSON.stringify(react.files)}`)
  assert(react.written === true, 'react should have written the helper')
  assert(existsSync(join(reactDir, '.dsgn/dsgn-source.cjs')), 'react helper not on disk')
  // The production dev-gate must be structural (an early return), not a comment.
  const reactSrc = readFileSync(join(reactDir, '.dsgn/dsgn-source.cjs'), 'utf8')
  assert(/process\.env\.NODE_ENV === 'production'\) return/.test(reactSrc), 'react helper missing production dev-gate')
  // Idempotent: second run doesn't rewrite.
  const react2 = await scaffold(reactDir)
  assert(react2.written === false, `react scaffold should be idempotent: ${JSON.stringify(react2)}`)

  // Svelte 5 → markup preprocessor, svelteMajor 5
  const svelte5 = await scaffold(svelte5Dir)
  assert(svelte5.framework === 'svelte' && svelte5.strategy === 'svelte-preprocess', `svelte5 detect: ${JSON.stringify(svelte5)}`)
  assert(svelte5.files?.[0] === '.dsgn/dsgn-svelte-stamp.mjs', `svelte5 file: ${JSON.stringify(svelte5.files)}`)
  assert(svelte5.svelteMajor === 5, `svelte5 major: ${svelte5.svelteMajor}`)
  assert(existsSync(join(svelte5Dir, '.dsgn/dsgn-svelte-stamp.mjs')), 'svelte5 helper not on disk')
  // Svelte helper is dev-gated too (a no-op preprocessor in production).
  const svelteSrc = readFileSync(join(svelte5Dir, '.dsgn/dsgn-svelte-stamp.mjs'), 'utf8')
  assert(/process\.env\.NODE_ENV === 'production'\) return/.test(svelteSrc), 'svelte helper missing production dev-gate')

  // Svelte 4 → same strategy, svelteMajor 4 (drives the export-let typing idiom)
  const svelte4 = await scaffold(svelte4Dir)
  assert(svelte4.framework === 'svelte' && svelte4.svelteMajor === 4, `svelte4 detect: ${JSON.stringify(svelte4)}`)

  // Solid → JSX Babel plugin (same helper as React)
  const solid = await scaffold(solidDir)
  assert(solid.framework === 'solid' && solid.strategy === 'babel-plugin', `solid detect: ${JSON.stringify(solid)}`)
  assert(existsSync(join(solidDir, '.dsgn/dsgn-source.cjs')), 'solid helper not on disk')

  // Vue → inspector strategy, NOTHING written (use its own inspector)
  const vue = await scaffold(vueDir)
  assert(vue.framework === 'vue' && vue.strategy === 'inspector', `vue detect: ${JSON.stringify(vue)}`)
  assert(vue.written === false && (vue.files?.length ?? 0) === 0, `vue should write nothing: ${JSON.stringify(vue)}`)
  assert(!existsSync(join(vueDir, '.dsgn')), 'vue should not create .dsgn')

  // Unknown → strategy none, nothing written
  const unknown = await scaffold(unknownDir)
  assert(unknown.framework === 'unknown' && unknown.strategy === 'none', `unknown detect: ${JSON.stringify(unknown)}`)
  assert(!existsSync(join(unknownDir, '.dsgn')), 'unknown should not create .dsgn')

  // Uninstall removes the .dsgn helper...
  const rm = await uninstall(reactDir)
  assert(rm.ok && rm.files?.includes('.dsgn/dsgn-source.cjs'), `uninstall report: ${JSON.stringify(rm)}`)
  assert(!existsSync(join(reactDir, '.dsgn/dsgn-source.cjs')), 'react helper not removed')

  // ...and the legacy root-level plugin from the old (buggy) behavior.
  writeFileSync(join(svelte4Dir, 'dsgn-source-plugin.cjs'), '// legacy')
  const rmLegacy = await uninstall(svelte4Dir)
  assert(rmLegacy.files?.includes('dsgn-source-plugin.cjs'), `legacy not removed: ${JSON.stringify(rmLegacy)}`)
  assert(!existsSync(join(svelte4Dir, 'dsgn-source-plugin.cjs')), 'legacy plugin still on disk')

  console.log('SETUP-DETECT OK — per-framework detect/scaffold/uninstall, idempotent, gated')
} catch (err) {
  console.error('SETUP-DETECT FAILED:', err?.message ?? err)
  process.exitCode = 1
} finally {
  rmSync(work, { recursive: true, force: true })
  await app?.close()
}
