import type { SessionRecord } from '../../../shared/api'
import { relativeTime, useChat, useHistory, useWorkspace } from '../store'

interface Props {
  /** Switch to an already-open project. */
  onSwitch: (key: string) => void
  /** Close (fully stop) a project. */
  onClose: (key: string) => void
  /** Open another project, keeping the current one warm. */
  onOpen: () => void
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
export default function Rail({ onSwitch, onClose, onOpen, onReview }: Props): React.JSX.Element | null {
  const projects = useWorkspace((s) => s.projects)
  const activeKey = useWorkspace((s) => s.activeKey)
  // Re-render on any chat change so the per-project "working" dots stay live.
  const byKey = useChat((s) => s.byKey)
  // Past sessions per project (loaded by App on open/switch/close).
  const history = useHistory((s) => s.byKey)

  if (projects.length === 0) return null

  return (
    <nav className="rail" aria-label="Open projects">
      <div className="rail__head">Projects</div>
      <ul className="rail__list">
        {projects.map((p) => {
          const active = p.key === activeKey
          const running = !!byKey[p.key]?.isRunning
          const past = active ? (history[p.key] ?? []) : []
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
      <button className="rail__add" onClick={onOpen} title="Open another project">
        + New project
      </button>
    </nav>
  )
}
