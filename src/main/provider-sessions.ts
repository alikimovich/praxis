import { randomUUID } from 'node:crypto'
import type { NativeView } from '../native/platform'
import type { AgentOptions } from '../shared/api'
import { interruptWithOwner } from './backends/interrupt'
import type { ModelProvider, ProviderSession, SpawnContext } from './backends/types'
import './provider-model'
import { providerOwner } from './provider-owner'
import { INTERRUPT_GRACE_MS } from './provider-policy'

const ignore = (): void => {}

/**
 * Starts a provider session under the provider owner (S10). Every session agent.ts
 * starts comes through here:
 *
 * - the owner is told first (`open`) and hands back the session's grant; the adapter
 *   gets its id (`SpawnContext.grant`) and asks the owner before answering a
 *   permission request or running one of Trezi's tools;
 * - each turn, terminal event and resumable thread id is reported, so the owner knows
 *   the session's phase and persists what a restored chat resumes;
 * - Stop goes through the owner's deadline: the graceful `interrupt` runs, and only if
 *   the owner's deadline passes first does the adapter's kill switch run;
 * - shutdown closes the grant; nothing is authorized for the session afterwards.
 *
 * A helper-hosted provider (`host: 'helper'`) is already under the owner: the helper
 * was opened through `openHelper` inside `helper-session.ts`.
 */
export async function startProviderSession(
  provider: ModelProvider,
  root: string,
  options: AgentOptions,
  getWindow: () => NativeView | null,
  ctx: SpawnContext
): Promise<ProviderSession> {
  if (provider.host === 'helper') return provider.startSession(root, options, getWindow, ctx)
  const owner = providerOwner()
  const grant = randomUUID()
  await owner.open({
    session: grant,
    chat: ctx.emitKey,
    provider: provider.id || 'unknown',
    root,
    liveRoot: ctx.liveRoot ?? root,
    background: !!ctx.sessionId
  })
  let session: ProviderSession | null = null
  let reportedResume: string | undefined
  const onEvent = ctx.onEvent
  try {
    session = await provider.startSession(root, options, getWindow, {
      ...ctx,
      grant,
      onEvent: (event) => {
        onEvent?.(event)
        if (event.type !== 'done' && event.type !== 'error') return
        void owner.terminal(grant, event.type).catch(ignore)
        const resume = session?.record.sdkSessionId
        if (session && resume && resume !== reportedResume) {
          reportedResume = resume
          void owner.resume(grant, resume, session.record.id).catch(ignore)
        }
      }
    })
  } catch (error) {
    void owner.close(grant).catch(ignore)
    throw error
  }
  const s = session
  const send = s.send
  s.send = (text, images) => {
    void owner.turn(grant).catch(ignore)
    send(text, images)
  }
  const shutdown = s.shutdown
  s.shutdown = () => {
    shutdown()
    void owner.close(grant).catch(ignore)
  }
  const graceful = s.interrupt
  s.interrupt = () =>
    interruptWithOwner({
      graceful: () => graceful?.(),
      escalate: () => (s.forceStop ? s.forceStop() : forceStop(s)),
      cancel: () => owner.cancel(grant),
      settled: () => owner.settled(grant),
      graceMs: INTERRUPT_GRACE_MS
    })
  return s
}

/** The kill switch for an adapter without its own: abort everything, end the turn once. */
function forceStop(s: ProviderSession): void {
  s.shutdown()
  s.emit({ type: 'error', message: 'That turn stopped responding, so Trezi force-stopped it.' })
  s.finalize()
  s.emit({ type: 'done' })
}
