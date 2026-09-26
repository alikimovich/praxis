import assert from 'node:assert/strict'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { once } from 'node:events'
import { NativeBridge } from '../../src/native/bridge.ts'

const directory = resolve('out/native')
const executable = `${directory}/Praxis Native.app/Contents/MacOS/PraxisHost`
if (process.platform !== 'darwin' || !existsSync(executable)) {
  console.log('NATIVE-CHAT-SCROLL SKIP — build the macOS native host first.')
  process.exit(0)
}
const artifacts = resolve('test/artifacts/native/chat-scroll')
mkdirSync(artifacts, { recursive: true })
const host = new NativeBridge(executable, directory, 'ephemeral')
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const message = (id, role, text) => ({ id, role, text, segments: [{ kind: 'text', text }] })
let stage = 'startup'
const capture = async name => writeFileSync(`${artifacts}/${name}.png`, Buffer.from(await host.request('captureShell'), 'base64'))
const visible = async id => {
  let state
  for (let i = 0; i < 40; i++) {
    state = await host.request('chatInspect')
    if (state.visibleMessageIDs?.includes(id)) return state
    await delay(50)
  }
  await capture(`failure-${stage}`)
  assert.fail(`${stage}: ${id} missing from visible messages: ${JSON.stringify(state)}`)
}
try {
  await Promise.race([once(host, 'ready'), delay(10000).then(() => { throw Error('Native host did not become ready') })])
  host.send('shellState', { state: { project: '/tmp/praxis-chat-scroll-fixture', chatWidth: 440, rows: [], homeState: { visible: false } } })
  for (const history of [0, 1, 8, 45]) {
    const state = {
      chat: `history-${history}`, messages: Array.from({ length: history }, (_, i) =>
        message(`old-${i}`, i % 2 ? 'assistant' : 'user', `Message ${i}\n\n${'A paragraph about the project. '.repeat(3 + i % 7)}`)),
      cards: [], questions: [], running: false, status: '↑ 46k ↓ 186',
      composer: { enabled: true, text: '', revision: 1 }
    }
    if (history === 1) state.messages[0] = message('old-0', 'user', Array.from({ length: 100 }, (_, i) => `Build log line ${i}: checking the project.`).join('\n'))
    const send = () => host.send('chatState', { state })
    send(); await delay(200)
    for (const lines of [1, 8, 80]) {
      stage = `history-${history}-draft-${lines}`
      state.composer = { enabled: true, text: 'Explain this change.\n'.repeat(lines), revision: lines * 2 }
      send(); await delay(150)
      const id = `question-${history}-${lines}`
      state.messages.push(message(id, 'user', 'Explain this change.'))
      state.running = true
      state.streamingId = `answer-${history}-${lines}`
      state.activity = { kind: 'thinking', label: 'Thinking…', animated: true }
      state.composer = { enabled: true, text: '', thinking: true, stop: true, revision: lines * 2 + 1 }
      send()
      await delay(80)
      await visible(id)
      if (history === 8 && lines === 8) await capture('sending')
      // Replace the standalone thinking row with a growing streamed response.
      state.messages.push(message(state.streamingId, 'assistant', ''))
      state.activity = { kind: 'writing', label: 'Writing…', animated: true }
      for (let chunk = 1; chunk <= 15; chunk++) {
        state.messages[state.messages.length - 1] = message(state.streamingId, 'assistant', 'The answer remains visible while it streams. '.repeat(chunk))
        send(); await delay(20)
      }
      await visible(state.streamingId)
      state.messages[state.messages.length - 1].workedMs = 104000
      state.messages[state.messages.length - 1].at = Date.now()
      state.running = false; state.activity = null
      state.composer.thinking = false; state.composer.stop = false
      send(); await visible(state.streamingId)
      assert.equal((await host.request('chatInspect')).height, (await host.request('layoutInspect')).canvasHeight)
    }
  }
  await capture('streamed')
  // Source-value refreshes must not request follow-to-bottom, even if the last
  // scroll event was missed. A new island definition remains conversation content.
  const island = {id:'controls',revision:1,title:'Radius',engine:'agent',status:'ready',detail:'',sourceRevision:'a',replay:false,
    blocks:[{id:'geometry',title:'Geometry',kind:'group',params:['radius']}],
    fields:[{id:'radius',label:'Radius',kind:'number',value:32,min:1,max:100,step:1}]}
  const controls = message('panel', 'assistant', 'Tune the radius.')
  controls.segments.push({kind:'island',island})
  const state = {chat:'controls-refresh',messages:[controls,...Array.from({length:20},(_,i)=>message(`later-${i}`,'assistant','Text after the controls. '.repeat(20)))],cards:[],questions:[],running:false,status:'',composer:{enabled:true,text:'',revision:1}}
  host.send('chatState',{state}); await delay(250)
  const before = await host.request('chatInspect')
  for (const value of [40,60,80,32]) {
    island.fields[0].value = value; island.sourceRevision = String(value)
    host.send('chatState',{state}); await delay(60)
    assert.equal((await host.request('chatInspect')).followRevision,before.followRevision,'Control values must not request auto-follow')
  }
  island.revision++
  host.send('chatState',{state}); await delay(100)
  assert((await host.request('chatInspect')).followRevision > before.followRevision,'New definitions can follow with conversation content')

  console.log('Native chat scroll: sent questions and streamed responses stay visible across short/long history and shrinking composers.')
} finally {
  host.child.kill()
  await once(host.child, 'exit')
}
