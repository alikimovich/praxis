import type { BackgroundSpawnOrigin } from '../../shared/api'
import { projectKey } from '../../shared/projectKey'
import { chatAgentSettingsFor, chatModelLabel, toAgentOptions, useChat, useComposer, useLog, useSession, useSpawns, useWorkspace } from './store'

/** Dispatch one isolated background agent without touching the visible transcript.
 * Comment mode and complex inline text edits share the same worktree/queue seam;
 * callers choose their own lossless fallback for unsupported backends/non-repos. */
export function dispatchBackgroundAgent(opts: {
  root: string
  prompt: string
  label: string
  origin: BackgroundSpawnOrigin
  fallback: () => void
}): void {
  const current = useSession.getState()
  const project = useWorkspace.getState().projects.find((entry) => entry.root === opts.root)
  const parentSessionKey = current.projectRoot === opts.root
    ? useChat.getState().activeKey || projectKey(opts.root)
    : project?.activeSessionKey || projectKey(opts.root)
  const agentSettings = current.projectRoot === opts.root
    ? current
    : chatAgentSettingsFor(project ?? {}, parentSessionKey)
  // A failed initialization can finish before the IPC response arrives.
  const finished = new Set<string>()
  const unsubscribe = window.api.agent.onEvent((event) => {
    if (event.type === 'spawn-finished' && event.sessionId) finished.add(event.sessionId)
  })
  void window.api.agent
    .spawnComment(
      opts.root,
      opts.prompt,
      parentSessionKey,
      toAgentOptions(agentSettings),
      opts.origin
    )
    .then((result) => {
      if (result.ok && result.spawnId) {
        if (finished.has(result.spawnId)) return
        useSpawns.getState().add(parentSessionKey, {
          id: result.spawnId,
          branch: result.branch ?? null,
          label: opts.label,
          modelLabel: chatModelLabel({
            model: agentSettings.model,
            modelId: agentSettings.modelId,
            provider: agentSettings.provider,
            connectionId: agentSettings.connectionId
          }),
          status: result.queued ? 'queued' : 'running'
        })
        return
      }
      if (result.reason === 'unsupported-backend') {
        useLog
          .getState()
          .append(
            opts.origin === 'text-edit'
              ? 'This model cannot run a detached visual edit; the instruction was placed in the composer.'
              : 'This model cannot run a detached background agent yet; the comment was sent to its chat.'
          )
      }
      opts.fallback()
    })
    .catch(opts.fallback)
    .finally(unsubscribe)
}

/** A committed visual change already contains the user's requested value. */
export function dispatchVisualEdit(root: string, prompt: string): void {
  if (!prompt.trim()) return
  dispatchBackgroundAgent({
    root,
    prompt,
    label: `Visual edit · ${prompt.replace(/\s+/g, ' ').slice(0, 60)}`,
    origin: 'text-edit',
    fallback: () => {
      useLog.getState().append('Could not start the visual edit in the background; the instruction is in the composer.', 'error')
      useComposer.getState().setSeed(prompt)
    }
  })
}
