import { app, ipcMain, type BrowserWindow } from 'electron'
import { join } from 'node:path'
import type { AgentEvent, AgentOptions, PermissionMode } from '../shared/api'
import { projectKey } from '../shared/projectKey'
import { pickProvider, type ProviderSession } from './backends'
import { EDIT_TOOLS } from './backends/tools'
import { createSessionStore, type SessionStore } from './sessions-store'
import { clearHistory } from './edit-history'

// On-disk agent-session history (v5-D). Lazy so it resolves userData after the
// app is ready; under the app's userData dir, out of any user repo.
let _store: SessionStore | null = null
const store = (): SessionStore =>
  (_store ??= createSessionStore(join(app.getPath('userData'), 'dsgn')))

/**
 * Agent sessions — one persistent multi-turn session per open project (keyed by
 * projectKey), each running a `ModelProvider` backend (Claude Agent SDK by
 * default; Codex/etc. behind the v7 seam). This module is backend-agnostic: it
 * owns the per-project `sessions` map, `activeKey`, teardown, the permission-card
 * settle loop, and every `agent:*` IPC handler — all in terms of `ProviderSession`
 * + `AgentEvent`. The provider-specific streaming/tooling lives under `./backends`.
 *
 * Auth: per-user subscription login for every backend (Claude `setup-token` /
 * `login`, Codex sign-in-with-ChatGPT, …) — never API keys committed in-repo.
 */

// v5: one persistent session per open project. Only the ACTIVE project's session
// streams to the renderer; the dispose guard keeps backgrounded/replaced sessions
// from leaking events into a chat the renderer isn't showing.
const sessions = new Map<string, ProviderSession>()
let activeKey: string | null = null
const activeSession = (): ProviderSession | null =>
  activeKey ? (sessions.get(activeKey) ?? null) : null

/** Tear down a session: stop it emitting, deny its prompts, provider teardown,
 * then persist it to history (v5-D) — a torn-down session is a "previous agent". */
function closeSession(s: ProviderSession): void {
  s.dispose()
  ;[...s.pending.keys()].forEach((id) => resolvePending(s, id, 'deny'))
  s.shutdown()
  // Only persist sessions the user actually engaged (≥1 prompt) — skip opened-then
  // -closed empties. Best-effort: a disk hiccup must not break teardown.
  try {
    s.finalize()
    if (s.record.transcript.some((t) => t.role === 'user')) {
      s.record.endedAt = Date.now()
      store().save(s.record)
    }
  } catch {
    // history is non-critical; never let it interfere with session lifecycle
  }
}

/** Settle a pending prompt and tell the renderer to drop its card. */
function resolvePending(s: ProviderSession, id: string, behavior: 'allow' | 'deny'): void {
  const p = s.pending.get(id)
  if (!p) return
  p.settle(behavior)
  s.emit({ type: 'permission-resolved', id })
}

export function registerAgentIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('agent:open-project', async (_e, root: string, options: AgentOptions = {}) => {
    const key = projectKey(root)
    // Reopening the same project starts a fresh session — close the old one.
    const existing = sessions.get(key)
    if (existing) {
      closeSession(existing)
      sessions.delete(key)
    }
    const s = await pickProvider(options).startSession(root, options, getWindow)
    sessions.set(key, s)
    activeKey = key
  })

  // Close a project's session (renderer single-active teardown; the rail uses
  // this when a project is closed, not merely switched away from).
  ipcMain.handle('agent:close-project', async (_e, root: string) => {
    const key = projectKey(root)
    const s = sessions.get(key)
    if (s) {
      closeSession(s)
      sessions.delete(key)
    }
    // Closing the active project clears `active` — never auto-promote an arbitrary
    // backgrounded session (it would start emitting into a chat the renderer isn't
    // showing). The renderer re-activates explicitly via open-project.
    if (activeKey === key) activeKey = null
    // v8 F3b: drop the project's undo/redo history — a reopened project starts fresh.
    clearHistory(root)
  })

  // Switch the active project to an already-open (warm) session, without
  // recreating it — used by the rail when switching between open projects.
  ipcMain.handle('agent:set-active', async (_e, root: string) => {
    const key = projectKey(root)
    if (sessions.has(key)) activeKey = key
  })

  // Does this project still have a live session? (LRU eviction can suspend a
  // backgrounded project's session; the renderer reopens it on switch-back.)
  ipcMain.handle('agent:is-open', (_e, root: string) => sessions.has(projectKey(root)))

  ipcMain.handle('agent:set-model', async (_e, model: string) => {
    const session = activeSession()
    if (!session) return
    await session.setModel?.(model)
    session.options.model = model
  })

  ipcMain.handle('agent:set-permission-mode', async (_e, mode: PermissionMode) => {
    const session = activeSession()
    if (!session) return
    // Apply to the backend first; only commit our copy if it took (keeps the
    // toolbar and the live agent in agreement).
    await session.setPermissionMode?.(mode)
    session.options.permissionMode = mode
    // Switching to a more permissive posture should also release prompts already
    // on screen — otherwise the user picks "Auto" but the pending card stays.
    if (mode === 'bypassPermissions' || mode === 'acceptEdits') {
      for (const [id, p] of [...session.pending.entries()]) {
        if (mode === 'bypassPermissions' || EDIT_TOOLS.has(p.toolName)) {
          resolvePending(session, id, 'allow')
        }
      }
    }
  })

  ipcMain.handle('agent:respond-permission', async (_e, id: string, behavior: 'allow' | 'deny') => {
    const session = activeSession()
    if (session) resolvePending(session, id, behavior)
  })

  ipcMain.handle('agent:send', async (_e, text: string) => {
    const session = activeSession()
    if (!session) {
      getWindow()?.webContents.send('agent:event', {
        type: 'error',
        message: 'Open a project first — the agent works inside a repo.'
      } satisfies AgentEvent)
      return
    }
    session.record.transcript.push({ role: 'user', text, at: Date.now() })
    session.send(text)
  })

  // Tag the live session with branch / PR metadata for its history record (the
  // renderer knows these; main captures transcript + files). No-op if no session.
  ipcMain.handle(
    'agent:tag-session',
    async (_e, root: string, tag: { branch?: string; prUrl?: string }) => {
      const s = sessions.get(projectKey(root))
      if (!s) return
      if (typeof tag.branch === 'string') s.record.branch = tag.branch
      if (typeof tag.prUrl === 'string') s.record.prUrl = tag.prUrl
    }
  )

  // Persisted history ("previous agents", v5-D). Lists past runs (the live session
  // is persisted only on teardown, so it isn't here).
  ipcMain.handle('sessions:list', (_e, root: string) => store().list(projectKey(root)))
  ipcMain.handle('sessions:get', (_e, id: string) => store().get(id))
  ipcMain.handle('sessions:remove', (_e, id: string) => store().remove(id))

  ipcMain.handle('agent:interrupt', async () => {
    const session = activeSession()
    if (!session) return
    // Release any open prompts (interrupt may not abort their per-call signal),
    // so cards don't orphan and the backend callbacks unblock.
    ;[...session.pending.keys()].forEach((id) => resolvePending(session, id, 'deny'))
    await session.interrupt?.()
  })

  // Don't leave any backend subprocess running after dsgn quits.
  app.on('before-quit', () => {
    for (const s of sessions.values()) closeSession(s)
    sessions.clear()
    activeKey = null
  })
}
