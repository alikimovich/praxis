import type { NativeShellAction, NativeShellState } from '../shared/native-shell'
import type { NativeWorkspaceController } from './workspace-controller'
import type { NativeChatController } from './chat-controller'
import type { NativeGitController } from './git-controller'
import type { nativePreferences } from './preferences'
const title = (text?: string, fallback = 'New chat') => text?.replace(/\s+/g, ' ').trim().slice(0, 70) || fallback
export class NativeShellController {
  hidden = false
  selecting = false
  codeOpen = false
  location: string | null = null
  readonly icons = new Map<string, string | undefined>()
  private signature = ''
  private timer?: ReturnType<typeof setTimeout>
  constructor(readonly workspace: NativeWorkspaceController, readonly chat: NativeChatController, readonly git: NativeGitController, readonly preferences: ReturnType<typeof nativePreferences>, readonly send: (state: NativeShellState) => void, readonly project: (value: { chatHidden: boolean; viewport: string; selectMode: boolean }) => void) { this.hidden = preferences.get('praxis:chat-hidden') === '1' }
  schedule() { if (!this.timer) this.timer = setTimeout(() => { this.timer = undefined; this.render() }, 16) }
  render() {
    const ws = this.workspace.state, active = this.workspace.active
    for (const entry of ws.projects) if (!this.icons.has(entry.root)) {
      this.icons.set(entry.root, undefined)
      void this.workspace.services.invoke('project:icon', entry.root).then(icon => { this.icons.set(entry.root, icon?.dataUrl); this.schedule() }).catch(() => {})
    }
    const rows: NativeShellState['rows'] = ws.projects.map(p => ({ id: `project:${p.key}`, project: p.key, title: p.name, icon: this.icons.get(p.root), kind: 'project', children: [
      ...p.sessionKeys.map(key => { const chat = this.chat.chats.get(key); return { id: `chat:${key}`, project: p.key, session: key, kind: 'chat' as const, title: chat?.title || title(chat?.messages.find(m => m.role === 'user')?.text), running: chat?.isRunning ?? false } }),
      ...(ws.history[p.key] ?? []).map(r => ({ id: `history:${r.id}`, project: p.key, record: r.id, kind: 'history' as const, title: r.title || title(r.transcript.find(m => m.role === 'user')?.text, 'Previous chat') }))
    ] }))
    let url = active?.url ?? null
    try { if (url && this.location && new URL(url).origin === new URL(this.location).origin) url = this.location } catch {}
    const state = this.git.decorate({
      previewStatus: ws.status, rows, project: active?.key ?? null, selected: active ? `chat:${active.activeSessionKey}` : null,
      homeState: { visible: !active, busy: ws.status.kind === 'busy', label: ws.status.kind === 'busy' ? ws.status.label : ws.status.kind === 'error' ? ws.status.message : '', recents: ws.recents },
      selectMode: this.selecting, previewReady: ws.status.kind === 'running', chatWidth: Number(this.preferences.get('praxis:native-chat-width')) || 440, chatHidden: this.hidden,
      branch: active?.branch ?? null, branches: [], publishLabel: 'Publish', publishing: false, publishMode: this.git.mode, codeOpen: this.codeOpen,
      previewBase: active?.url ?? null, previewURL: url, viewport: active?.viewport ?? 'desktop', deviceEnabled: !!active?.url && active.previewKind !== 'simulator'
    })
    const signature = JSON.stringify(state)
    if (signature === this.signature) return
    this.signature = signature; this.send(state)
    this.project({ chatHidden: this.hidden, viewport: state.viewport, selectMode: this.selecting })
  }
  async action(action: NativeShellAction) {
    const entry = this.workspace.active
    if (action.action === 'expand') { this.hidden = !this.hidden; this.preferences.set('praxis:chat-hidden', this.hidden ? '1' : '0'); this.render(); return }
    if (!entry) return
    const invoke = this.workspace.services.invoke
    if (action.action === 'select-object') {
      this.selecting = !this.selecting
      await invoke('preview:set-select-mode', this.selecting)
    } else if (action.action === 'device' && entry.previewKind !== 'simulator') {
      entry.viewport = entry.viewport === 'mobile' ? 'desktop' : 'mobile'; this.workspace.changed()
    } else if (action.action === 'address' && entry.url) {
      const origin = new URL(entry.url).origin, raw = action.value?.trim() ?? ''
      const url = new URL(raw.startsWith('/') || /^https?:\/\//i.test(raw) ? raw : '/' + raw, origin)
      if (url.origin !== origin) throw new Error('The preview address must stay within this project.')
      await invoke('preview:load', url.href)
    } else if (action.action === 'home' && entry.url) await invoke('preview:load', entry.url)
    this.render()
  }
}
