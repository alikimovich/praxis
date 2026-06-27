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
import { createRequire } from 'node:module'
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
const rnDir = project('rn', { react: '^18.2.0', 'react-native': '^0.74.0', expo: '^51.0.0' })
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

  // React Native / Expo → testID-stamping Babel plugin (detected BEFORE plain react).
  const rn = await scaffold(rnDir)
  assert(
    rn.ok && rn.framework === 'react-native' && rn.strategy === 'babel-plugin-rn',
    `rn detect: ${JSON.stringify(rn)}`
  )
  assert(rn.files?.[0] === '.dsgn/dsgn-rn-source.cjs', `rn file: ${JSON.stringify(rn.files)}`)
  const rnSrc = readFileSync(join(rnDir, '.dsgn/dsgn-rn-source.cjs'), 'utf8')
  assert(/testID/.test(rnSrc) && /dsgn:/.test(rnSrc), 'rn helper should stamp a dsgn: testID')
  assert(/NODE_ENV === 'production'/.test(rnSrc), 'rn helper must dev-gate structurally')
  const rn2 = await scaffold(rnDir)
  assert(rn2.written === false, `rn scaffold should be idempotent: ${JSON.stringify(rn2)}`)
  await uninstall(rnDir)
  assert(!existsSync(join(rnDir, '.dsgn/dsgn-rn-source.cjs')), 'rn helper should uninstall')
  // The production dev-gate must be structural (an early return), not a comment.
  const reactSrc = readFileSync(join(reactDir, '.dsgn/dsgn-source.cjs'), 'utf8')
  assert(/process\.env\.NODE_ENV === 'production'\) return/.test(reactSrc), 'react helper missing production dev-gate')
  // v8 F3a: the plugin also stamps the component-instance source (unshifted so a
  // forwarding {...props} spread carries the outer authored instance down).
  assert(/data-dsgn-component-source/.test(reactSrc), 'react helper should stamp component-source')
  assert(/unshift/.test(reactSrc) && /isComponent/.test(reactSrc), 'component-source must be component-gated + unshifted')
  // v8 F3a: RUN the scaffolded plugin via @babel/core over a forwarding chain and
  // prove the ordering — component-source UNSHIFTED before {...props} (so the outer
  // authored instance wins), data-dsgn-source APPENDED after (innermost host wins).
  {
    const prevEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'development' // the plugin no-ops in production
    const req = createRequire(import.meta.url)
    const babel = req('@babel/core')
    const plugin = req(join(reactDir, '.dsgn/dsgn-source.cjs'))
    const FIXTURE = [
      'function Inner(props) { return <div {...props} className="leaf" /> }',
      'function Outer(props) { return <Inner {...props} /> }',
      'function App() { return <Outer title="X" /> }'
    ].join('\n')
    const out = babel.transformSync(FIXTURE, {
      filename: join(reactDir, 'src/Demo.tsx'),
      root: reactDir,
      configFile: false,
      babelrc: false,
      parserOpts: { plugins: ['jsx'] },
      plugins: [plugin]
    }).code
    process.env.NODE_ENV = prevEnv
    // Component <Inner>: component-source unshifted (before {...props}); source appended (after).
    assert(
      /<Inner\s+data-dsgn-component-source="[^"]+"\s+\{\.\.\.props\}\s+data-dsgn-source=/.test(out),
      `Inner ordering wrong — instance must win via unshift-before-spread:\n${out}`
    )
    // Host <div>: gets data-dsgn-source, but is NOT itself component-stamped (the
    // component-source flows onto it via {...props} at React runtime, not in source).
    assert(/<div\s+\{\.\.\.props\}[^>]*data-dsgn-source=/.test(out), `div host stamp wrong:\n${out}`)
    assert(!/<div[^>]*data-dsgn-component-source/.test(out), `host div must not be component-stamped:\n${out}`)
  }
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
