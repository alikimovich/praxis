import { NativeContentController } from './content-controller'
import type { NativeBridge } from './bridge'
import type { NativeWorkspaceController } from './workspace-controller'
import type { NativeChatController } from './chat-controller'
import type { NativeContextController } from './context-controller'
import { NativeInspectorController } from './inspector-controller'
import { dispatchIPC, serviceEvents } from './platform'
import { describeSelectionForPrompt, oneLine } from '../shared/selection-context'
import { backgroundAgentOptions } from '../shared/background-model'
import { agentOptionsFor } from '../shared/chat-settings'
export function installNativeInspector(host: NativeBridge, workspace: NativeWorkspaceController, chat: NativeChatController, context: NativeContextController, visualEdit: (root: string, prompt: string) => Promise<void>, openSource: (source?: string) => void, report: (error: unknown) => void) {
  const send = (channel: string, ...args: any[]) => dispatchIPC('main', { type: 'send', channel, args })
  const controller = new NativeInspectorController(workspace.services.invoke, send, state => host.send('inspectorState', { state }), async (root, prompt, submit) => {
    const entry = workspace.state.projects.find(p => p.root === root)
    if (!entry) return
    if (submit) await chat.command({ type: 'submit', chat: entry.activeSessionKey, text: prompt })
    else await visualEdit(root, prompt)
  }, () => chat.action({ chat: chat.active, action: 'setup' }))
  const content = new NativeContentController(workspace.services.invoke, (documentID, state) => host.send('contentState', { documentID, state }))
  const openContent = async (root: string) => {
    const panels = await workspace.services.invoke('content-controls:list', root)
    for (const panel of panels) if (!content.sessions.has(root + '\n' + panel.id)) await content.open(root, panel.id).catch(report)
  }
  host.on('content-action', action => { void content.action(action.documentID, action).catch(report) })
  host.on('menu', ({ action }) => { if (action === 'content' && workspace.active) { for (const [key, session] of content.sessions) if (session.root === workspace.active.root) { session.visible = true; content.publish(key, session) }; void openContent(workspace.active.root).catch(report) } })
  host.on('inspector-action', action => { void controller.action(action).catch(report) })
  const activate = workspace.services.activate
  workspace.services.activate = async entry => { void controller.activate(entry?.root ?? '').catch(report); if (entry) void openContent(entry.root).catch(report); await activate(entry) }
  const effect = chat.services.effect
  chat.services.effect = value => {
    effect(value)
    if (value.type === 'selection-clear' && value.chat === chat.active) void controller.select(null).catch(report)
  }
  serviceEvents.on('event', (channel, value) => {
    const entry = workspace.active
    if (!entry) return
    if (channel === 'content-controls:updated' && value.root === entry.root) { void openContent(entry.root).catch(report) }
    else if (channel === 'preview:element-picked') void controller.select(value).catch(report)
    else if (channel === 'preview:select-cancelled') { context.selection(null); void controller.select(null).catch(report) }
    else if (channel === 'preview:toolbar-action') {
      if (value === 'props') { controller.state.visible = !controller.state.visible; controller.publish() }
      else if (value === 'code' && controller.element?.source) openSource(controller.element.source)
      else if (value === 'delete' && controller.element) void chat.command({ type: 'submit', chat: entry.activeSessionKey, text: describeSelectionForPrompt(controller.element) + 'Delete the selected element(s) from the source. Remove wrappers, imports, and styles that exist only for them.' }).catch(report)
    } else if (channel === 'preview:text-edit') {
      void workspace.services.invoke('text:apply', entry.root, value).then(result => { if (!result.applied) return visualEdit(entry.root, result.agentPrompt ?? `In ${value.source}, change only the selected element's text to ${JSON.stringify(value.text)}.`) }).catch(report)
    } else if (channel === 'preview:comment') {
      if (value.kind === 'annotate') void workspace.services.invoke('annotations:add', entry.root, { source: value.el.source, selector: value.el.selector, tag: value.el.tag, text: value.text }).catch(report)
      else {
        const prompt = describeSelectionForPrompt(value.el) + oneLine(value.text, 2000), current = chat.chats.get(entry.activeSessionKey)
        void workspace.services.invoke('agent:spawn-comment', entry.root, prompt, entry.activeSessionKey, backgroundAgentOptions(current ? agentOptionsFor(current.settings) : {}, 'comment'), 'comment').then(result => { if (!result.ok) return chat.command({ type: 'submit', chat: entry.activeSessionKey, text: prompt }) }).catch(report)
      }
    } else if (channel === 'controls:updated' && (value?.root ?? value) === entry.root || channel === 'agent:event' && ['done', 'landing-finished', 'spawn-finished'].includes(value.type)) void controller.refresh().catch(report)
    else if (channel === 'controls:open' && value.root === entry.root) {
      controller.state.visible = true; controller.state.tab = value.tab; controller.publish(); void controller.refresh().catch(report)
    }
  })
  return controller
}
