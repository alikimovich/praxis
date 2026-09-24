import { useEffect, useRef } from 'react'
import type { SessionRecord } from '../../shared/api'
import type { NativeShellRow, NativeShellState } from '../../shared/native-shell'
import { chatTitle, useChat, useHistory, useLog, useSelection, useWorkspace } from './store'
import './native-shell.css'

interface Actions {
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
  useEffect(() => {
    const bridge = window.praxisNativeShell
    if (!bridge) return
    document.documentElement.classList.add('native-shell')
    let previous = ''
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
      const state: NativeShellState = {
        rows,
        project: active?.key ?? null,
        selected: active ? `chat:${active.activeSessionKey ?? active.key}` : null,
        selectMode: useSelection.getState().selectMode,
        previewReady: !!active?.url,
        chatHidden: ws.chatHidden
      }
      const serialized = JSON.stringify(state)
      if (serialized !== previous) {
        previous = serialized
        bridge.update(state)
      }
    }
    const schedule = () => {
      timer ??= setTimeout(sync, 50)
    }
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
        if (message.action === 'new-chat') await action.newChat(project.key)
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
      for (const unsubscribe of unsubs) unsubscribe()
      off()
      clearTimeout(timer)
      document.documentElement.classList.remove('native-shell')
    }
  }, [])
}
