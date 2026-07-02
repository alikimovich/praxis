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
}

/**
 * v5 left rail (Cursor-style) — the open projects, with an active highlight and a
 * "working" dot for any project whose agent turn is in flight. Under the active
 * project, its **previous agents** (v5-D persisted sessions) list with status dots;
 * click one to review, × to delete. Clicking a project switches; × closes; + opens
 * another keeping the rest warm.
 */
export default function Rail({ onSwitch, onClose, onOpen, onCreate, onReview }: Props): React.JSX.Element | null {
  const projects = useWorkspace((s) => s.projects)
  const activeKey = useWorkspace((s) => s.activeKey)
  const collapsed = useWorkspace((s) => s.collapsed)
  const toggleCollapsed = useWorkspace((s) => s.toggleCollapsed)
  // Re-render on any chat change so the per-project "working" dots stay live.
  const byKey = useChat((s) => s.byKey)
  // Past sessions per project (loaded by App on open/switch/close).
  const history = useHistory((s) => s.byKey)
  // v8 F1: comment-spawned background agents currently running, per project.
  const spawns = useSpawns((s) => s.byKey)

  if (projects.length === 0) return null

  // Collapsed: a thin strip — expand affordance, one chip per project (active
  // highlighted, live "working" dot, click to switch), and "+" to open another.
  if (collapsed) {
    return (
      <nav className="rail rail--collapsed" aria-label="Open projects">
        <button
          className="rail__toggle"
          onClick={toggleCollapsed}
          aria-label="Expand projects sidebar"
          title="Expand sidebar"
        >
          »
        </button>
        <ul className="rail__list">
          {projects.map((p) => {
            const active = p.key === activeKey
            const running = !!byKey[p.key]?.isRunning
            return (
              <li key={p.key}>
                <button
                  className={`rail__chip ${active ? 'rail__chip--active' : ''}`}
                  onClick={() => onSwitch(p.key)}
                  aria-current={active}
                  title={p.name}
                >
                  <span
                    className={`rail__dot ${running ? 'rail__dot--on' : ''}`}
                    aria-hidden="true"
                  />
                  <span className="rail__initial">{p.name.slice(0, 1).toUpperCase()}</span>
                </button>
              </li>
            )
          })}
        </ul>
        <button
          className="rail__add rail__add--mini"
          onClick={onOpen}
          aria-label="Open another project"
          title="Open another project"
        >
          +
        </button>
      </nav>
    )
  }

  return (
    <nav className="rail" aria-label="Open projects">
      <div className="rail__head">
        <span>Projects</span>
        <button
          className="rail__toggle"
          onClick={toggleCollapsed}
          aria-label="Collapse projects sidebar"
          title="Collapse sidebar"
        >
          «
        </button>
      </div>
      <ul className="rail__list">
        {projects.map((p) => {
          const active = p.key === activeKey
          const running = !!byKey[p.key]?.isRunning
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
                <button
                  className="rail__close"
                  onClick={() => onClose(p.key)}
                  aria-label={`Close ${p.name}`}
                  title="Close project"
                >
                  ×
                </button>
              </div>
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
      <button
        className="rail__add rail__add--new"
        onClick={onCreate}
        title="Create a brand-new project (⌘N)"
      >
        + New project
      </button>
      <button
        className="rail__add rail__add--open"
        onClick={onOpen}
        title="Open an existing folder (⌘O)"
      >
        Open project…
      </button>
    </nav>
  )
}
