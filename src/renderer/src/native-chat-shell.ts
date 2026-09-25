import type { NativeChatBridge } from '../../shared/native-chat'
import type { NativeChatEffect } from '../../shared/native-chat-controller'
import { describeSelectionForPrompt, useAnnotations, useChat, useCodeDrawer, useComposer, useHistory, useLayersPanel, usePermissions, usePropsIsland, useSelection, useSession, useSetup, useSpawns, useTokens, useWorkspace } from './store'
import { recordLastUsedSettings } from './preferred-model'

/** Temporary shell adapter. Bun owns conversation state; this mirrors it for
 * toolbar/history badges and forwards workspace context, never native input. */
export function connectNativeChat(bridge: NativeChatBridge) {
  const effect = async (event: NativeChatEffect) => {
    if (event.type === 'spawn') {
      const spawn = event.event
      if (spawn.sessionId && spawn.projectKey) {
        if (spawn.type === 'spawn-started') useSpawns.getState().start(spawn.projectKey, spawn.sessionId, spawn.branch)
        else if (spawn.type === 'spawn-finished') useSpawns.getState().remove(spawn.projectKey, spawn.sessionId)
      }
    } else if (event.type === 'mirror') {
      const { chat, ...raw } = event.state
      const slice = { ...raw, messages: raw.messages.map(message => ({ ...message, attachments: message.attachments?.map(a => a.kind === 'file'
        ? { id: a.id, kind: 'file' as const, name: a.name ?? '', path: a.path ?? '' }
        : { id: a.id, kind: 'image' as const, mediaType: a.url?.match(/^data:([^;]+)/)?.[1] ?? 'image/png', url: a.url ?? '' }) })) }
      useChat.setState(state => ({ byKey: { ...state.byKey, [chat]: slice },
        ...(state.activeKey === chat ? { messages: slice.messages, isRunning: slice.isRunning, isolation: slice.isolation, isolationFiles: slice.isolationFiles } : {}) }))
    } else if (event.type === 'settings') {
      const ws = useWorkspace.getState(), entry = ws.projects.find(p => p.root === event.root)
      if (entry) ws.patchEntry(entry.key, { chatSettings: { ...entry.chatSettings, [event.chat]: event.settings } })
      if (useChat.getState().activeKey === event.chat) {
        useSession.getState().setModelSelection(event.settings)
        usePermissions.getState().setMode(event.settings.permissionMode)
      }
      recordLastUsedSettings(event.settings)
    } else if (event.type === 'selection-clear') {
      if (event.chat === useChat.getState().activeKey && (useSelection.getState().selected ? (useSelection.getState().selected!.selectionGroup ?? [useSelection.getState().selected!]).map(describeSelectionForPrompt).join('\n') : undefined) === event.prompt) useSelection.getState().setSelected(null)
    } else if (event.type === 'focus') bridge.focusComposer()
    else if (event.type === 'layers') useLayersPanel.getState().setOpen(!useLayersPanel.getState().open)
    else if (event.type === 'history') {
      const root = useSession.getState().projectRoot
      if (root) await useHistory.getState().load(root)
    } else if (event.type === 'setup' && event.chat === useChat.getState().activeKey) {
      const setup = useSetup.getState()
      if (event.phase === 'dismissed') { setup.setDismissed(true); setup.setNeeded(false) }
      else {
        setup.setPhase(event.phase)
        setup.setBusy(event.phase === 'configuring')
        setup.setVerifying(event.phase === 'landed')
        // Bun owns preview restart after native setup.
        if (event.status) setup.setStatus(event.status)
      }
    } else if (event.type === 'tokens' && event.root === useSession.getState().projectRoot) {
      useTokens.getState().setOfferNeeded(false)
      const set = await window.api.tokens.detect(event.root)
      if (event.root === useSession.getState().projectRoot) useTokens.getState().setSet(set)
    } else if (event.type === 'notes' && event.root === useSession.getState().projectRoot) {
      const notes = await window.api.annotations.list(event.root)
      if (event.root === useSession.getState().projectRoot) useAnnotations.getState().setList(notes)
    }
  }
  const subscriptions: (() => void)[] = []
  subscriptions.push(bridge.onEffect(event => { void effect(event).catch(console.error) }))
  subscriptions.push(useComposer.subscribe(value => {
    const chat = useChat.getState().activeKey
    if (value.seed != null) { useComposer.getState().setSeed(null); bridge.command({ type: 'seed', chat, text: value.seed }) }
    if (value.submit != null) { useComposer.getState().setSubmit(null); bridge.command({ type: 'submit', chat, text: value.submit }) }
  }))
  bridge.command({ type: 'attach' })
  return () => subscriptions.forEach(off => off())
}
