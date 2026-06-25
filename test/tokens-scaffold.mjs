/**
 * Token-manifest scaffold test — through real IPC (no dev server/auth):
 *  - a token-less project gets a starter `.dsgn/tokens.json` (source → manifest).
 *  - scaffolding is idempotent (second call writes nothing).
 *  - it never shadows a live source: a Tailwind project is left untouched.
 *  - it never clobbers an existing manifest.
 *
 * Run with: bun run test:tokens-scaffold
 */
import { _electron as electron } from 'playwright'
import electronPath from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const work = mkdtempSync(join(tmpdir(), 'dsgn-tokens-'))

const project = (name) => {
  const dir = join(work, name)
  mkdirSync(dir, { recursive: true })
  return dir
}
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg)
}

const emptyDir = project('empty')

const twDir = project('tailwind')
writeFileSync(
  join(twDir, 'tailwind.config.js'),
  "module.exports = { theme: { colors: { brand: '#abcdef' } } }\n"
)

const manifestDir = project('manifest')
mkdirSync(join(manifestDir, '.dsgn'), { recursive: true })
const existingManifest = JSON.stringify({ palette: { accent: '#ff0000' } }, null, 2)
writeFileSync(join(manifestDir, '.dsgn', 'tokens.json'), existingManifest)

let app
try {
  app = await electron.launch({
    executablePath: electronPath,
    args: [join(root, 'out', 'main', 'index.js')],
    cwd: root
  })
  const win = await app.firstWindow()
  await win.waitForSelector('.composer__input', { timeout: 15000 })

  const scaffold = (dir) => win.evaluate((d) => window.api.tokens.scaffold(d), dir)
  const detect = (dir) => win.evaluate((d) => window.api.tokens.detect(d), dir)

  // Token-less project → starter manifest written, palette now from manifest.
  const first = await scaffold(emptyDir)
  assert(first.ok && first.written, `empty scaffold should write: ${JSON.stringify(first)}`)
  assert(first.set?.source === 'manifest', `expected manifest source: ${JSON.stringify(first.set)}`)
  assert(existsSync(join(emptyDir, '.dsgn', 'tokens.json')), 'tokens.json not on disk')
  const groups = (first.set?.groups ?? []).map((g) => g.name)
  for (const g of ['colors', 'spacing', 'radius', 'fontSize']) {
    assert(groups.includes(g), `starter missing "${g}" group; got ${groups.join(',')}`)
  }
  // detect now resolves the manifest too.
  const redetect = await detect(emptyDir)
  assert(redetect.source === 'manifest', `detect should see manifest: ${JSON.stringify(redetect)}`)

  // Idempotent: a second scaffold writes nothing.
  const second = await scaffold(emptyDir)
  assert(second.ok && !second.written, `scaffold should be idempotent: ${JSON.stringify(second)}`)

  // Tailwind project → never shadowed; nothing written, no .dsgn created.
  const tw = await scaffold(twDir)
  assert(tw.ok && !tw.written, `tailwind should not be scaffolded: ${JSON.stringify(tw)}`)
  assert(tw.set?.source === 'tailwind', `tailwind set expected: ${JSON.stringify(tw.set)}`)
  assert(!existsSync(join(twDir, '.dsgn')), 'tailwind project should not get a .dsgn dir')

  // Existing manifest → never clobbered.
  const man = await scaffold(manifestDir)
  assert(man.ok && !man.written, `existing manifest must be preserved: ${JSON.stringify(man)}`)
  const onDisk = readFileSync(join(manifestDir, '.dsgn', 'tokens.json'), 'utf8')
  assert(onDisk === existingManifest, 'existing manifest was modified')

  // --- UI: the offer card renders and "Add tokens" wires through to a write. ---
  const uiDir = project('ui')
  await win.evaluate((d) => {
    window.__dsgnSession.getState().setProjectRoot(d)
    window.__dsgnTokens.getState().reset()
    window.__dsgnTokens.getState().setOfferNeeded(true)
  }, uiDir)
  await win.waitForSelector('text=Add a starter design-token palette?', { timeout: 5000 })
  await win.click('.setup__yes')
  await win.waitForFunction(
    () =>
      window.__dsgnTokens.getState().offerNeeded === false &&
      window.__dsgnTokens.getState().set?.source === 'manifest',
    { timeout: 10000 }
  )
  assert(existsSync(join(uiDir, '.dsgn', 'tokens.json')), 'UI accept did not write the manifest')

  // --- UI: dismiss hides the card and suppresses it (offerDismissed sticks). ---
  await win.evaluate(() => {
    window.__dsgnTokens.getState().reset()
    window.__dsgnTokens.getState().setOfferNeeded(true)
  })
  await win.waitForSelector('text=Add a starter design-token palette?', { timeout: 5000 })
  await win.click('.setup__no')
  await win.waitForFunction(
    () =>
      window.__dsgnTokens.getState().offerDismissed === true &&
      window.__dsgnTokens.getState().offerNeeded === false,
    { timeout: 5000 }
  )
  const cardGone = await win.evaluate(
    () => !document.body.textContent?.includes('Add a starter design-token palette?')
  )
  assert(cardGone, 'token offer card should disappear after dismiss')

  console.log('TOKENS-SCAFFOLD OK — starter written, idempotent, never shadows/clobbers, card wired')
} catch (err) {
  console.error('TOKENS-SCAFFOLD FAILED:', err?.message ?? err)
  process.exitCode = 1
} finally {
  rmSync(work, { recursive: true, force: true })
  await app?.close()
}
