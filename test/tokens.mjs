/**
 * Design-token detection test — proves the engine probes all three sources and
 * picks the right one per project (manifest → tailwind → CSS vars), through real
 * IPC, plus the palette UI. No dev server / auth needed.
 *
 * Run with: bun run test:tokens
 */
import { _electron as electron } from 'playwright'
import electronPath from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdirSync } from 'node:fs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const fixtures = join(root, 'test', 'fixtures')
const artifacts = join(root, 'test', 'artifacts')
mkdirSync(artifacts, { recursive: true })

const detect = (win, p) => win.evaluate((path) => window.api.tokens.detect(path), p)
const tok = (set, group, name) => set.groups.find((g) => g.name === group)?.tokens.find((t) => t.name === name)

let app
try {
  app = await electron.launch({
    executablePath: electronPath,
    args: [join(root, 'out', 'main', 'index.js')],
    cwd: root
  })
  const win = await app.firstWindow()
  await win.waitForSelector('.composer__input', { timeout: 15000 })

  // 1. Manifest wins over a Tailwind config present in the same project.
  const prio = await detect(win, join(fixtures, 'tokens-priority'))
  if (prio.source !== 'manifest') throw new Error(`priority source: ${prio.source}`)
  if (tok(prio, 'colors', 'primary')?.value !== '#2563eb') throw new Error('manifest color missing')
  if (prio.groups.some((g) => g.tokens.some((t) => t.value === '#000000'))) {
    throw new Error('Tailwind leaked despite manifest priority')
  }

  // 2. Tailwind config — nested colors flatten (brand-500), theme.extend honored.
  const tw = await detect(win, join(fixtures, 'tokens-tailwind'))
  if (tw.source !== 'tailwind') throw new Error(`tailwind source: ${tw.source}`)
  if (tok(tw, 'colors', 'brand-500')?.value !== '#2563eb') throw new Error('nested tw color missing')
  if (tok(tw, 'colors', 'accent')?.value !== '#f59e0b') throw new Error('flat tw color missing')
  if (tok(tw, 'spacing', 'gutter')?.value !== '16px') throw new Error('tw spacing missing')

  // 3. CSS custom properties — grouped by prefix, alias (var(...)) skipped.
  const css = await detect(win, join(fixtures, 'tokens-css'))
  if (css.source !== 'css') throw new Error(`css source: ${css.source}`)
  if (tok(css, 'color', '--color-bg')?.value !== '#ffffff') throw new Error('css var missing')
  if (tok(css, 'space', '--space-md')?.value !== '8px') throw new Error('css space missing')
  if (tok(css, 'color', '--color-surface')) throw new Error('css alias should be skipped')

  // 4. Palette UI renders the tokens with swatches for colors.
  await win.evaluate((set) => {
    window.__dsgnTokens.getState().setSet(set)
    window.__dsgnSession.getState().setProjectRoot('/tmp/x')
    window.__dsgnSelection.getState().setSelected({
      tag: 'button',
      id: 'cta',
      classes: ['btn'],
      selector: '#cta',
      source: null,
      text: 'Go',
      rect: { x: 0, y: 0, width: 0, height: 0 },
      styles: {}
    })
  }, prio)
  await win.click('text="Tokens"')
  await win.waitForSelector('.tokens__item', { timeout: 5000 })
  const swatches = await win.locator('.tokens__swatch').count()
  if (swatches < 1) throw new Error('color tokens should render a swatch')
  await win.screenshot({ path: join(artifacts, '12-tokens.png') })

  console.log('TOKENS OK — manifest/tailwind/css detected + palette renders')
} catch (err) {
  console.error('TOKENS FAILED:', err?.message ?? err)
  process.exitCode = 1
} finally {
  await app?.close()
}
