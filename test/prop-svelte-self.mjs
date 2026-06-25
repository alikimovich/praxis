/**
 * Svelte same-file prop-schema test (option D) — through real IPC:
 *  - selecting a host element INSIDE a component definition surfaces that
 *    component's own prop schema (a Svelte component instance has no DOM node to
 *    carry the usage-site stamp, so this is how the panel becomes reachable).
 *  - editing such a prop routes to the agent (a prop-default change), not a
 *    mis-splice onto the host element.
 *  - the cross-file usage path still resolves a schema (regression guard).
 *
 * Run with: bun run test:props-self
 */
import { _electron as electron } from 'playwright'
import electronPath from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const fixture = join(root, 'test', 'fixtures', 'svelte-app')
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

  const inspect = (src) =>
    win.evaluate((a) => window.api.props.inspect(a.fixture, a.src), { fixture, src })

  // The <button> host element inside Button.svelte:11 → Button's OWN props.
  const self = await inspect('src/Button.svelte:11')
  assert(self, 'no inspection for the definition host element')
  assert(self.hasSchema, `expected a schema from the component definition: ${JSON.stringify(self)}`)
  assert(self.component === 'Button', `component name should be Button: ${self.component}`)
  const names = self.fields.map((f) => f.name)
  for (const n of ['variant', 'label', 'count', 'rounded']) {
    assert(names.includes(n), `missing prop "${n}"; got ${names.join(',')}`)
  }
  const variant = self.fields.find((f) => f.name === 'variant')
  assert(variant?.kind === 'enum', `variant should be an enum: ${JSON.stringify(variant)}`)
  assert(
    JSON.stringify(variant.options) === JSON.stringify(['ok', 'warn', 'error']),
    `variant options wrong: ${JSON.stringify(variant.options)}`
  )
  // No instance context, so no misleading live value is surfaced — just the schema.
  assert(variant.value === undefined, `self-schema should not surface a value: ${JSON.stringify(variant.value)}`)
  assert(
    /default/i.test(self.note ?? '') && /per-instance/i.test(self.note ?? ''),
    `note should be honest about defaults / no per-instance value: ${self.note}`
  )

  // Editing a definition-scoped prop → agent (default change), not a host splice.
  const applied = await win.evaluate(
    (a) =>
      window.api.props.apply(a.fixture, {
        source: 'src/Button.svelte:11',
        name: 'variant',
        kind: 'enum',
        value: 'warn'
      }),
    { fixture }
  )
  assert(
    !applied.applied && applied.needsAgent,
    `definition prop edit should need the agent: ${JSON.stringify(applied)}`
  )

  // Regression: the cross-file usage path still resolves a live schema.
  const usage = await inspect('src/Card.svelte:7')
  assert(usage?.hasSchema, `cross-file usage schema regressed: ${JSON.stringify(usage)}`)
  assert(
    usage.fields.some((f) => f.name === 'variant'),
    'cross-file usage missing variant field'
  )

  // Negative: a host element in a propless file (Card.svelte's own <div>) stays
  // host-only — option D must not invent a schema.
  const propless = await inspect('src/Card.svelte:5')
  assert(propless && !propless.hasSchema, `propless host should have no schema: ${JSON.stringify(propless)}`)

  // Negative: a SvelteKit route file is excluded — its `data` is framework-injected,
  // not an editable component prop.
  const route = await inspect('src/+page.svelte:6')
  assert(route && !route.hasSchema, `route file should be excluded from self-schema: ${JSON.stringify(route)}`)

  console.log('PROP-SVELTE-SELF OK — definition host → schema, edits → agent, routes/propless excluded')
} catch (err) {
  console.error('PROP-SVELTE-SELF FAILED:', err?.message ?? err)
  process.exitCode = 1
} finally {
  await app?.close()
}
