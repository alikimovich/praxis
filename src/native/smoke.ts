import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { NativeBridge } from './bridge'
import { dispatchIPC, views } from './platform'

export async function runNativeSmoke(host: NativeBridge, fixture: string, root: string) {
  const evaluate = async (code: string, view = 'main', isolated = false) => {
    try {
      return await host.request('evaluate', { view, code, isolated })
    } catch (error) {
      throw new Error(`Native evaluation failed in ${view}: ${code}`, { cause: error })
    }
  }
  const wait = async (code: string, view = 'main', timeout = 30000) => {
    const end = Date.now() + timeout
    let error: unknown
    while (Date.now() < end) {
      try {
        const value = await evaluate(code, view)
        if (value) return value
      } catch (e) {
        error = e
      }
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
    throw new Error(`Native check timed out: ${code}; ${error || ''}`)
  }
  await wait('!!window.api && !!document.querySelector(".empty__open")')
  if (await evaluate('navigator.userAgent.includes("Electron")'))
    throw new Error('Unexpected Electron renderer')
  await evaluate('document.querySelector(".empty__open").click()')
  await wait('!!document.querySelector("#native-title")', 'preview')
  await wait('!!window.__praxisSession?.getState().projectRoot')
  const detected = await evaluate(`window.api.project.detect(${JSON.stringify(fixture)})`)
  if (detected.framework !== 'static')
    throw new Error(`Unexpected project detection: ${JSON.stringify(detected)}`)
  const isolated = await evaluate(
    '!globalThis.webkit?.messageHandlers?.praxis && !globalThis.api',
    'preview'
  )
  if (!isolated) throw new Error('Preview has access to the privileged bridge')
  let denied = false
  try {
    await dispatchIPC('preview', {
      type: 'invoke',
      channel: 'source:read',
      args: [fixture, 'index.html:1:0']
    })
  } catch {
    denied = true
  }
  if (!denied) throw new Error('Preview IPC invoke was not denied')
  const source = await evaluate(
    `window.api.source.read(${JSON.stringify(fixture)}, 'index.html:3:1')`
  )
  if (!source) throw new Error('Source read failed')
  await evaluate('window.api.preview.setSelectMode(true)')
  const layers = await evaluate('window.api.layers.read()')
  if (!layers) throw new Error('Isolated preview layers did not answer')
  const title = layers.nodes.find((node: any) => node.id === 'native-title')
  if (!title) throw new Error('Stamped heading is missing from layers')
  await evaluate(
    `window.api.layers.select(${JSON.stringify(title.path)}, ${JSON.stringify({ tag: title.tag, source: title.source })})`
  )
  await wait(`window.__praxisSelection.getState().selected?.source === 'index.html:3:1'`)
  const styles = await evaluate(`window.api.styles.read(['font-size'])`)
  if (!styles?.values?.['font-size'])
    throw new Error('Selected element computed styles unavailable')
  const edited = await evaluate(
    `window.api.text.apply(${JSON.stringify(fixture)}, {source:'index.html:3:1', text:'Edited through Praxis Native'})`
  )
  if (!edited?.applied) throw new Error(`Source edit failed: ${JSON.stringify(edited)}`)
  await wait(
    `document.querySelector('#native-title')?.textContent === 'Edited through Praxis Native'`,
    'preview'
  )
  console.log('Native selection, computed styles, source edit, and managed live reload passed.')
  await evaluate(`window.api.edits.undo(${JSON.stringify(fixture)})`)
  await wait(
    `document.querySelector('#native-title')?.textContent === 'Native Praxis fixture'`,
    'preview'
  )
  await evaluate(`window.api.edits.redo(${JSON.stringify(fixture)})`)
  await wait(
    `document.querySelector('#native-title')?.textContent === 'Edited through Praxis Native'`,
    'preview'
  )
  writeFileSync(
    join(fixture, 'native-image.png'),
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jL1sAAAAASUVORK5CYII=',
      'base64'
    )
  )
  const media = await evaluate(
    `window.api.source.read(${JSON.stringify(fixture)}, 'native-image.png:1:0')`
  )
  if (!media?.media?.url) throw new Error('Native media token was not issued')
  const mediaWidth = await evaluate(
    `new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image.naturalWidth);image.onerror=()=>reject(new Error('Media image failed to load'));image.src=${JSON.stringify(media.media.url)}})`
  )
  if (mediaWidth !== 1) throw new Error('Native media scheme did not deliver the registered image')
  await evaluate(`window.api.source.popout(${JSON.stringify(fixture)}, 'index.html:3:1')`)
  const editor = [...views.keys()].find((id) => id.startsWith('editor-'))
  if (!editor) throw new Error('Native editor window was not created')
  await wait(`!!document.querySelector('.cm-content')`, editor)
  await evaluate(`(()=>{void window.api.source.closeWindow();return true})()`, editor)
  console.log('Native undo/redo, media scheme, and pop-out editor passed.')
  const artifacts = join(root, 'test/artifacts/native')
  mkdirSync(artifacts, { recursive: true })
  writeFileSync(join(artifacts, 'layers.json'), JSON.stringify(layers, null, 2))
  for (const view of ['main', 'preview']) {
    const image = await host.request('capture', { view })
    writeFileSync(join(artifacts, `${view}.png`), Buffer.from(image.png, 'base64'))
  }
  const snapshot = await evaluate('window.api.agent.workspaceSnapshot()')
  if (!snapshot) throw new Error('Shared agent backend did not answer')
  console.log(
    'NATIVE APP PASS — actual React UI, project open, managed server, WebKit preview, shared source/agent services, isolated layers, denied preview commands, captures.'
  )
  if (process.argv.includes('--live')) {
    const provider = process.env.PRAXIS_NATIVE_TEST_PROVIDER || 'claude'
    if (!['claude', 'codex'].includes(provider)) throw new Error('Unsupported native test provider')
    const model = provider === 'claude' ? 'haiku' : 'default'
    await evaluate(
      `(()=>{window.__praxisSession.getState().setProvider(${JSON.stringify(provider)});window.__praxisSession.getState().setModel(${JSON.stringify(model)});window.__praxisPermissions.getState().setMode('bypassPermissions');return true})()`
    )
    const options = {
      provider,
      permissionMode: 'bypassPermissions',
      ...(provider === 'claude' ? { model } : {})
    }
    const restarted = await evaluate(
      `(()=>{const root=${JSON.stringify(fixture)};const entry=window.__praxisWorkspace.getState().projects.find(p=>p.root===root);return window.api.agent.restartChat(root,entry.activeSessionKey??entry.key,${JSON.stringify(options)})})()`
    )
    if (!restarted.ok) throw new Error(`Could not start ${provider}: ${restarted.error}`)
    await evaluate(
      `(()=>{window.__nativeTestEvents=[];window.api.agent.onEvent(e=>window.__nativeTestEvents.push(e));return true})()`
    )
    const prompt =
      'Edit index.html in this temporary test project. Replace only the heading text "Edited through Praxis Native" with "NATIVE_AGENT_VERIFIED". Make the edit now, then reply briefly.'
    await evaluate(
      `(()=>{const input=document.querySelector('.composer__input');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,${JSON.stringify(prompt)});input.dispatchEvent(new Event('input',{bubbles:true}));return true})()`
    )
    await wait(
      `!!document.querySelector('.composer__send') && !document.querySelector('.composer__send').disabled`
    )
    await evaluate(`document.querySelector('.composer__send').click()`)
    await wait(
      `window.__nativeTestEvents.some(e=>e.type==='done'||e.type==='error')`,
      'main',
      180000
    )
    const events = await evaluate('window.__nativeTestEvents')
    writeFileSync(join(artifacts, 'live-events.json'), JSON.stringify(events, null, 2))
    const image = await host.request('capture', { view: 'main' })
    writeFileSync(join(artifacts, 'chat.png'), Buffer.from(image.png, 'base64'))
    const errors = events
      .filter((event: any) => event.type === 'error')
      .map((event: any) => event.message)
      .join('\n')
    const reply = events
      .filter((event: any) => event.type === 'delta')
      .map((event: any) => event.text)
      .join('')
    if (
      /^Not logged in\s*[·—-]\s*Please run \/login\s*$/i.test(reply.trim()) ||
      /unauthori[sz]ed|invalid api key|not logged in|authentication|credential|setup-token|please.*login/i.test(
        errors
      )
    ) {
      console.log('NATIVE-RUNTIME-LIVE SKIP — provider authentication is unavailable.')
      return
    }
    if (errors) throw new Error(`Native live agent failed: ${errors.slice(0, 1200)}`)
    if (!readFileSync(join(fixture, 'index.html'), 'utf8').includes('NATIVE_AGENT_VERIFIED'))
      throw new Error('Native live agent finished without the requested fixture edit')
    await wait(
      `document.querySelector('#native-title')?.textContent === 'NATIVE_AGENT_VERIFIED'`,
      'preview'
    )
    console.log(
      'NATIVE LIVE PASS — actual chat composer, provider turn, source edit, streamed reply, and preview reload.'
    )
  }
}
