import '../../shared/native-sheet'
import { useState } from 'react'
import type { ProjectSetup } from './components/NewProjectDialog'
import type { ProjectStatus } from './project-status'
import { openWithPreviewFreeze, useComposer, useLog, usePreviewFreeze, useSession } from './store'

export function useNewProject(
  attempt: (root: string, command?: string, keepWarm?: boolean) => Promise<void>,
  setStatus: (status: ProjectStatus) => void
): {
  open: boolean
  close: () => void
  show: () => void
  create: (setup: ProjectSetup, details: string) => Promise<void>
} {
  const [newProjectOpen, setNewProjectOpen] = useState(false)
  const closeNewProject = (): void => {
    setNewProjectOpen(false)
    usePreviewFreeze.getState().setFrozen(false)
  }

  const createNewProject = (): void => {
    if (window.praxisNativeSheets) { window.praxisNativeSheets.open('new-project'); return }
    openWithPreviewFreeze(() => setNewProjectOpen(true))
  }

  const createChosenProject = async (setup: ProjectSetup, details: string): Promise<void> => {
    closeNewProject()
    const dest = await window.api.project.pickNew()
    if (!dest) return
    const log = useLog.getState()
    setStatus({ kind: 'busy', label: 'Creating project…' })
    try {
      const res = await window.api.project.create(dest, {
        template: setup === 'react' ? 'react' : 'empty'
      })
      if (!res.ok || !res.root) throw new Error(res.error ?? 'Could not create the project.')
      if (res.warning) log.append(res.warning, 'error')
      await attempt(res.root, undefined, !!useSession.getState().projectRoot)
      if (useSession.getState().projectRoot !== res.root) return
      if (setup !== 'react') {
        const preference =
          setup === 'custom'
            ? 'Let’s plan a new project and choose the environment together.'
            : `Let’s plan a new ${setup === 'next' ? 'Next.js' : 'Svelte'} project.`
        useComposer
          .getState()
          .setSubmit(
            `${preference} Please ask me what I want to build and help me decide any remaining setup choices before creating the app.\n${details}`
          )
      } else if (details) {
        useComposer.getState().setSeed(details)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      log.append(message, 'error')
      setStatus({ kind: 'error', message })
    }
  }

  return {
    open: newProjectOpen,
    close: closeNewProject,
    show: createNewProject,
    create: createChosenProject
  }
}
