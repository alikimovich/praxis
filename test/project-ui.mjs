import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { discoverProjectUi } from '../src/main/project-ui-catalog.ts'
import { exportProjectUi, runProjectUiTool, setProjectUiEnabled, projectUiInstructions } from '../src/main/project-ui.ts'
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'

await mkdir('test/artifacts', { recursive: true })
const root = await mkdtemp(join(process.cwd(), 'test/artifacts/project-ui-'))
try {
  await mkdir(join(root, 'components'))
  await writeFile(join(root, 'components/Card.tsx'), `import React from 'react'
/** A project card. */
export function Card({ title, tone = 'quiet', children }: { title: string; tone?: 'quiet' | 'loud'; children?: React.ReactNode }) {
  return <section className={'project-card ' + tone}><h2>{title}</h2>{children}</section>
}`)
  await writeFile(join(root, 'components/Button.tsx'), `import React from 'react'
export default function Button({ label, disabled = false }: { label: string; disabled?: boolean }) {
 return <button className="project-button" disabled={disabled}>{label}</button>
}`)
  await writeFile(join(root, 'components/Interactive.tsx'), `export function Interactive({ onClick }: { onClick: () => void }) { return <button onClick={onClick}>Go</button> }`)
  await writeFile(join(root, 'components/Pair.tsx'), `export function Alpha({ label }: { label: string }) { return <p>{label}</p> }; export function Beta() { return <hr /> }`)
  await writeFile(join(root, 'components/Render.tsx'), `export function Render({children}: {children: () => string}) { return <p>{children()}</p> }`)
  await writeFile(join(root, 'theme.css'), ':root { --brand: red; --space: 12px; }')
  await symlink('/tmp', join(root, 'outside'))
  const catalog = await discoverProjectUi(root)
  assert.deepEqual(catalog.components.map((c) => c.name).sort(), ['Alpha', 'Beta', 'Button', 'Card'])
  assert.ok(catalog.warnings.some((w) => w.includes('Interactive')))
  assert.match(catalog.styles.join('\n'), /--space: 12px/)
  const spec = { root: 'card', elements: {
    card: { type: 'Card', props: { title: 'A "quote" & {brace}', tone: 'loud' }, children: ['text', 'button'] },
    text: { type: 'Text', props: { text: '<script> & copy' }, children: [] },
    button: { type: 'Button', props: { label: 'Save' }, children: [] }
  } }
  const output = await exportProjectUi(catalog, { file: 'Page.tsx', spec })
  await writeFile(join(root, output.file), output.code)
  const { default: Page } = await import(join(root, output.file))
  const html = renderToStaticMarkup(React.createElement(Page))
  assert.match(html, /class="project-card loud"/)
  assert.match(html, /class="project-button"/)
  assert.match(html, /&lt;script&gt; &amp; copy/)
  assert.match(html, /A &quot;quote&quot; &amp; \{brace\}/)
  const bad = async (mutate, pattern) => {
    const next = structuredClone(spec); mutate(next)
    await assert.rejects(exportProjectUi(catalog, { file: 'Page.tsx', spec: next }), pattern)
  }
  await bad((s) => s.elements.card.children.push('card'), /cycle|tree/)
  await bad((s) => s.elements.card.children.push('missing'), /Missing/)
  await bad((s) => s.elements.card.props.tone = 'invented', /Invalid|Invalid option/)
  await bad((s) => s.elements.card.props.evil = 'x', /Invalid|Unrecognized/)
  await bad((s) => delete s.elements.card.props.title, /Invalid/)
  await bad((s) => s.elements.button.children.push('text'), /children/)
  await bad((s) => s.elements.card.visible = true, /Unrecognized/)
  await bad((s) => s.elements.card.props.title = { $state: '/x' }, /Invalid/)
  await assert.rejects(exportProjectUi(catalog, { file: '../outside.tsx', spec }), /repo-relative/)
  await assert.rejects(exportProjectUi(catalog, { file: 'components/Card.tsx', spec }), /replace/)
  assert.match((await runProjectUiTool(root, 'a', 'project_ui_catalog')).error, /off/)
  setProjectUiEnabled('a', true)
  assert.ok((await runProjectUiTool(root, 'a', 'project_ui_catalog')).prompt)
  assert.match((await runProjectUiTool(root, 'b', 'project_ui_catalog')).error, /off/)
  setProjectUiEnabled('a', false)
  assert.match((await runProjectUiTool(root, 'a', 'compose_project_ui', { file: 'Page.tsx', spec })).error, /off/)
  assert.match(projectUiInstructions(false), /OFF/)
  assert.match(projectUiInstructions(true), /project_ui_catalog/)
  console.log('PROJECT-UI OK: discovery, actual component rendering, strict export, session isolation and opt-out')
} finally {
  setProjectUiEnabled('a', false)
  await rm(root, { recursive: true, force: true })
}
