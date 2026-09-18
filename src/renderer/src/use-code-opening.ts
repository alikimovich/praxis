import { useEffect } from 'react'
import type { CodeRevealRequest } from '../../shared/api'
import { locateCodeReveal } from '../../shared/code-reveal'
import { useChat, useCodeDrawer, useSession } from './store'

/** Keep requests through worktree landing, without navigating other chats/projects. */
export function useCodeOpening(): void {
  useEffect(() => {
    let pending: CodeRevealRequest | null = null
    let generation = 0
    let attempts = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const isCurrent = (request: CodeRevealRequest): boolean =>
      request.root === useSession.getState().projectRoot &&
      request.key === useChat.getState().activeKey
    const tryOpen = async (): Promise<void> => {
      const request = pending
      const seq = ++generation
      if (!request || !isCurrent(request) || useCodeDrawer.getState().dirty) return
      const view = await window.api.source.read(request.root, request.source).catch(() => null)
      if (seq !== generation || !isCurrent(request) || useCodeDrawer.getState().dirty) return
      if (!view || !locateCodeReveal(view.code, request)) {
        if (++attempts < 60) timer = setTimeout(() => void tryOpen(), 500)
        return
      }
      pending = null
      useCodeDrawer.getState().open(request.source, request)
    }
    const offReveal = window.api.source.onReveal((request) => {
      if (!isCurrent(request)) return
      clearTimeout(timer)
      attempts = 0
      pending = request
      void tryOpen()
    })
    const offEvent = window.api.agent.onEvent((event) => {
      if (
        pending &&
        (event.type === 'done' ||
          event.type === 'spawn-finished' ||
          (event.type === 'isolation' && event.state === 'merged'))
      ) {
        clearTimeout(timer)
        attempts = 0
        // Landing notifications and the filesystem refresh can follow the turn event.
        timer = setTimeout(() => void tryOpen(), 500)
      }
    })
    const offEditor = useCodeDrawer.subscribe((state, prev) => {
      if (prev.dirty && !state.dirty && pending) void tryOpen()
    })
    const cancelStale = (): void => {
      if (pending && !isCurrent(pending)) {
        pending = null
        generation++
        clearTimeout(timer)
      }
    }
    const offProject = useSession.subscribe(cancelStale)
    const offChat = useChat.subscribe(cancelStale)
    return () => {
      generation++
      clearTimeout(timer)
      offReveal()
      offEvent()
      offEditor()
      offProject()
      offChat()
    }
  }, [])
}
