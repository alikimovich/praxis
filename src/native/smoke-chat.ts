import { writeFileSync } from 'node:fs'
import type { NativeBridge } from './bridge'
import { views } from './platform'

/** Deterministic stream/card coverage without calling a paid provider. */
export async function checkNativeChat(host: NativeBridge, screenshot: string) {
  const evaluate = (code: string) => host.request('evaluate', { view: 'main', code })
  const wait = async (check: (state: any) => boolean) => {
    for (let i = 0; i < 100; i++) {
      const state = await host.request('chatInspect')
      if (check(state)) return state
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    throw new Error('Swift chat state did not update')
  }
  const state = await wait(state => state.visible && state.chat)
  if (await evaluate(`!!document.querySelector('.composer__input, .chat__messages, .msg')`)) throw new Error('React chat DOM is still mounted')
  const send = (event: object) => views.get('main')!.webContents.send('agent:event', { ...event, projectKey: state.chat })
  // Stub only provider submission, preserving native input -> shared sender ->
  // agent API dispatch, user messages, draft clearing and queue behavior.
  await evaluate(`(() => {
    window.__nativeOriginalSend = window.api.agent.send;
    window.__nativeSent = [];
    window.api.agent.send = async (...args) => { window.__nativeSent.push(args); };
  })()`)
  try {
    await host.request('composerPerform', { text: 'Render this conversation in Swift.' })
    for (let i = 0; i < 100 && !(await host.request('composerInspect')).enabled; i++) await new Promise(resolve => setTimeout(resolve, 50))
    await host.request('composerPerform', { action: 'send' })
    await wait(state => state.messages.some((message: any) => message.role === 'user' && message.text === 'Render this conversation in Swift.'))
    if (!(await evaluate('window.__nativeSent.length === 1'))) throw new Error('Native Send did not reach agent API')
    await host.request('composerPerform', { text: 'A queued native message' })
    // Allow the input action and its controlled state to cross the bridge.
    for (let i = 0; i < 100; i++) {
      if ((await host.request('composerInspect')).text === 'A queued native message') break
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    await new Promise(resolve => setTimeout(resolve, 100))
    await host.request('composerPerform', { action: 'send' })
    const queued = await wait(state => state.cards.some((id: string) => id.startsWith('queued-')))
    const id = queued.cards.find((id: string) => id.startsWith('queued-'))
    await host.request('chatPerform', { action: 'queue-remove', card: id })
    await wait(state => !state.cards.includes(id))
    if (!(await evaluate('window.__nativeSent.length === 1'))) throw new Error('Queued message bypassed the active turn')
  } finally {
    await evaluate('window.api.agent.send = window.__nativeOriginalSend')
  }
  send({ type: 'delta', text: '# Native conversation\n\nThis response is **Swift-rendered** with [a link](https://example.com).\n\n```swift\nlet native = true\n```' })
  send({ type: 'status', text: 'Reading project files…' })
  send({ type: 'delta', text: '\n\nStreaming continued after tool activity.' })
  send({ type: 'landing-finished' })
  await wait(state => state.messages.some((message: any) => message.text.includes('Streaming continued after tool activity.')))
  send({ type: 'permission-request', request: { id: 'native-permission', sessionKey: state.chat, title: 'Allow fixture command?', detail: 'Read the test project' } })
  await wait(state => state.cards.includes('native-permission'))
  await host.request('chatPerform', { action: 'permission', card: 'native-permission', value: 'deny' })
  await wait(state => !state.cards.includes('native-permission'))
  send({ type: 'question-request', request: { id: 'native-question', sessionKey: state.chat, questions: [{ header: 'Layout', question: 'Which layout?', options: [{ label: 'Compact', description: 'Less spacing' }, { label: 'Roomy' }], multiSelect: false }] } })
  await wait(state => state.questionCount === 1)
  writeFileSync(screenshot, Buffer.from(await host.request('captureShell'), 'base64'))
  await host.request('chatPerform', { action: 'question', card: 'native-question', answers: { 'Which layout?': 'Compact' } })
  await wait(state => state.questionCount === 0)
  // A stale reply from another chat must never resolve this chat's request.
  send({ type: 'permission-request', request: { id: 'other-chat-permission', sessionKey: 'other-chat', title: 'Background permission' } })
  await wait(state => !state.cards.includes('other-chat-permission'))
  send({ type: 'permission-resolved', id: 'other-chat-permission' })
  console.log('Swift conversation, streamed Markdown/tool activity, native permissions/questions, and absent React chat DOM passed.')
}
