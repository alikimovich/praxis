import { useEffect, useRef } from 'react'
import type { SessionRecord } from '../../shared/api'
import type { NativeShellRow, NativeShellState } from '../../shared/native-shell'
import {
  chatTitle,
  useChat,
  useHistory,
  useLog,
  usePublishMode,
  useSelection,
  useWorkspace
} from './store'
import './native-shell.css'

interface Actions {
  preview: Pick<
    NativeShellState,
    'previewReady' | 'branch' | 'publishLabel' | 'publishing' | 'publishMode' | 'codeOpen'
  >
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
      const state: NativeShellState = {
        ...current.current.preview,
        branches,
        rows,
        project: active?.key ?? null,
        selected: active ? `chat:${active.activeSessionKey ?? active.key}` : null,
        selectMode: useSelection.getState().selectMode,
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
      timer ??= setTimeout(sync, 50)
    }
    refresh.current = schedule
    const unsubs = [
      useWorkspace.subscribe(schedule),
      useChat.subscribe(schedule),
      useHistory.subscribe(schedule),
      useSelection.subscribe(schedule)
    ]
    const off = bridge.onAction((message) => {
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
        else if (message.action === 'code') await action.code()
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
    sync()
    return () => {
      disposed = true
      for (const unsubscribe of unsubs) unsubscribe()
      off()
      refresh.current = () => {}
      clearTimeout(timer)
      document.documentElement.classList.remove('native-shell')
    }
  }, [])
}
