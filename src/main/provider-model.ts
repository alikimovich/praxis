import { isAbsolute } from 'node:path'
import { app } from '../native/platform'
import { INTERRUPT_GRACE_MS, LIMITS, MESSAGES, authorizeTool, decidePermission, grantedTools, permissionTarget, validProviderID, validSessionID } from './provider-policy'
import { type OwnedProviderSession, type ProviderGrant, type ProviderOwner, ProviderError, type ProviderPhase, setLegacyProviderOwner } from './provider-owner'

/**
 * The in-process provider owner: the rollback twin of `ProviderOwner.swift`
 * (`TREZI_BACKEND_OWNER=legacy`, unit tests). Same policy (`provider-policy.ts`), same
 * lifecycle and cancellation deadline, same answers. It persists nothing (resume ids
 * live on the session records, as before S10) and cannot host helpers: helper
 * supervision and privilege enforcement exist only in the Swift service.
 */
interface Entry {
  grant: ProviderGrant
  phase: ProviderPhase
  tools: string[]
  resume: string | null
  waiters: ((escalate: boolean) => void)[]
  deadline: ReturnType<typeof setTimeout> | null
}

export function legacyProviders(options: { profile: string; graceMs?: number } = { profile: '' }): ProviderOwner {
  const graceMs = options.graceMs ?? INTERRUPT_GRACE_MS
  const sessions = new Map<string, Entry>()
  const resumes = new Map<string, { provider: string; resume: string }>()
  const fail = (code: string, message: string): never => { throw new ProviderError(code, message) }
  const scope = (entry: Entry | undefined) => ({
    live: !!entry && entry.phase !== 'stopped',
    background: entry?.grant.background ?? false,
    root: entry?.grant.root ?? '/',
    liveRoot: entry?.grant.liveRoot ?? '/',
    profile: options.profile
  })
  const settle = (entry: Entry, escalate: boolean): void => {
    if (entry.deadline) clearTimeout(entry.deadline)
    entry.deadline = null
    for (const wake of entry.waiters.splice(0)) wake(escalate)
  }

  return {
    kind: 'legacy',
    async open(grant) {
      if (!validSessionID(grant.session) || !validProviderID(grant.provider) || !grant.chat ||
          !isAbsolute(grant.root) || !isAbsolute(grant.liveRoot)) fail('invalidRequest', 'Invalid provider session.')
      if (sessions.has(grant.session)) fail('conflict', 'That provider session is already open.')
      const tools = grantedTools(grant.background)
      sessions.set(grant.session, { grant: { ...grant }, phase: 'idle', tools, resume: null, waiters: [], deadline: null })
      return { tools }
    },
    async openHelper() {
      return fail('unavailable', 'Provider helpers need the Trezi service (TREZI_BACKEND_OWNER=swift).')
    },
    async permission(session, tool, input) {
      const target = permissionTarget(tool, input)
      if (target !== undefined && target.length > LIMITS.permissionTarget) return { decision: 'deny', message: MESSAGES.targetTooLarge }
      return decidePermission(tool, target, scope(sessions.get(session)))
    },
    async authorize(session, tool, args) {
      const bytes = Buffer.byteLength(JSON.stringify(args ?? {}) ?? '')
      const refusal = authorizeTool(tool, bytes, scope(sessions.get(session)))
      if (refusal) fail(refusal.code, refusal.message)
    },
    async turn(session) {
      const entry = sessions.get(session)
      if (entry && entry.phase !== 'stopped') entry.phase = 'running'
    },
    async send() {
      return fail('notFound', 'No helper-hosted provider session.')
    },
    cancel(session) {
      const entry = sessions.get(session)
      if (!entry || entry.phase === 'stopped') return Promise.resolve({ escalate: false })
      entry.phase = 'cancelling'
      return new Promise((resolve) => {
        entry.waiters.push((escalate) => resolve({ escalate }))
        entry.deadline ??= setTimeout(() => {
          entry.phase = 'stopped'
          settle(entry, true)
        }, graceMs)
      })
    },
    async settled(session) {
      const entry = sessions.get(session)
      if (!entry) return
      // A graceful answer that raced the deadline keeps the session (Bun did not kill it).
      if (entry.phase === 'cancelling' || entry.phase === 'stopped') entry.phase = 'idle'
      settle(entry, false)
    },
    async terminal(session) {
      const entry = sessions.get(session)
      if (entry && entry.phase === 'running') entry.phase = 'idle'
    },
    async resume(session, id, record) {
      const entry = sessions.get(session)
      if (!entry || typeof id !== 'string' || !id || id.length > 4096 || !validSessionID(record)) return
      entry.resume = id
      resumes.set(record, { provider: entry.grant.provider, resume: id })
    },
    async recover(record) {
      return resumes.get(record) ?? null
    },
    async answer() {
      return fail('notFound', 'No helper-hosted provider session.')
    },
    async configure() {
      return fail('notFound', 'No helper-hosted provider session.')
    },
    async close(session) {
      const entry = sessions.get(session)
      if (!entry) return
      sessions.delete(session)
      settle(entry, false)
    },
    async snapshot() {
      const list: OwnedProviderSession[] = [...sessions.values()].map((entry) => ({
        session: entry.grant.session, chat: entry.grant.chat, provider: entry.grant.provider, host: 'bun',
        phase: entry.phase, background: entry.grant.background, tools: entry.tools, resume: entry.resume
      }))
      return { sessions: list }
    },
    async status() {
      return { recovered: [], violations: [] }
    }
  }
}

setLegacyProviderOwner(() => legacyProviders({ profile: app.getPath('userData') }))
