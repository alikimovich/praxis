import { useEffect, useRef } from 'react'
import type { Annotation } from '../../../shared/api'

interface Props {
  notes: Annotation[]
  focusedId: string | null
  publishing: boolean
  publishMsg: { ok: boolean; text: string } | null
  onRemove: (id: string) => void
  onPublish: () => void
}

/**
 * The handoff panel: every pinned note, plus Publish (branch + GitHub PR). The
 * numbers match the pins drawn over the live preview.
 */
export default function NotesPanel({
  notes,
  focusedId,
  publishing,
  publishMsg,
  onRemove,
  onPublish
}: Props): React.JSX.Element | null {
  const focusedRef = useRef<HTMLLIElement>(null)
  // Scroll a pin-focused note into view (the list scrolls past ~5 notes).
  useEffect(() => {
    if (focusedId) focusedRef.current?.scrollIntoView({ block: 'nearest' })
  }, [focusedId])

  if (notes.length === 0) return null
  return (
    <div className="notes">
      <div className="notes__head">
        <span className="notes__title">Notes · {notes.length}</span>
        <button className="notes__publish" onClick={onPublish} disabled={publishing}>
          {publishing ? 'Publishing…' : 'Publish PR'}
        </button>
      </div>
      {publishMsg && (
        <div className={`notes__msg ${publishMsg.ok ? 'notes__msg--ok' : 'notes__msg--err'}`}>
          {publishMsg.text}
        </div>
      )}
      <ul className="notes__list">
        {notes.map((n, i) => (
          <li
            key={n.id}
            ref={n.id === focusedId ? focusedRef : undefined}
            className={`notes__item ${n.id === focusedId ? 'is-focused' : ''}`}
          >
            <span className="notes__num">{i + 1}</span>
            <div className="notes__body">
              <div className="notes__where">{n.source ?? n.selector}</div>
              <div className="notes__text">{n.text}</div>
            </div>
            <button
              className="notes__remove"
              onClick={() => onRemove(n.id)}
              aria-label="Delete note"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
