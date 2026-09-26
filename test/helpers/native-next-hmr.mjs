import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { ChatIslands } from '../../src/main/chat-islands.ts'
import { mkdtemp, cp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { registerDevServerIpc } from '../../src/main/devserver.ts'
import { NativeBridge } from '../../src/native/bridge.ts'
import { NEXT_ADAPTER_CONTENT, NEXT_LOADER_CONTENT } from '../../src/main/setup-next.ts'
import { REACT_HELPER_CONTENT } from '../../src/main/setup-react.ts'
import { MDX_HELPER_CONTENT } from '../../src/main/setup-mdx.ts'
if (
  process.platform !== 'darwin' ||
  !existsSync('out/native/Praxis Native.app/Contents/MacOS/PraxisHost')
) {
  console.log('NATIVE-NEXT-HMR SKIP — build the macOS native host first.')
  process.exit(0)
}
const root = await mkdtemp(join(tmpdir(), 'praxis-hmr-'))
const handlers = new Map()
registerDevServerIpc(
  () => ({ webContents: { isDestroyed: () => false, send: (_, line) => console.log(line) } }),
  { handle: (name, fn) => handlers.set(name, fn) }
)
let host
try {
  await cp(resolve('test/fixtures/next-app'), root, {
    recursive: true,
    filter: (p) => !p.includes('node_modules') && !p.endsWith('bun.lock')
  })
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  pkg.dependencies.next = '16.3.5'
  pkg.dependencies['@next/mdx'] = '16.3.5'
  pkg.dependencies.react = '19.3.0'
  pkg.dependencies['react-dom'] = '19.3.0'
  await writeFile(join(root, 'package.json'), JSON.stringify(pkg))
  await mkdir(join(root, '.praxis'), { recursive: true })
  for (const [file, text] of Object.entries({
    'praxis-next.cjs': NEXT_ADAPTER_CONTENT,
    'praxis-next-loader.cjs': NEXT_LOADER_CONTENT,
    'praxis-source.cjs': REACT_HELPER_CONTENT,
    'praxis-mdx.mjs': MDX_HELPER_CONTENT
  }))
    await writeFile(join(root, '.praxis', file), text)
  const card = await readFile(join(root, 'app/Card.tsx'), 'utf8')
  await writeFile(join(root, 'app/Leaf.tsx'), card.replace("'use client'\n", ''))
  await writeFile(
    join(root, 'app/Card.tsx'),
    "'use client'; import Leaf from './Leaf'; import Effect from './Effect'; export default function Card({label}:{label:string}) {return <><Leaf label={label}/><Effect/></> }"
  )
  await writeFile(
    join(root, 'app/hover-effect.ts'),
    `'use client';
import { useEffect, type RefObject } from 'react';
const RADIUS = 32;
function attach(node: HTMLElement) {
  const enter = () => { node.style.width = RADIUS + 'px' };
  node.addEventListener('mouseenter', enter);
  return () => node.removeEventListener('mouseenter', enter);
}
export default function HoverEffect({ targetRef }: {targetRef: RefObject<HTMLDivElement | null>}) {
  const install = attach;
  useEffect(() => install(targetRef.current!), [targetRef, install]);
  return null;
}`
  )
  await writeFile(
    join(root, 'app/Effect.tsx'),
    `'use client';
import { useRef } from 'react';
import dynamic from 'next/dynamic';
const HoverEffect = dynamic(() => import('./hover-effect'), {ssr:false});
export default function Effect() {
  const ref = useRef<HTMLDivElement>(null);
  return <><HoverEffect targetRef={ref}/><div ref={ref} data-hover-effect style={{height:20}}>Hover effect</div></>;
}`
  )
  const installed = spawnSync('bun', ['install'], { cwd: root, stdio: 'inherit', timeout: 120000 })
  if (installed.error) throw installed.error
  if (installed.status !== 0) throw Error('install failed')
  const info = await handlers.get('devserver:start')(null, {
    root,
    command: 'bun run dev --webpack',
    framework: 'next'
  })
  host = new NativeBridge(
    resolve('out/native/Praxis Native.app/Contents/MacOS/PraxisHost'),
    resolve('out/native'),
    'ephemeral'
  )
  await once(host, 'ready', { signal: AbortSignal.timeout(15000) })
  host.send('visible', { view: 'preview', visible: true })
  host.send('load', { view: 'preview', url: info.url })
  const page = (code) => host.request('evaluate', { view: 'preview', code })
  async function wait(check, label = 'page update') {
    for (let i = 0; i < 200; i++) {
      try {
        if (await check()) return
      } catch {}
      await Bun.sleep(100)
    }
    throw Error('timed out: ' + label)
  }
  await wait(() => page('!!document.querySelector("button")'))

  await wait(async () => {
    await page('document.querySelector("button").click()')
    return page('document.querySelector("button").textContent.includes(": 1")')
  })
  await page('window.hmrSentinel=42')
  await Bun.sleep(1500)
  const file = join(root, 'app/Leaf.tsx')
  const code = await readFile(file, 'utf8')
  await writeFile(file, code.replace('{label}: {count}', 'Updated {label}: {count}'))
  await wait(() => page('document.body.innerText.includes("Updated First")'))
  assert.equal(
    await page('window.hmrSentinel'),
    42,
    'Agent-style source edits use HMR without a page reload'
  )
  // Exercise the same validated source transaction used by chat controls.
  const shadowCode = (await readFile(file, 'utf8'))
    .replace('import { useState }', 'const SHADOW_BLUR = 12;\nimport { useState }')
    .replace(
      '<button onClick=',
      '<button style={{boxShadow: `0px 8px ${SHADOW_BLUR}px rgba(0,0,0,0.3)`}} onClick='
    )
  await writeFile(file, shadowCode)
  const shadow = () => page('document.querySelector("button").style.boxShadow')
  await wait(async () => String(await shadow()).includes('12px'))
  const initial = await shadow()
  const islands = new ChatIslands(join(root, '.island-test'), () => {})
  islands.register('test', root, 'test', () => 1)
  const made = await islands.tool('test', root, {
    action: 'define',
    engine: 'agent',
    manifest: {
      file: 'app/Leaf.tsx',
      component: 'Card',
      title: 'Shadow',
      params: [
        {
          id: 'blur',
          label: 'Blur',
          kind: 'number',
          min: 0,
          max: 100,
          apply: { strategy: 'literal', anchor: 'const SHADOW_BLUR = ' }
        }
      ]
    },
    blocks: [{ id: 'shadow', title: 'Shadow', kind: 'group', params: ['blur'] }]
  })
  assert.ok(made.id, JSON.stringify(made))
  await islands.settle('test', true)
  const interact = async (action, values = {}) => {
    const view = islands.sessions.get('test').views.get(made.id)
    await islands.interact({
      chat: 'test',
      id: made.id,
      revision: view.revision,
      sourceRevision: view.sourceRevision,
      operation: crypto.randomUUID(),
      action,
      values
    })
  }
  await interact('commit', { blur: 36 })
  await wait(async () => String(await shadow()).includes('36px'))
  assert.equal(await page('window.hmrSentinel'), 42, 'Control commit must not reload the page')
  await interact('undo')
  await wait(async () => (await shadow()) === initial)
  assert.equal(await page('window.hmrSentinel'), 42, 'Undo must not reload the page')
  console.log('Component, source controls and Undo passed; checking imported hover callback.')
  const effect = await islands.tool('test', root, {
    action: 'define',
    engine: 'agent',
    manifest: {
      file: 'app/hover-effect.ts',
      component: 'Effect',
      title: 'Hover radius',
      params: [
        {
          id: 'radius',
          label: 'Radius',
          kind: 'number',
          min: 1,
          max: 100,
          apply: { strategy: 'literal', anchor: 'const RADIUS = ' }
        }
      ]
    },
    blocks: [{ id: 'geometry', title: 'Geometry', kind: 'group', params: ['radius'] }]
  })
  assert.ok(effect.id, JSON.stringify(effect))
  await islands.settle('test', true)
  const radius = () =>
    page(
      `(()=>{const el=document.querySelector('[data-hover-effect]');el.dispatchEvent(new MouseEvent('mouseenter'));return el.style.width})()`
    )
  assert.equal(await radius(), '32px')
  const changeEffect = async (action, values = {}) => {
    const v = islands.sessions.get('test').views.get(effect.id)
    await islands.interact({
      chat: 'test',
      id: effect.id,
      revision: v.revision,
      sourceRevision: v.sourceRevision,
      operation: crypto.randomUUID(),
      action,
      values
    })
  }
  await changeEffect('commit', { radius: 80 })
  await wait(async () => (await radius()) === '80px', 'imported radius 80')
  await changeEffect('undo')
  await wait(async () => (await radius()) === '32px')
  assert.equal(
    await page('window.hmrSentinel'),
    42,
    'Imported imperative effects refresh without navigation'
  )
  console.log(
    'NATIVE-NEXT-HMR PASS — Next 16.3.5 Webpack Fast Refresh, island source commit and Undo in system WebKit without page reload; no provider calls.'
  )
} finally {
  host?.send('quit')
  await handlers.get('devserver:stop')(null, root)
  await rm(root, { recursive: true, force: true })
}
