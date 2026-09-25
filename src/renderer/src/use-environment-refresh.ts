import { useEffect, useRef } from 'react'
import { environmentChanges } from '../../shared/environment-changes'
import { useSession, useWorkspace } from './store'

/** Wait for the authoritative landing event, never the earlier provider `done`. */
export function useEnvironmentRefresh(restart: (install: boolean) => Promise<void>): void {
  const callback = useRef(restart)
  callback.current = restart
  const busy = useRef(false)
  const projects = useWorkspace((state) => state.projects)
  const root = useSession((state) => state.projectRoot)
  useEffect(
    () =>
      window.api.agent.onEvent((event) => {
        if (window.praxisNativeWorkspace) return
        const files =
          event.type === 'isolation' && event.state === 'merged'
            ? event.files
            : event.type === 'spawn-finished' && event.outcome === 'applied'
              ? event.files
              : undefined
        const eventKey = event.projectKey
        if (!files || !eventKey) return
        const changes = environmentChanges(files)
        const project = useWorkspace
          .getState()
          .projects.find((entry) => entry.key === eventKey || entry.sessionKeys?.includes(eventKey))
        if (!project?.launchSpec || (!changes.restart && project.url)) return
        useWorkspace.getState().patchEntry(project.key, {
          environmentRevision: (project.environmentRevision ?? 0) + 1,
          dependenciesPending: project.dependenciesPending || changes.install
        })
      }),
    []
  )
  useEffect(() => {
    if (window.praxisNativeWorkspace) return
    const project = projects.find((entry) => entry.root === root)
    if (!project?.environmentRevision || busy.current) return
    busy.current = true
    // Consume before starting. Further landings enqueue another refresh.
    useWorkspace
      .getState()
      .patchEntry(project.key, { environmentRevision: 0, dependenciesPending: false })
    void callback.current(!!project.dependenciesPending).finally(() => {
      busy.current = false
      if (useSession.getState().projectRoot !== project.root) {
        const current = useWorkspace.getState().projects.find((entry) => entry.key === project.key)
        if (current)
          useWorkspace.getState().patchEntry(project.key, {
            environmentRevision: Math.max(current.environmentRevision ?? 0, 1),
            dependenciesPending: current.dependenciesPending || project.dependenciesPending
          })
      }
      // Wake the effect even if a later landing arrived while this refresh ran.
      useWorkspace.getState().patchEntry(project.key, {})
    })
  }, [projects, root])
}
