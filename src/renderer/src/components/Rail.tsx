import { useChat, useWorkspace } from '../store'

interface Props {
  /** Switch to an already-open project. */
  onSwitch: (key: string) => void
  /** Close (fully stop) a project. */
  onClose: (key: string) => void
  /** Open another project, keeping the current one warm. */
  onOpen: () => void
}

/**
 * v5 left rail (Cursor-style) — the open projects, with an active highlight and a
 * "working" dot for any project whose agent turn is in flight (incl. backgrounded
 * ones). Clicking switches; × closes; + opens another keeping the rest warm. The
 * rail only appears once a project is open (single-project keeps the old layout).
 */
export default function Rail({ onSwitch, onClose, onOpen }: Props): React.JSX.Element | null {
  const projects = useWorkspace((s) => s.projects)
  const activeKey = useWorkspace((s) => s.activeKey)
  // Re-render on any chat change so the per-project "working" dots stay live.
  const byKey = useChat((s) => s.byKey)

  if (projects.length === 0) return null

  return (
    <nav className="rail" aria-label="Open projects">
      <div className="rail__head">Projects</div>
      <ul className="rail__list">
        {projects.map((p) => {
          const active = p.key === activeKey
          const running = !!byKey[p.key]?.isRunning
          return (
            <li key={p.key} className={`rail__item ${active ? 'rail__item--active' : ''}`}>
              <button
                className="rail__open"
                onClick={() => onSwitch(p.key)}
                aria-current={active}
                title={p.root}
              >
                <span className={`rail__dot ${running ? 'rail__dot--on' : ''}`} aria-hidden="true" />
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
