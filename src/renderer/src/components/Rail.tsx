import { Folder, Plus } from 'lucide-react'
import type { SessionRecord } from '../../../shared/api'
import { relativeTime, useChat, useHistory, useSpawns, useWorkspace } from '../store'

interface Props {
  /** Switch to an already-open project. */
  onSwitch: (key: string) => void
  /** Close (fully stop) a project. */
  onClose: (key: string) => void
  /** Open another project, keeping the current one warm. */
  onOpen: () => void
  /** Create a brand-new project (scaffold), keeping the current one warm. */
  onCreate: () => void
  /** Open a past session for review (v5-D). */
  onReview: (rec: SessionRecord) => void
  /** v9 multi-chat — start an ADDITIONAL live chat for this (already-open) project. */
  onNewChat: (key: string) => void
  /** v9 multi-chat — switch to one of this project's already-live sessionKeys. */
  onSwitchSession: (key: string, sessionKey: string) => void
}

/**
 * v5 left rail (Cursor-style) — the open projects, with an active highlight and a
 * "working" dot for any project whose agent turn is in flight. Under the active
 * project, its **previous agents** (v5-D persisted sessions) list with status dots;
 * click one to review, × to delete. Clicking a project switches; × closes.
 *
 * The collapse/expand toggle no longer lives here — it floats by the traffic lights
 * (see App's `.sidebar-toggle`) so it stays reachable once the rail is gone. When
 * collapsed the rail stays mounted but slides out to the left (width → 0); the
 * floating toggle slides it back. Keeping it mounted is what lets the collapse
 * animate instead of popping in and out.
 */
export default function Rail({
  onSwitch,
  onClose,
  onOpen,
  onCreate,
  onReview,
  onNewChat,
  onSwitchSession
}: Props): React.JSX.Element | null {
  const projects = useWorkspace((s) => s.projects)
  const activeKey = useWorkspace((s) => s.activeKey)
  const collapsed = useWorkspace((s) => s.collapsed)
  // Re-render on any chat change so the per-project "working" dots stay live.
  const byKey = useChat((s) => s.byKey)
  // Past sessions per project (loaded by App on open/switch/close).
  const history = useHistory((s) => s.byKey)
  // v8 F1: comment-spawned background agents currently running, per project.
  const spawns = useSpawns((s) => s.byKey)

  if (projects.length === 0) return null

  return (
    <nav
      className={`rail ${collapsed ? 'rail--collapsed' : ''}`}
      aria-label="Open projects"
      aria-hidden={collapsed}
    >
      <div className="rail__inner">
      {/* Project actions — quiet list items (no dashed CTA borders) — lead the
          rail so opening/creating is always reachable. The "Projects" heading
          sits below them, directly labelling the open-projects list. */}
      <button
        className="rail__action"
        onClick={onOpen}
        title="Open an existing folder (⌘O)"
      >
        <Folder className="size-4" aria-hidden="true" />
        <span>Open project</span>
      </button>
      <button
        className="rail__action"
        onClick={onCreate}
        title="Create a brand-new project (⌘N)"
      >
        <Plus className="size-4" aria-hidden="true" />
        <span>New project</span>
      </button>
      <div className="rail__head">
        <span>Projects</span>
      </div>
      <ul className="rail__list">
        {projects.map((p) => {
          const active = p.key === activeKey
          // A project's "working" dot lights for ANY of its live sessionKeys, not
          // just the currently-shown one — a background chat still counts as busy.
          const sessionKeys = p.sessionKeys ?? [p.key]
          const running = sessionKeys.some((sk) => byKey[sk]?.isRunning)
          const past = active ? (history[p.key] ?? []) : []
          const working = active ? (spawns[p.key] ?? []) : []
          return (
            <li key={p.key} className={`rail__item ${active ? 'rail__item--active' : ''}`}>
              <div className="rail__row">
                <button
                  className="rail__open"
                  onClick={() => onSwitch(p.key)}
                  aria-current={active}
                  title={p.root}
                >
                  <span
                    className={`rail__dot ${running ? 'rail__dot--on' : ''}`}
                    aria-hidden="true"
                  />
                  <span className="rail__name">{p.name}</span>
                </button>
                {active && (
                  <button
                    className="rail__new-chat"
                    onClick={(e) => {
                      e.stopPropagation()
                      onNewChat(p.key)
                    }}
                    aria-label={`Start another chat for ${p.name}`}
                    title="Start another chat for this project"
                  >
                    <Plus className="size-3.5" aria-hidden="true" />
                  </button>
                )}
                <button
                  className="rail__close"
                  onClick={() => onClose(p.key)}
                  aria-label={`Close ${p.name}`}
                  title="Close project"
                >
                  ×
                </button>
              </div>
              {/* v9 multi-chat: switcher between this project's own live chats —
                  only worth showing once there's more than one. */}
              {active && sessionKeys.length > 1 && (
                <ul className="rail__chats" aria-label={`${p.name}'s open chats`}>
                  {sessionKeys.map((sk, i) => {
                    const isActiveChat = sk === (p.activeSessionKey ?? p.key)
                    const chatRunning = !!byKey[sk]?.isRunning
                    return (
                      <li key={sk}>
                        <button
                          className={`rail__chat ${isActiveChat ? 'rail__chat--active' : ''}`}
                          onClick={() => onSwitchSession(p.key, sk)}
                          aria-current={isActiveChat}
                          title={sk === p.key ? 'Default chat' : `Chat ${i + 1}`}
                        >
                          <span
                            className={`rail__dot ${chatRunning ? 'rail__dot--on' : ''}`}
                            aria-hidden="true"
                          />
                          <span className="rail__session-label">
                            {sk === p.key ? 'Default' : `Chat ${i + 1}`}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
              {/* v8 F1: comment-spawned background agents working (or queued). */}
              {working.length > 0 && (
                <ul className="rail__spawns">
                  {working.map((sp) => (
                    <li key={sp.id} className="rail__spawn" title={sp.label}>
                      <span
                        className={`rail__sdot ${sp.status === 'queued' ? 'rail__sdot--queued' : 'rail__sdot--working'}`}
                        aria-hidden="true"
                      />
                      <span className="rail__session-label">
                        {sp.status === 'queued' ? `${sp.label} · queued` : sp.label}
                      </span>
                      <button
                        className="rail__session-x"
                        onClick={(e) => {
                          e.stopPropagation()
                          void window.api.agent.spawnInterrupt(sp.id)
                        }}
                        aria-label="Cancel agent"
                        title="Cancel this agent"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {/* Previous agents for the active project (newest first). */}
              {past.length > 0 && (
                <ul className="rail__sessions">
                  {past.map((rec) => (
                    <li key={rec.id} className="rail__session">
                      <button
                        className="rail__session-open"
                        onClick={() => onReview(rec)}
                        title={`${rec.projectName} — ${rec.filesTouched.length} file(s)`}
                      >
                        <span
                          className={`rail__sdot ${rec.prUrl ? 'rail__sdot--pr' : ''}`}
                          aria-hidden="true"
                        />
                        <span className="rail__session-label">
                          {relativeTime(rec.startedAt)}
                          {rec.filesTouched.length > 0 ? ` · ${rec.filesTouched.length}f` : ''}
                        </span>
                      </button>
                      <button
                        className="rail__session-x"
                        onClick={(e) => {
                          e.stopPropagation()
                          void useHistory.getState().remove(rec.projectRoot, rec.id)
                        }}
                        aria-label="Delete session"
                        title="Delete from history"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
      </div>
    </nav>
  )
}
