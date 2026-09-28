import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { NativeBridge } from './bridge'
import { nativeChat, nativeIslands } from './chat-runtime'
import { serviceEvents } from './platform'
import { runChatIslandTool } from '../main/chat-islands'
import { shadowLight, type ShadowLightInput } from '../main/shadows'

/** Called inside smoke-islands' disposable fixture and restoration scope. */
export async function checkShadowIsland(host: NativeBridge, fixture: string, artifacts: string) {
  const chat = nativeChat.get(nativeChat.active)
  const file = join(fixture, 'island-light.js')
  const initial: ShadowLightInput = { x: .72, y: -.28, distance: 12, blur: 24, layers: 3, decay: .6, color: 'rgba(0, 0, 0, 0.35)' }
  const keys = Object.keys(initial) as (keyof ShadowLightInput)[]
  const code = keys.map(key => `const SHADOW_${key} = ${JSON.stringify(initial[key])};`).join('\n') + `
const SHADOW_CSS = ${JSON.stringify(shadowLight(initial).css)};
const card = document.createElement('div');
card.id = 'island-shadow-demo'; card.textContent = 'Shadow Light';
card.style.cssText = 'margin:80px;padding:40px;background:white;border-radius:20px;width:180px';
card.style.boxShadow = SHADOW_CSS;
document.body.append(card);
`
  const page = (code: string) => host.request('evaluate', { view: 'preview', code })
  const wait = async (check: () => Promise<boolean> | boolean) => {
    for (let i = 0; i < 160; i++) {
      try { if (await check()) return } catch { /* Reload/HMR can replace the document mid-read. */ }
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    throw new Error('Shadow Light native fixture did not reach the expected source/preview state.')
  }
  const previewMatches = async (values: ShadowLightInput) => !!await page(`(() => {
    const card = document.querySelector('#island-shadow-demo');
    if (!card || card.textContent !== 'Shadow Light') return false;
    const probe = document.createElement('div');
    probe.style.boxShadow = ${JSON.stringify(shadowLight(values).css)};
    document.body.append(probe);
    const expected = getComputedStyle(probe).boxShadow;
    probe.remove();
    return expected !== 'none' && getComputedStyle(card).boxShadow === expected;
  })()`)
  writeFileSync(file, code)
  await wait(() => previewMatches(initial))
  chat.messages = [
    { id: 'shadow-request', role: 'user', text: 'Surface Shadow Light controls.', statuses: [], segments: [{ kind: 'text', text: 'Surface Shadow Light controls.' }] },
    { id: 'shadow-answer', role: 'assistant', text: 'Adjust the light and layered shadow.', statuses: [], segments: [{ kind: 'text', text: 'Adjust the light and layered shadow.' }] }
  ]
  const bounds = [[-1, 1], [-1, 1], [0, 64], [0, 80], [1, 8], [0, 1]]
  const result = await runChatIslandTool(chat.chat, fixture, {
    action: 'define', engine: 'agent', manifest: {
      file: 'island-light.js', component: 'Card', title: 'Shadow Light',
      params: [...keys.map((key, i) => ({
        id: key, label: key[0].toUpperCase() + key.slice(1), kind: i === 6 ? 'color' : 'number',
        ...(i < 6 ? { min: bounds[i][0], max: bounds[i][1], step: i === 4 ? 1 : .01,
          ...(['distance', 'blur'].includes(key) ? { unit: 'px' } : {}) } : {}),
        apply: { strategy: 'literal', anchor: `const SHADOW_${key} = ` }
      })), { id: 'output', label: 'CSS', kind: 'text', apply: { strategy: 'literal', anchor: 'const SHADOW_CSS = ' } }]
    }, blocks: [{ id: 'shadow', title: 'Shadow Light', kind: 'shadow', output: 'css', params: [...keys, 'output'] }]
  }) as any
  assert.ok(result.id, JSON.stringify(result))
  serviceEvents.emit('event', 'agent:event', { projectKey: chat.chat, type: 'done', landingPending: false })
  await wait(async () => (await host.request('chatInspect')).islands.some((i: any) => i.id === result.id && i.status === 'ready'))
  const view = () => nativeIslands.sessions.get(chat.chat)!.views.get(result.id)!
  assert.equal(view().blocks[0].kind, 'shadow')
  assert.equal(view().fields.length, 8)
  const swiftReady = async () => (await host.request('chatInspect')).islands.some((i: any) =>
    i.id === result.id && i.sourceRevision === view().sourceRevision && i.blockKinds?.[0] === 'shadow' && i.fields === 8)
  await wait(swiftReady)
  const capture = async (name: string) => {
    await new Promise(resolve => setTimeout(resolve, 250))
    writeFileSync(join(artifacts, `shadow-light-${name}.png`), Buffer.from(await host.request('captureShell'), 'base64'))
  }
  await capture('initial')
  // Each independently adjustable control must change the actual computed shadow.
  const edits: Partial<ShadowLightInput>[] = [
    { x: -.8, y: .4 }, { distance: 40 }, { blur: 60 }, { layers: 6 }, { decay: .2 }, { color: 'rgba(60, 90, 160, 0.6)' }
  ]
  for (const [index, values] of edits.entries()) {
    const expected = { ...initial, ...values }
    await host.request('islandPerform', { island: result.id, action: 'commit', values })
    await wait(() => Object.entries(values).every(([key, value]) => readFileSync(file, 'utf8').includes(`const SHADOW_${key} = ${JSON.stringify(value)};`)))
    await wait(() => previewMatches(expected))
    await wait(() => view().fields.find(f => f.id === 'output')?.value === shadowLight(expected).css)
    await wait(swiftReady)
    if (index === 0) await capture('adjusted')
    await host.request('islandPerform', { island: result.id, action: 'undo' })
    await wait(() => readFileSync(file, 'utf8') === code)
    await wait(() => previewMatches(initial))
    await wait(swiftReady)
  }
  await capture('restored')
  console.log('NATIVE SHADOW LIGHT PASS — shadow block rendered; all six controls update computed preview CSS; Undo restores source and preview. Inspect shadow-light-*.png against the approved mockup.')
}
