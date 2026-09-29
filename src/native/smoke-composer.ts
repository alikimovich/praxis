import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { NativeBridge } from './bridge'
import { nativeChat } from './chat-runtime'

/** Foreground composer evidence; provider calls are intercepted, never sent. */
export async function checkVisibleComposer(host: NativeBridge, fixture: string, artifacts: string) {
  const initial = await host.request('chatAcceptance', { prepare: true })
  try {
    for (const width of [440, 320]) {
      await host.request('chatAcceptance', { width })
      await checkComposerAtWidth(host, fixture, artifacts, width)
    }
  } finally {
    await host.request('chatAcceptance', { width: initial.chatWidth })
  }
}

async function checkComposerAtWidth(host: NativeBridge, fixture: string, artifacts: string, width: number) {
  const wait = async (check: () => Promise<any> | any) => {
    for (let i = 0; i < 100; i++) {
      const result = await check()
      if (result) return result
      await new Promise(resolve => setTimeout(resolve, 80))
    }
    throw new Error('Visible composer verification timed out')
  }
  const chat = nativeChat.get(nativeChat.active)
  const settings = { ...chat.settings }
  const choices = nativeChat.choices
  const invoke = nativeChat.services.invoke
  const calls: { channel: string; args: any[] }[] = []
  nativeChat.services.invoke = async (channel, ...args) => {
    if (['agent:restart-chat', 'agent:set-permission-mode', 'agent:send'].includes(channel)) {
      calls.push({ channel, args }); return { ok: true }
    }
    return invoke(channel, ...args)
  }
  const inspect = () => host.request('composerInspect')
  const capture = async (name: string, expected: string[]) => {
    const layout = await host.request('composerVerification')
    await new Promise(resolve => setTimeout(resolve, 350))
    const image = await host.request('captureVisibleComposer')
    const stem = join(artifacts, `composer-visible-${width}-${name}`)
    writeFileSync(`${stem}.png`, Buffer.from(image.png, 'base64'))
    writeFileSync(`${stem}.json`, JSON.stringify({ ...layout, text: image.text, width: image.width, height: image.height }, null, 2))
    assert.equal(layout.foreground, true, JSON.stringify(layout))
    assert.equal(layout.contained, true, 'Input and control row share the bubble')
    assert.equal(layout.alignment, true, 'Attachment left; provider/model/Auto right: ' + JSON.stringify(layout))
    assert.equal(layout.hitTargets, true, 'Composer controls receive hits above glass/beam overlays')
    assert.ok(layout.bottomInset >= 7, 'Rounded bottom extends below the controls')
    assert.ok(image.width > 200 && image.height > 100, 'Nonempty foreground composer pixels')
    for (const label of expected) assert.ok(image.text.join(' ').toLowerCase().includes(label.toLowerCase()), `Missing rendered ${label} in ${stem}.png`)
  }
  const choose = async (label: string, value: string) => {
    await host.request('composerVerification', { label, value })
    await wait(async () => {
      if (chat.pendingModel) await host.request('chatPerform', { action: 'model-confirm' })
      return !chat.switching && (await inspect()).choices.some((c: any) => c.label === label && c.value === value)
    })
  }
  try {
    assert.ok(chat.ready && !chat.isRunning && !chat.text && !chat.attachments.length, 'Idle empty composer fixture')
    nativeChat.choices = [
      { value: 'composer-a', modelId: 'composer-a', label: 'Fixture A', provider: 'codex', group: 'Codex' },
      { value: 'composer-b', modelId: 'composer-b', label: 'Fixture B', provider: 'codex', group: 'Codex' }
    ]
    chat.settings = { ...settings, provider: 'codex', connectionId: undefined, model: 'composer-a', modelId: 'composer-a', permissionMode: 'auto' }
    nativeChat.changed(chat)
    await wait(async () => (await inspect()).choices.some((c: any) => c.value === 'composer-a'))
    await wait(async () => (await host.request('composerVerification', { prepare: true })).foreground)
    await capture('initial', ['Codex', 'Fixture A', 'Auto'])
    await host.request('composerVerification', { attachDialog: true })
    await wait(async () => (await host.request('composerVerification')).attachmentDialog)
    await host.request('composerVerification', { cancelDialog: true })
    await wait(async () => !(await host.request('composerVerification')).attachmentDialog)
    await wait(async () => (await host.request('composerVerification', { prepare: true })).foreground)
    // The panel was exercised above; use the existing file hook for deterministic selection.
    const attachment = join(fixture, 'index.html')
    await host.request('composerPerform', { files: [attachment] })
    await wait(async () => (await inspect()).attachments.length === 1)
    await choose('Model', 'composer-b')
    await choose('Permission mode', 'default')
    await capture('ask', ['Codex', 'Fixture B', 'Ask always', 'index.html'])
    const prompt = Array(width === 320 ? 80 : 6).fill('Composer verification message').join('\n')
    await host.request('composerVerification', { typing: prompt })
    await wait(async () => (await inspect()).text === prompt && (await inspect()).enabled)
    await choose('Permission mode', 'auto')
    await capture('draft', ['Codex', 'Fixture B', 'Auto', 'Composer verification message', 'index.html'])
    await host.request('composerVerification', { submit: true })
    await wait(() => calls.some(c => c.channel === 'agent:send'))
    const sent = calls.filter(c => c.channel === 'agent:send')
    assert.equal(sent.length, 1)
    assert.ok(sent[0].args[0].includes(prompt) && sent[0].args[0].includes(attachment))
    assert.equal(sent[0].args[2], chat.chat)
    assert.ok(calls.some(c => c.channel === 'agent:restart-chat'))
    assert.deepEqual(calls.filter(c => c.channel === 'agent:set-permission-mode').map(c => c.args[0]), ['default', 'auto'])
    nativeChat.event({ type: 'done', projectKey: chat.chat, landingPending: false })
    await wait(async () => !chat.isRunning && !(await inspect()).text && !(await inspect()).attachments.length)
    await capture('submitted', ['Codex', 'Fixture B', 'Auto'])
    console.log('Visible composer: foreground captures, containment/hit targets, attachment dialog/file, model, Auto, AppKit typing and submission passed.')
  } finally {
    nativeChat.services.invoke = invoke
    nativeChat.choices = choices
    chat.settings = settings
    nativeChat.changed(chat)
  }
}
