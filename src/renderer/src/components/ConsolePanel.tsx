import { useEffect, useRef } from 'react'
import { useLog } from '../store'

/**
 * Collapsible activity console — shows the open-project sequence and dev-server
 * output. Docked full-width above the panes; the native preview reflows via its
 * ResizeObserver when this opens/closes.
 */
export default function ConsolePanel(): React.JSX.Element {
  const lines = useLog((s) => s.lines)
  const clear = useLog((s) => s.clear)
  const setOpen = useLog((s) => s.setOpen)
  const bodyRef = useRef<HTMLDivElement>(null)

  // Keep pinned to the latest line.
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight })
  }, [lines])

  return (
    <div className="console">
      <div className="console__head">
        <span className="console__title">Activity</span>
        <span className="console__spacer" />
        <button className="console__btn" onClick={clear}>
          Clear
        </button>
        <button className="console__btn" onClick={() => setOpen(false)} aria-label="Hide console">
          ✕
        </button>
      </div>
      <div className="console__body" ref={bodyRef}>
        {lines.length === 0 ? (
          <div className="console__empty">No activity yet — open a project.</div>
        ) : (
          lines.map((l) => (
            <div key={l.id} className={`console__line console__line--${l.kind}`}>
              <span className="console__time">{l.time}</span>
              <span className="console__text">{l.text}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
