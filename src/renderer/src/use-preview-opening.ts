import { useEffect, useRef } from 'react'
import { previewPath, type PreviewOpenRequest } from '../../shared/preview-navigation'
import { useChat, useSession } from './store'
import type { ProjectStatus } from './project-status'

/** Keep the latest request through landing/server startup; never follow it into another chat. */
export function usePreviewOpening(status: ProjectStatus, previewKind: string): void {
  const kindRef = useRef(previewKind)
  kindRef.current = previewKind
  const statusRef = useRef(status)
  statusRef.current = status
  const retry = useRef<() => void>(() => {})
  useEffect(() => {
    let pending: PreviewOpenRequest | null = null
    let awaitingLanding = false
    const tryOpen = (): void => {
      if (!pending) return
      const chat = useChat.getState()
      if (pending.root !== useSession.getState().projectRoot || pending.key !== chat.activeKey) {
        pending = null
        return
      }
      const current = statusRef.current
      if (chat.isRunning || chat.isolation === 'parked' || awaitingLanding || current.kind !== 'running' || kindRef.current === 'simulator') return
      const path = previewPath(pending.path)
      pending = null
      if (!path) return
      const base = new URL(current.url)
      if (!['http:', 'https:'].includes(base.protocol)) return
      void window.api.preview.load(base.origin + path).catch(console.error)
    }
    retry.current = tryOpen
    const off = window.api.preview.onOpen((request) => {
      if (request.root !== useSession.getState().projectRoot ||
          request.key !== useChat.getState().activeKey) return
      pending = request
      awaitingLanding = useChat.getState().isRunning && useChat.getState().isolation === 'isolated'
      tryOpen()
    })
    const offEvent = window.api.agent.onEvent((event) => {
      if (!pending || event.projectKey !== pending.key || event.sessionId) return
      if (event.type === 'error' || (event.type === 'isolation' && event.state === 'parked')) {
        pending = null
      } else if (event.type === 'isolation' && event.state === 'merged') {
        awaitingLanding = false
        tryOpen()
      }
    })
    const offChat = useChat.subscribe((state, previous) => {
      // A newer user turn supersedes a request whose landing/startup never completed.
      if (state.isRunning && !previous.isRunning) pending = null
      tryOpen()
    })
    const offProject = useSession.subscribe(tryOpen)
    return () => { pending = null; retry.current = () => {}; off(); offEvent(); offChat(); offProject() }
  }, [])
  useEffect(() => retry.current(), [status, previewKind])
}
