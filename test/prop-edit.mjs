/**
 * Prop editor test — exercises the inspect/apply engine end to end through real
 * IPC (no dev server, no auth needed), plus the editor UI:
 *
 *   inspect Badge.tsx:17 → react-docgen schema (variant enum, label, count,
 *   rounded) merged with the live attribute values → apply variant=warn writes
 *   the source file → assert the file changed. Then drive the renderer's prop
 *   editor and confirm the typed rows render.
 *
 * Run with: bun run test:props
 */
import { _electron as electron } from 'playwright'
import electronPath from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const fixture = join(root, 'test', 'fixtures', 'propedit-app')
const badge = join(fixture, 'src', 'Badge.tsx')
const SRC = 'src/Badge.tsx:17' // the <Badge …> usage line
const artifacts = join(root, 'test', 'artifacts')
mkdirSync(artifacts, { recursive: true })

const original = readFileSync(badge, 'utf8')
const field = (insp, name) => insp.fields.find((f) => f.name === name)

let app
try {
  app = await electron.launch({
    executablePath: electronPath,
    args: [join(root, 'out', 'main', 'index.js')],
    cwd: root
  })
  const win = await app.firstWindow()
  await win.waitForSelector('.composer__input', { timeout: 15000 })

  // --- UI: render the prop editor for a selected element (original file). ---
  await win.evaluate(
    (args) => {
      window.__dsgnSession.getState().setProjectRoot(args.fixture)
      window.__dsgnSelection.getState().setSelected({
        tag: 'span',
        id: null,
        classes: ['badge'],
        selector: 'span.badge',
        source: args.src,
        text: 'Ready',
        rect: { x: 0, y: 0, width: 0, height: 0 },
        styles: {}
      })
    },
    { fixture, src: SRC }
  )
  await win.waitForSelector('.inspector__toggle', { timeout: 5000 })
  await win.click('.inspector__toggle') // Edit props
  await win.waitForSelector('.propedit__row', { timeout: 5000 })
  const enumOptions = await win.$$eval('.propedit__row select option', (os) =>
    os.map((o) => o.value).filter(Boolean)
  )
  for (const v of ['ok', 'warn', 'error']) {
    if (!enumOptions.includes(v)) {
      throw new Error(`variant enum missing "${v}"; got ${JSON.stringify(enumOptions)}`)
    }
  }
  await win.screenshot({ path: join(artifacts, '10-prop-editor.png') })

  // --- Engine: inspect resolves the react-docgen schema + live values. ---
  const inspection = await win.evaluate(
    (args) => window.api.props.inspect(args.fixture, args.src),
    { fixture, src: SRC }
  )
  if (!inspection) throw new Error('inspect returned null')
  if (inspection.component !== 'Badge') throw new Error(`component: ${inspection.component}`)
  const variant = field(inspection, 'variant')
  if (variant?.kind !== 'enum') throw new Error(`variant kind: ${variant?.kind}`)
  if (variant.value !== 'ok') throw new Error(`variant value: ${variant.value}`)
  if (field(inspection, 'label')?.kind !== 'string') throw new Error('label not string')
  if (field(inspection, 'count')?.value !== 3) throw new Error('count not 3')
  if (field(inspection, 'rounded')?.value !== true) throw new Error('rounded not true')

  // --- Engine: apply a literal edit and confirm the source file changed. ---
  const res = await win.evaluate(
    (args) =>
      window.api.props.apply(args.fixture, {
        source: args.src,
        name: 'variant',
        kind: 'enum',
        value: 'warn'
      }),
    { fixture, src: SRC }
  )
  if (!res.applied) throw new Error(`apply not applied: ${JSON.stringify(res)}`)
  const after = readFileSync(badge, 'utf8')
  if (!after.includes('variant="warn"')) throw new Error('source file was not edited to warn')
  if (after.includes('variant="ok"')) throw new Error('old value still present')

  // Same-line disambiguation: <Badge> inline in a <p> must resolve to Badge
  // (the innermost element on the line), not the parent <p>.
  const inline = await win.evaluate((args) => window.api.props.inspect(args.fixture, args.src), {
    fixture,
    src: 'src/Badge.tsx:21'
  })
  if (inline?.component !== 'Badge') {
    throw new Error(`same-line element resolved to "${inline?.component}", expected Badge`)
  }

  // Cross-file: <Button> used in Card.tsx but defined in Button.tsx — the schema
  // is resolved by following the import.
  const cross = await win.evaluate((args) => window.api.props.inspect(args.fixture, args.src), {
    fixture,
    src: 'src/Card.tsx:4'
  })
  if (cross?.component !== 'Button') throw new Error(`cross-file component: ${cross?.component}`)
  const kind = field(cross, 'kind')
  if (kind?.kind !== 'enum' || !kind.options?.includes('ghost')) {
    throw new Error('cross-file enum schema (kind) not resolved from Button.tsx')
  }
  if (field(cross, 'label')?.value !== 'Go') throw new Error('cross-file live value (label) wrong')

  console.log('PROP-EDIT OK — same-file + cross-file schema + literal edit to source')
} catch (err) {
  console.error('PROP-EDIT FAILED:', err?.message ?? err)
  process.exitCode = 1
} finally {
  writeFileSync(badge, original) // leave the fixture pristine
  await app?.close()
}
