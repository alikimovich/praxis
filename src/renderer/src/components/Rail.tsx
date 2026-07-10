import { ChevronRight, Folder, FolderOpen, Plus } from 'lucide-react'
import type { SessionRecord } from '../../../shared/api'
import { chatTitle, shortAgo, useChat, useHistory, useSpawns, useWorkspace } from '../store'

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

/** First user-typed line of a transcript/chat — the seed for a chat's auto-name. */
const firstUserText = (entries: { role: string; text: string }[]): string | undefined =>
  entries.find((e) => e.role === 'user' && e.text.trim())?.text

/**
 * v5 left rail (Cursor-style) — the open projects, each led by a folder icon
 * (open when it's the active project, closed otherwise). The active project
 * expands to a flat, left-aligned list of its chats: first its live/open chats
 * (the active one highlighted), then its **previous chats** (v5-D persisted
 * sessions, one row per chat with a trailing "time ago"). Chat names are
 * auto-generated from each chat's opening prompt. No status dots on chat rows —
 * the text sits flush-left, at the project name's level. Clicking a project
 * switches; × closes; clicking a chat opens/reviews it.
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
          const sessionKeys = p.sessionKeys ?? [p.key]
          const past = active ? (history[p.key] ?? []) : []
          const working = active ? (spawns[p.key] ?? []) : []
          const FolderIcon = active ? FolderOpen : Folder
          return (
            <li key={p.key} className={`rail__item ${active ? 'rail__item--active' : ''}`}>
              <div className="rail__row">
                <button
                  className="rail__open"
                  onClick={() => onSwitch(p.key)}
                  aria-current={active}
                  title={p.root}
                >
                  {/* Cursor-style glyph: a subdued folder (open when expanded,
                      closed otherwise) that, on hover, gives way to a chevron —
                      pointing down while expanded, right while collapsed. */}
                  <span className="rail__glyph" aria-hidden="true">
                    <FolderIcon className="rail__folder size-4" />
                    <ChevronRight
                      className={`rail__chevron size-4 ${active ? 'rail__chevron--open' : ''}`}
                    />
                  </span>
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
              {/* Active project: a flat, left-aligned list of its chats — live
                  chats first (active one highlighted), then previous chats. No
                  status dots; names are auto-generated from each chat's first
                  prompt, mirroring Cursor's sidebar. */}
              {active && (
                <ul className="rail__chats" aria-label={`${p.name}'s chats`}>
                  {sessionKeys.map((sk) => {
                    const isActiveChat = sk === (p.activeSessionKey ?? p.key)
                    const name = chatTitle(firstUserText(byKey[sk]?.messages ?? []))
                    return (
                      <li key={sk} className="rail__chat-item">
                        <button
                          className={`rail__chat ${isActiveChat ? 'rail__chat--active' : ''}`}
                          onClick={() => onSwitchSession(p.key, sk)}
                          aria-current={isActiveChat}
                          title={name}
                        >
                          <span className="rail__chat-name">{name}</span>
                        </button>
                      </li>
                    )
                  })}
                  {/* v8 F1: comment-spawned background agents working (or queued). */}
                  {working.map((sp) => (
                    <li key={sp.id} className="rail__chat-item" title={sp.label}>
                      <span className="rail__chat rail__chat--spawn">
                        <span
                          className={`rail__sdot ${sp.status === 'queued' ? 'rail__sdot--queued' : 'rail__sdot--working'}`}
                          aria-hidden="true"
                        />
                        <span className="rail__chat-name">
                          {sp.status === 'queued' ? `${sp.label} · queued` : sp.label}
                        </span>
                      </span>
                      <button
                        className="rail__chat-x"
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
                  {/* Previous chats for this project (newest first). */}
                  {past.map((rec) => {
                    const name = chatTitle(firstUserText(rec.transcript))
                    return (
                      <li key={rec.id} className="rail__chat-item">
                        <button
                          className="rail__chat"
                          onClick={() => onReview(rec)}
                          title={`${name} — ${rec.filesTouched.length} file(s)`}
                        >
                          <span className="rail__chat-name">{name}</span>
                          <span className="rail__chat-time">{shortAgo(rec.startedAt)}</span>
                        </button>
                        <button
                          className="rail__chat-x"
                          onClick={(e) => {
                            e.stopPropagation()
                            void useHistory.getState().remove(rec.projectRoot, rec.id)
                          }}
                          aria-label="Delete chat"
                          title="Delete from history"
                        >
                          ×
                        </button>
                      </li>
                    )
                  })}
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
