import { useEffect, useRef } from 'react'
import type { SessionRecord } from '../../shared/api'
import type { NativeShellRow, NativeShellState } from '../../shared/native-shell'
import {
  chatTitle,
  useChat,
  useHistory,
  useLog,
  useLayersPanel,
  usePreviewLocation,
  usePublishMode,
  useSelection,
  useUiActions,
  useViewport,
  useWorkspace
} from './store'
import './native-shell.css'
import { useProjectIcons } from './project-icons'

interface Actions {
  preview: Pick<
    NativeShellState,
    | 'homeState'
    | 'previewReady'
    | 'branch'
    | 'publishLabel'
    | 'publishing'
    | 'publishMode'
    | 'codeOpen'
    | 'previewBase'
    | 'deviceEnabled'
  >
  resizeChat: (width: number) => void
  switchBranch: (name: string) => Promise<void>
  createBranch: (name: string) => Promise<void>
  gitUpdates: () => void
  publish: () => void
  code: () => Promise<void>
  switchProject: (key: string) => Promise<void>
  switchSession: (key: string, session: string) => Promise<void>
  newChat: (key: string) => Promise<void>
  closeProject: (key: string) => Promise<void>
  closeChat: (key: string, session: string) => Promise<void>
  review: (record: SessionRecord) => void
  memory: (root: string, name: string) => void
}

/** Subscribe once, send only small changed snapshots, keep callbacks current. */
export function useNativeShell(actions: Actions) {
  const current = useRef(actions)
  current.current = actions
  const refresh = useRef(() => {})
  useEffect(() => refresh.current())
  useEffect(() => {
    const bridge = window.praxisNativeShell
    if (!bridge) return
    document.documentElement.classList.add('native-shell')
    let disposed = false
    let resizeEnd: ReturnType<typeof setTimeout> | undefined
    let previous = ''
    let branchKey = ''
    let branches: string[] = []
    let rows: NativeShellRow[] = []
    let timer: ReturnType<typeof setTimeout> | undefined
    const sync = () => {
      timer = undefined
      const ws = useWorkspace.getState()
      const chats = useChat.getState().byKey
      rows = ws.projects.map((p) => ({
        id: `project:${p.key}`,
        project: p.key,
        title: p.name,
        icon: useProjectIcons.getState().byKey[p.key]?.dataUrl,
        kind: 'project',
        children: [
          ...(p.sessionKeys ?? [p.key]).map((session) => ({
            id: `chat:${session}`,
            project: p.key,
            session,
            kind: 'chat' as const,
            title:
              chats[session]?.title ||
              chatTitle(chats[session]?.messages.find((m) => m.role === 'user')?.text),
            running: chats[session]?.isRunning ?? false
          })),
          ...(useHistory.getState().byKey[p.key] ?? []).map((rec) => ({
            id: `history:${rec.id}`,
            project: p.key,
            record: rec.id,
            kind: 'history' as const,
            title:
              rec.title ||
              chatTitle(rec.transcript.find((m) => m.role === 'user')?.text, 'Previous chat')
          }))
        ]
      }))
      const active = ws.projects.find((p) => p.key === ws.activeKey)
      const nextBranchKey = JSON.stringify([active?.root, current.current.preview.branch])
      if (nextBranchKey !== branchKey) {
        branchKey = nextBranchKey
        branches = []
        if (active)
          void window.api.git
            .list(active.root)
            .then((result) => {
              if (branchKey !== nextBranchKey) return
              branches = result.branches
              schedule()
            })
            .catch((error) => useLog.getState().append(String(error), 'error'))
      }
      const base = current.current.preview.previewBase
      let previewURL = base
      try {
        const location = usePreviewLocation.getState().url
        if (base && location && new URL(base).origin === new URL(location).origin)
          previewURL = location
      } catch {
        /* Use the project's base until a valid navigation arrives. */
      }
      const state: NativeShellState = {
        ...current.current.preview,
        homeState: { ...current.current.preview.homeState, blocked: !!document.querySelector('[role="dialog"], .diag') },
        branches,
        previewURL,
        viewport: useViewport.getState().viewport,
        rows,
        project: active?.key ?? null,
        selected: active ? `chat:${active.activeSessionKey ?? active.key}` : null,
        selectMode: useSelection.getState().selectMode,
        chatWidth: document.querySelector('.pane--chat')?.getBoundingClientRect().width ?? 0,
        chatHidden: ws.chatHidden
      }
      const serialized = JSON.stringify(state)
      if (serialized !== previous) {
        previous = serialized
        bridge.update(state)
      }
    }
    const schedule = () => {
      if (disposed) return
      timer ??= setTimeout(sync, 0)
    }
    const resize = new ResizeObserver(schedule)
    let observed: Element | null = null
    const observeChat = () => {
      const pane = document.querySelector('.pane--chat')
      if (pane !== observed) {
        resize.disconnect()
        observed = pane
        if (pane) resize.observe(pane)
      }
      schedule()
    }
    const mutations = new MutationObserver(schedule)
    mutations.observe(document.body, { childList: true, subtree: true })
    refresh.current = observeChat
    const unsubs = [
      useWorkspace.subscribe(() => {
        // Collapse the native sidebar before the next web layout report.
        if (timer !== undefined) clearTimeout(timer)
        sync()
      }),
      useProjectIcons.subscribe(schedule),
      useChat.subscribe(schedule),
      useHistory.subscribe(schedule),
      useSelection.subscribe(schedule),
      usePreviewLocation.subscribe(schedule),
      useViewport.subscribe(schedule)
    ]
    const off = bridge.onAction((message) => {
      if (message.action === 'chat-resize') {
        const width = Number(message.value)
        if (Number.isFinite(width)) {
          document.body.classList.add('is-resizing')
          current.current.resizeChat(Math.max(320, Math.min(760, width)))
          clearTimeout(resizeEnd)
          resizeEnd = setTimeout(() => document.body.classList.remove('is-resizing'), 250)
        }
        return
      }
      const ws = useWorkspace.getState()
      const row = rows.flatMap((p) => [p, ...(p.children ?? [])]).find((r) => r.id === message.id)
      const project = ws.projects.find(
        (p) => p.key === (row?.project ?? message.project ?? ws.activeKey)
      )
      if (!project) return
      const action = current.current
      const run = async () => {
        if (message.action === 'branch' && message.value) await action.switchBranch(message.value)
        else if (message.action === 'new-branch' && message.value)
          await action.createBranch(message.value)
        else if (message.action === 'git-updates') action.gitUpdates()
        else if (message.action === 'publish') action.publish()
        else if (
          message.action === 'publish-mode' &&
          (message.value === 'pr' || message.value === 'merge')
        )
          usePublishMode.getState().setMode(message.value)
        else if (message.action === 'home' && action.preview.previewBase)
          await window.api.preview.load(action.preview.previewBase)
        else if (
          message.action === 'address' &&
          message.value !== undefined &&
          action.preview.previewBase
        ) {
          const origin = new URL(action.preview.previewBase).origin
          const raw = message.value.trim()
          const target = new URL(
            raw.startsWith('/') || /^https?:\/\//i.test(raw) ? raw : `/${raw}`,
            origin
          )
          if (target.origin !== origin)
            throw new Error('The preview address must stay within this project.')
          await window.api.preview.load(target.href)
        } else if (message.action === 'select-object') {
          useUiActions.getState().toggleSelect()
        } else if (message.action === 'device' && action.preview.deviceEnabled) {
          const viewport = useViewport.getState()
          viewport.setViewport(viewport.viewport === 'mobile' ? 'desktop' : 'mobile')
        } else if (message.action === 'layers') {
          const layers = useLayersPanel.getState()
          layers.setOpen(!layers.open)
        } else if (message.action === 'code') await action.code()
        else if (message.action === 'expand') ws.toggleChatHidden()
        else if (message.action === 'new-chat') await action.newChat(project.key)
        else if (message.action === 'memory') action.memory(project.root, project.name)
        else if (message.action === 'close' && row?.session)
          await action.closeChat(project.key, row.session)
        else if (message.action === 'close' && row?.kind === 'project')
          await action.closeProject(project.key)
        else if (message.action === 'select' && row?.session)
          await action.switchSession(project.key, row.session)
        else if (message.action === 'select' && row?.kind === 'project')
          await action.switchProject(project.key)
        else if (message.action === 'select' && row?.record) {
          const record = useHistory.getState().byKey[project.key]?.find((r) => r.id === row.record)
          if (record) action.review(record)
        }
      }
      void run().catch((error) => useLog.getState().append(String(error), 'error'))
    })
    observeChat()
    sync()
    return () => {
      disposed = true
      resize.disconnect()
      mutations.disconnect()
      for (const unsubscribe of unsubs) unsubscribe()
      off()
      refresh.current = () => {}
      clearTimeout(timer)
      clearTimeout(resizeEnd)
      document.body.classList.remove('is-resizing')
      document.documentElement.classList.remove('native-shell')
    }
  }, [])
}
