import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { NativeBridge } from './bridge'
import { nativeChat } from './chat-runtime'
import { revealComposerLatest } from './smoke-composer-latest'

/** Foreground composer evidence; provider calls are intercepted, never sent. */
export async function checkVisibleComposer(host: NativeBridge, fixture: string, artifacts: string) {
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
  const originalWidth = (await host.request('layoutInspect')).width
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
  // `latestText` is the end of the newest conversation content, required in
  // foreground pixels of the full chat column above the composer.
  const capture = async (name: string, expected: string[], latestText?: string) => {
    await revealComposerLatest(host, wait, name)
    const layout = await host.request('composerVerification')
    await new Promise(resolve => setTimeout(resolve, 350))
    const image = await host.request('captureVisibleComposer')
    const stem = join(artifacts, `composer-visible-${name}`)
    writeFileSync(`${stem}.png`, Buffer.from(image.png, 'base64'))
    const conversation = await host.request('captureVisibleChat', { fullColumn: true })
    writeFileSync(`${stem}-chat.png`, Buffer.from(conversation.png, 'base64'))
    const chatGeometry = await host.request('chatInspect')
    writeFileSync(`${stem}.json`, JSON.stringify({ ...layout, chatGeometry, conversationText: conversation.text, text: image.text, width: image.width, height: image.height }, null, 2))
    assert.equal(layout.foreground, true, JSON.stringify(layout))
    assert.equal(layout.contained, true, 'Input and control row share the bubble')
    assert.equal(layout.alignment, true, 'Attachment left; provider/model/Auto right: ' + JSON.stringify(layout))
    assert.equal(layout.hitTargets, true, 'Composer controls receive hits above glass/beam overlays')
    assert.ok(layout.bottomInset >= 7, 'Rounded bottom extends below the controls')
    // Side insets are the composer's own placement. The bottom gap is LKM-103's:
    // flush before it lands, equal to the sides after, never clipped/offset.
    const { left, right, bottom } = layout.outerInsets
    assert.ok(Math.abs(left - 10) < 0.01 && Math.abs(right - 10) < 0.01, `Equal 10pt side insets: ${JSON.stringify(layout.outerInsets)}`)
    assert.ok(Math.abs(bottom) < 0.01 || Math.abs(bottom - left) < 0.01, `Composer bottom is flush or matches the side inset: ${JSON.stringify(layout.outerInsets)}`)
    assert.equal(layout.conversationScroller.found, true, 'Conversation scroll view present')
    const latest = chatGeometry.messages.at(-1)
    if (latest) assert.ok(chatGeometry.visibleMessageIDs.includes(latest.id), 'Latest message remains reachable above composer')
    if (latestText) {
      assert.equal(layout.conversationScroller.scrollable, true, 'Capture exercises a scrollable conversation')
      assert.ok(conversation.text.join(' ').includes(latestText), `Foreground pixels of ${stem}-chat.png include the latest "${latestText}"`)
    }
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
    await choose('Permission mode', 'auto')
    const prompt = 'Composer verification message'
    await host.request('composerVerification', { typing: prompt })
    await wait(async () => (await inspect()).text === prompt && (await inspect()).enabled)
    await capture('draft', ['Codex', 'Fixture B', 'Auto', prompt, 'index.html'])
    await host.request('composerVerification', { submit: true })
    await wait(() => calls.some(c => c.channel === 'agent:send'))
    const sent = calls.filter(c => c.channel === 'agent:send')
    assert.equal(sent.length, 1)
    assert.ok(sent[0].args[0].includes(prompt) && sent[0].args[0].includes(attachment))
    assert.equal(sent[0].args[2], chat.chat)
    assert.ok(calls.some(c => c.channel === 'agent:restart-chat'))
    assert.deepEqual(calls.filter(c => c.channel === 'agent:set-permission-mode').map(c => c.args[0]), ['default', 'auto'])
    // Keep enough conversation content to expose the real scrollbar and verify
    // the latest message stays reachable as the composer grows and narrows.
    const finish = async (latest: string) => {
      const reply = Array.from({ length: 24 }, (_, i) => `Composer scroll fixture paragraph ${i + 1}.`).join('\n\n') + `\n\n${latest}`
      nativeChat.event({ type: 'delta', projectKey: chat.chat, text: reply })
      nativeChat.event({ type: 'done', projectKey: chat.chat, landingPending: false })
      await wait(async () => !chat.isRunning && !(await inspect()).text && !(await inspect()).attachments.length)
    }
    let latestReply = 'Latest composer fixture reply.'
    await finish(latestReply)
    await capture('submitted', ['Codex', 'Fixture B', 'Auto'], latestReply)
    const resize = async (width: number) => {
      const current = await host.request('layoutInspect')
      await host.request('dividerPerform', { delta: width - current.width })
      await wait(async () => Math.abs((await host.request('layoutInspect')).width - width) < 1)
    }
    const foreground = () => wait(async () => (await host.request('composerVerification', { prepare: true })).foreground)
    const sends = () => calls.filter(c => c.channel === 'agent:send')
    const restarts = () => calls.filter(c => c.channel === 'agent:restart-chat').length
    // Each width repeats the whole interaction set, so the manager run proves
    // every row control, both submit paths and disabled/sending states there.
    for (const [name, width, submit] of [['normal', 440, 'keySubmit'], ['narrow', 320, 'submit']] as const) {
      await resize(width)
      await foreground()
      await capture(`${name}-empty`, ['Codex', 'Fixture B', 'Auto'], latestReply)
      const empty = await host.request('composerVerification')
      assert.equal(empty.send.enabled, false, `${name}-empty: Send is disabled without a draft`)
      assert.ok(empty.textFits, `${name}-empty: empty input fits its viewport`)
      const sentBefore = sends().length
      await host.request('composerVerification', { submit: true })
      await host.request('composerVerification', { keySubmit: true })
      await new Promise(resolve => setTimeout(resolve, 300))
      assert.equal(sends().length, sentBefore, `${name}-empty: Send click and Return do not submit an empty draft`)
      assert.equal((await inspect()).text, '', `${name}-empty: Return does not insert a newline`)

      await host.request('composerVerification', { attachDialog: true })
      await wait(async () => (await host.request('composerVerification')).attachmentDialog)
      await host.request('composerVerification', { cancelDialog: true })
      await wait(async () => !(await host.request('composerVerification')).attachmentDialog)
      await foreground()
      const restartsBefore = restarts()
      await choose('Model', 'composer-a')
      await choose('Model', 'composer-b')
      assert.equal(restarts(), restartsBefore + 2, `${name}: model selector switches and restores the model`)
      const permissionsBefore = calls.filter(c => c.channel === 'agent:set-permission-mode').length
      await choose('Permission mode', 'default')
      await choose('Permission mode', 'auto')
      assert.deepEqual(calls.filter(c => c.channel === 'agent:set-permission-mode').slice(permissionsBefore).map(c => c.args[0]), ['default', 'auto'], `${name}: Auto control toggles`)

      // Five lines exceed the minimum form (mirrored by the windowless fixture).
      const multiline = ['First', 'Second', 'Third', 'Fourth', 'Fifth'].map(line => `${line} composer line`).join('\n')
      await host.request('composerVerification', { typing: multiline })
      await wait(async () => (await inspect()).text === multiline && (await inspect()).enabled)
      await capture(`${name}-multiline`, ['Codex', 'Fixture B', 'Auto', 'First composer line', 'Fifth composer line'], latestReply)
      const drafted = await host.request('composerVerification')
      assert.equal(drafted.send.enabled, true, `${name}-multiline: Send is enabled for a draft`)
      assert.ok(drafted.composerHeight > empty.composerHeight, `${name}-multiline: composer grows for the multiline draft`)
      assert.ok(drafted.textFits, `${name}-multiline: uncapped multiline draft fits without scrolling`)

      // Normal submits with physical Return; narrow clicks the row's Send.
      await host.request('composerVerification', { [submit]: true })
      await wait(() => sends().length === sentBefore + 1)
      const turn = sends().at(-1)!
      assert.ok(turn.args[0].endsWith(multiline), `${name}: ${submit} sends the multiline draft intact`)
      assert.equal(turn.args[2], chat.chat)
      await wait(async () => chat.isRunning && (await inspect()).text === '')
      await capture(`${name}-sending`, ['Auto'], 'Fifth composer line')
      const request = (await host.request('chatInspect')).messages.findLast((m: any) => m.role === 'user')
      assert.ok((await host.request('chatInspect')).visibleMessageIDs.includes(request.id), `${name}-sending: submitted message is visible above the composer`)
      const sending = await host.request('composerVerification')
      assert.equal(sending.send.label, 'Stop', `${name}-sending: Send becomes Stop while the turn runs`)
      assert.equal(sending.send.enabled, true, `${name}-sending: Stop remains available`)
      assert.equal(sending.composerHeight, empty.composerHeight, `${name}-sending: composer returns to compact height`)
      assert.deepEqual(sending.pickersEnabled, { Provider: false, Model: false, 'Permission mode': true }, `${name}-sending: model locks during the turn`)
      assert.deepEqual(sending.labels, ['Codex', 'Fixture B', 'Auto'], `${name}-sending: selectors retain their values`)
      latestReply = `Latest ${name} composer reply.`
      await finish(latestReply)
    }
    await resize(originalWidth)
    await foreground()
    await capture('restored', ['Codex', 'Fixture B', 'Auto'], latestReply)

    console.log('Visible composer: normal/narrow empty/multiline/sending captures, containment/hit targets, attachment dialog/file, model, Auto, Return/Send submission and disabled/Stop states passed.')
  } finally {
    const current = await host.request('layoutInspect')
    await host.request('dividerPerform', { delta: originalWidth - current.width })
    nativeChat.services.invoke = invoke
    nativeChat.choices = choices
    chat.settings = settings
    nativeChat.changed(chat)
  }
}
