import type { NativeChatBridge } from '../../shared/native-chat'
import type { NativeChatContext, NativeChatEffect } from '../../shared/native-chat-controller'
import { describeSelectionForPrompt, selectionForBubble, useAnnotations, useChat, useCodeDrawer, useComposer, useHistory, useLayersPanel, usePermissions, usePropsIsland, useSelection, useSession, useSetup, useSpawns, useTokens, useWorkspace } from './store'
import { recordLastUsedSettings } from './preferred-model'
import { readProjectUiEngine, readProjectUiPreference } from './project-ui-preference'

/** Temporary shell adapter. Bun owns conversation state; this mirrors it for
 * toolbar/history badges and forwards workspace context, never native input. */
export function connectNativeChat(bridge: NativeChatBridge) {
  let last = ''
  const context = (): NativeChatContext => {
    const chat = useChat.getState().activeKey
    const project = useWorkspace.getState().projects.find(p => p.key === chat || p.sessionKeys?.includes(chat))
    const selected = useSelection.getState().selected
    const group = selected ? selected.selectionGroup ?? [selected] : []
    const setup = useSetup.getState(), tokens = useTokens.getState()
    return {
      chat, root: project?.root ?? null,
      selection: selected ? { label: group.length > 1 ? `${group.length} objects` : selected.tag,
        prompt: group.map(describeSelectionForPrompt).join('\n'),
        bubble: group.length > 1 ? { tag: `${group.length} objects`, ident: '', source: null } : selectionForBubble(selected) } : null,
      turn: { projectUi: readProjectUiPreference(), projectUiEngine: readProjectUiEngine() },
      setup: { needed: setup.needed, dismissed: setup.dismissed, status: setup.status },
      tokens: { needed: tokens.offerNeeded, dismissed: tokens.offerDismissed },
      notes: useAnnotations.getState().list.map(n => ({ id: n.id, text: n.text })),
      spawns: (useSpawns.getState().byKey[chat] ?? []).map(s => ({ id: s.id, label: s.label, status: s.status }))
    }
  }
  const sync = () => {
    const value = context(), serialized = JSON.stringify(value)
    if (serialized === last) return
    last = serialized; bridge.command({ type: 'context', context: value })
  }
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
      if (event.chat === useChat.getState().activeKey && context().selection?.prompt === event.prompt) useSelection.getState().setSelected(null)
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
        if (event.phase === 'landed') setup.setRestartRequested(true)
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
  const subscriptions = [useChat, useWorkspace, useSelection, useSetup, useTokens, useAnnotations, useSpawns].map(store => store.subscribe(sync))
  subscriptions.push(bridge.onEffect(event => { void effect(event).catch(console.error) }))
  subscriptions.push(useComposer.subscribe(value => {
    const chat = useChat.getState().activeKey
    if (value.seed != null) { useComposer.getState().setSeed(null); bridge.command({ type: 'seed', chat, text: value.seed }) }
    if (value.submit != null) { useComposer.getState().setSubmit(null); bridge.command({ type: 'submit', chat, text: value.submit }) }
  }))
  subscriptions.push(window.api.preview.onToolbarAction(kind => {
    const selected = useSelection.getState().selected
    if (!selected) return
    if (kind === 'delete') bridge.command({ type: 'submit', chat: useChat.getState().activeKey, text: 'Delete the selected element(s) from the source. Remove wrappers, imports, and styles that exist only for them.' })
    else if (kind === 'code' && selected.source) {
      const drawer = useCodeDrawer.getState()
      if (drawer.source === selected.source) drawer.close(); else drawer.open(selected.source)
    } else if (kind === 'props') usePropsIsland.getState().setOpen(!usePropsIsland.getState().open)
  }))
  bridge.command({ type: 'attach' })
  sync()
  return () => subscriptions.forEach(off => off())
}
