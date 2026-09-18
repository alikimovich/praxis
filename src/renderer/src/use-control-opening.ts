import { useEffect } from 'react'
import type { ControlsOpenRequest } from '../../shared/api'
import { controlTarget } from './lib/control-target'
import { usePropsIsland, useSelection, useSession } from './store'

/** Requests survive worktree landing/HMR, but never switch the user's project. */
export function useControlOpening(): void {
  useEffect(() => {
    let pending: ControlsOpenRequest | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    let generation = 0
    let attempts = 0
    let offPick: (() => void) | undefined
    const tryOpen = async (): Promise<void> => {
      offPick?.()
      offPick = undefined
      const request = pending
      const seq = ++generation
      if (!request || request.root !== useSession.getState().projectRoot) return
      const selected = useSelection.getState().selected
      const stamps = [selected?.source, selected?.componentSource]
      if (
        selected &&
        (request.source
          ? stamps.includes(request.source)
          : stamps.some((stamp) => stamp?.replace(/:\d+(?::\d+)?$/, '') === request.file))
      ) {
        usePropsIsland.setState({ open: true, openRequest: request })
        pending = null
        return
      }
      const snapshot = await window.api.layers.read().catch(() => null)
      if (seq !== generation || request.root !== useSession.getState().projectRoot) return
      const target = controlTarget(snapshot?.nodes ?? [], request)
      if (target) {
        // Wait for the real preview pick, which updates selection and inspection.
        const off = useSelection.subscribe((state) => {
          if (seq !== generation || request.root !== useSession.getState().projectRoot) {
            off()
            return
          }
          if (state.selected?.source !== target.source) return
          off()
          pending = null
          usePropsIsland.setState({ open: true, openRequest: request })
        })
        offPick = off
        window.api.layers.select(target.path, { tag: target.tag, source: target.source })
        timer = setTimeout(() => {
          off()
          if (seq === generation && pending && ++attempts < 12) void tryOpen()
        }, 1500)
        return
      }
      if (++attempts < 12) timer = setTimeout(() => void tryOpen(), 500)
    }
    const offOpen = window.api.controls.onOpen((request) => {
      if (request.presentation === 'animation' || request.root !== useSession.getState().projectRoot) return
      generation++
      clearTimeout(timer)
      pending = request
      attempts = 0
      void tryOpen()
    })
    const offProject = useSession.subscribe((state, prev) => {
      if (state.projectRoot === prev.projectRoot) return
      generation++
      pending = null
      offPick?.()
      clearTimeout(timer)
    })
    const offEvent = window.api.agent.onEvent((event) => {
      if (pending && (event.type === 'done' || event.type === 'spawn-finished')) {
        clearTimeout(timer)
        attempts = 0
        void tryOpen()
      }
    })
    return () => {
      generation++
      pending = null
      offPick?.()
      clearTimeout(timer)
      offOpen()
      offProject()
      offEvent()
    }
  }, [])
}
