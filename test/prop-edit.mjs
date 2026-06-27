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
  // A schema-backed component auto-opens the floating prop panel (no toggle).
  await win.waitForSelector('.proppanel__row', { timeout: 5000 })
  const enumOptions = await win.$$eval('.proppanel__row select option', (os) =>
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

  // --- Broadened literals: TS-cast (`as const`) + no-substitution template
  // literal read as plain literals, not `expression:true`. (Badge.tsx:31) ---
  const B2 = 'src/Badge.tsx:31'
  const lit = await win.evaluate((a) => window.api.props.inspect(a.fixture, a.b2), { fixture, b2: B2 })
  if (field(lit, 'variant')?.value !== 'ok' || field(lit, 'variant')?.expression) {
    throw new Error(`TS-cast literal not read as enum 'ok': ${JSON.stringify(field(lit, 'variant'))}`)
  }
  if (field(lit, 'label')?.value !== 'Go' || field(lit, 'label')?.expression) {
    throw new Error(`template literal not read as string 'Go': ${JSON.stringify(field(lit, 'label'))}`)
  }
  const litApply = await win.evaluate(
    (a) => window.api.props.apply(a.fixture, { source: a.b2, name: 'label', kind: 'string', value: 'Hey' }),
    { fixture, b2: B2 }
  )
  if (!litApply.applied) throw new Error(`broadened-literal apply failed: ${JSON.stringify(litApply)}`)
  if (!readFileSync(badge, 'utf8').includes('label="Hey"')) {
    throw new Error('template-literal label was not spliced to label="Hey"')
  }

  // --- Token direct apply (T1): a color token whose name is a valid `variant`
  // enum option splices variant="warn" — no agent. (Badge.tsx:31) ---
  const t1 = await win.evaluate(
    (a) =>
      window.api.props.applyToken(a.fixture, {
        source: a.b2,
        token: { name: 'warn', value: '#f59e0b' },
        group: 'colors',
        tokenSource: 'manifest',
        classes: ['badge']
      }),
    { fixture, b2: B2 }
  )
  if (!t1.applied) throw new Error(`token T1 (schema enum) not applied: ${JSON.stringify(t1)}`)
  if (!readFileSync(badge, 'utf8').includes('variant="warn"')) {
    throw new Error('token T1 did not splice variant="warn"')
  }

  // --- Token direct apply (T3): a color token onto a single literal inline-style
  // color property swaps the value directly. (Swatch, Badge.tsx:37) ---
  const t3 = await win.evaluate(
    (a) =>
      window.api.props.applyToken(a.fixture, {
        source: 'src/Badge.tsx:37',
        token: { name: 'brand', value: '#f59e0b' },
        group: 'colors',
        tokenSource: 'manifest',
        classes: ['sw']
      }),
    { fixture }
  )
  if (!t3.applied) throw new Error(`token T3 (inline style) not applied: ${JSON.stringify(t3)}`)
  if (!readFileSync(badge, 'utf8').includes('#f59e0b')) {
    throw new Error('token T3 did not swap the inline-style color value')
  }

  // --- Agent fallback (rare path): a token onto a host element with no schema
  // match and no inline style → needsAgent. (h1, Badge.tsx:25) ---
  const fb = await win.evaluate(
    (a) =>
      window.api.props.applyToken(a.fixture, {
        source: 'src/Badge.tsx:25',
        token: { name: 'brand', value: '#f59e0b' },
        group: 'colors',
        tokenSource: 'manifest',
        classes: ['title']
      }),
    { fixture }
  )
  if (fb.applied || !fb.needsAgent) throw new Error(`ambiguous token should need the agent: ${JSON.stringify(fb)}`)

  // --- Cross-family guard: a colors token must NOT swap a non-color style
  // property (fontWeight). Property-name gating → agent, not a wrong splice.
  // (Weighted, Badge.tsx:43) ---
  const xfam = await win.evaluate(
    (a) =>
      window.api.props.applyToken(a.fixture, {
        source: 'src/Badge.tsx:43',
        token: { name: 'brand', value: '#f59e0b' },
        group: 'colors',
        tokenSource: 'manifest',
        classes: ['wt']
      }),
    { fixture }
  )
  if (xfam.applied || !xfam.needsAgent) {
    throw new Error(`colors token must not swap fontWeight: ${JSON.stringify(xfam)}`)
  }
  if (readFileSync(badge, 'utf8').includes("fontWeight: '#f59e0b'")) {
    throw new Error('colors token wrongly written into fontWeight')
  }

  // --- Token direct apply (T2): a tailwind color token swaps the single color
  // utility in a literal className. (TwColor, Badge.tsx:48) ---
  const t2 = await win.evaluate(
    (a) =>
      window.api.props.applyToken(a.fixture, {
        source: 'src/Badge.tsx:48',
        token: { name: 'primary', value: 'oklch(0.5 0.2 270)' },
        group: 'colors',
        tokenSource: 'tailwind',
        classes: ['text-gray-500', 'font-bold']
      }),
    { fixture }
  )
  if (!t2.applied) throw new Error(`token T2 (tailwind class) not applied: ${JSON.stringify(t2)}`)
  if (!readFileSync(badge, 'utf8').includes('text-primary font-bold')) {
    throw new Error('token T2 did not swap text-gray-500 → text-primary')
  }

  // --- T2 guard: two color utilities is ambiguous → agent, no silent swap.
  // (TwTwo, Badge.tsx:53) ---
  const t2amb = await win.evaluate(
    (a) =>
      window.api.props.applyToken(a.fixture, {
        source: 'src/Badge.tsx:53',
        token: { name: 'primary', value: 'oklch(0.5 0.2 270)' },
        group: 'colors',
        tokenSource: 'tailwind',
        classes: ['text-gray-500', 'bg-blue-100']
      }),
    { fixture }
  )
  if (t2amb.applied || !t2amb.needsAgent) {
    throw new Error(`two color utilities should be ambiguous → agent: ${JSON.stringify(t2amb)}`)
  }

  // --- T2 radius family: a radius token swaps the single rounded-* utility, and
  // leaves the spacing utility (p-4) alone. (TwRadius, Badge.tsx:58) ---
  const t2r = await win.evaluate(
    (a) =>
      window.api.props.applyToken(a.fixture, {
        source: 'src/Badge.tsx:58',
        token: { name: 'card', value: '0.5rem' },
        group: 'radius',
        tokenSource: 'tailwind',
        classes: ['rounded-lg', 'p-4']
      }),
    { fixture }
  )
  if (!t2r.applied) throw new Error(`radius-family class swap not applied: ${JSON.stringify(t2r)}`)
  const radTxt = readFileSync(badge, 'utf8')
  if (!radTxt.includes('rounded-card p-4')) {
    throw new Error('radius token did not swap rounded-lg → rounded-card (or touched p-4)')
  }

  console.log(
    'PROP-EDIT OK — schema, broadened literals, direct token apply (T1/T2/T3), agent fallback'
  )
} catch (err) {
  console.error('PROP-EDIT FAILED:', err?.message ?? err)
  process.exitCode = 1
} finally {
  writeFileSync(badge, original) // leave the fixture pristine
  await app?.close()
}
