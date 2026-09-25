import type { NativeWorkspaceSnapshot } from '../../shared/native-workspace'
import { preferredChatAgentSettings } from './preferred-model'
import { useAnnotations, useChat, useGithub, useHistory, useLog, useRecents, useSelection, useSession, useSetup, useTokens, useViewport, useWorkspace } from './store'

/** Temporary projection for unmigrated panels. Project/session operations run in Bun. */
export function connectNativeWorkspace(apply: (state: NativeWorkspaceSnapshot) => void) {
  const bridge = window.praxisNativeWorkspace!
  let revision = -1, active = '', lastError = '', disposed = false
  const offProjection = bridge.onProjection(value => {
    useWorkspace.setState({ chatHidden: value.chatHidden })
    useViewport.getState().setViewport(value.viewport === 'mobile' ? 'mobile' : 'desktop')
    useSelection.getState().setSelectMode(value.selectMode)
  })
  const off = bridge.onState(state => {
    if (state.revision < revision) return
    revision = state.revision
    if (state.error && state.error !== lastError) { lastError = state.error; useLog.getState().append(state.error, 'error'); useLog.getState().setOpen(true) }
    useWorkspace.getState().hydrate(state.projects, state.activeKey)
    useRecents.setState({ recents: state.recents })
    useHistory.setState({ byKey: state.history })
    const project = state.projects.find(p => p.key === state.activeKey)
    useSession.getState().setProjectRoot(project?.root ?? null)
    useSession.getState().setBranch(project?.branch ?? null)
    useChat.getState().setActiveChat(project?.activeSessionKey ?? '')
    if (project?.chatSettings?.[project.activeSessionKey]) useSession.getState().setChatAgentSettings(project.chatSettings[project.activeSessionKey])
    const next = project?.key ?? ''
    if (next !== active) {
      active = next
      useSelection.getState().setSelected(null)
      useSelection.getState().setSelectMode(false)
      useSetup.getState().reset(); useTokens.getState().reset()
      useAnnotations.getState().setList([])
      useViewport.getState().setViewport(project?.viewport ?? 'desktop')
      if (project) {
        const valid = () => !disposed && active === project.key
        void window.api.tokens.detect(project.root).then(tokens => {
          if (!valid()) return
          useTokens.getState().setSet(tokens)
          useTokens.getState().setOfferNeeded(tokens.source === 'none')
        }).catch(error => useLog.getState().append(String(error), 'error'))
        void window.api.setup.detect(project.root).then(probe => { if (valid()) useSetup.getState().setCanInstrument(probe.canInstrument) }).catch(console.error)
        void window.api.annotations.list(project.root).then(notes => { if (valid()) useAnnotations.getState().setList(notes) }).catch(console.error)
        void window.api.git.list(project.root).then(async git => { const status = git.current || git.branches.length ? await window.api.github.status(project.root) : null; if (valid()) useGithub.getState().setStatus(status) }).catch(console.error)
      }
    }
    apply(state)
  })
  void bridge.command({ type: 'attach', legacy: localStorage.getItem('praxis:workspace'), preferred: preferredChatAgentSettings() }).catch(error => useLog.getState().append(String(error), 'error'))
  return () => { disposed = true; off(); offProjection() }
}
