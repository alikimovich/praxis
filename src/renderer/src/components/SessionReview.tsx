import { useEffect, useState } from 'react'
import type { SessionRecord } from '../../../shared/api'
import { relativeTime } from '../store'

interface Props {
  /** The record to review (a header-only summary from the rail list). */
  record: SessionRecord
  onClose: () => void
}

/**
 * v5-D "previous agent" review — a read-only look at a finished session: its
 * branch / PR, the files it touched, and its transcript. Re-fetches the full
 * record by id on open (the rail list carries the same shape, but `get` is the
 * authoritative copy and keeps the panel honest if the list is stale).
 *
 * Resuming a session's *context* is a separate follow-up (the SDK subprocess is
 * gone once a session ends); this surfaces the run for review/handoff.
 */
export default function SessionReview({ record, onClose }: Props): React.JSX.Element {
  const [full, setFull] = useState<SessionRecord>(record)

  useEffect(() => {
    let live = true
    void window.api.sessions.get(record.id).then((r) => {
      if (live && r) setFull(r)
    })
    return () => {
      live = false
    }
  }, [record.id])

  // Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const when = full.endedAt
    ? `${relativeTime(full.startedAt)} · ran ${Math.max(1, Math.round((full.endedAt - full.startedAt) / 1000))}s`
    : relativeTime(full.startedAt)

  return (
    <div className="review__backdrop" onClick={onClose}>
      <div
        className="review"
        role="dialog"
        aria-modal="true"
        aria-label={`Session for ${full.projectName}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="review__head">
          <div className="review__title">
            <span className="review__name">{full.projectName}</span>
            <span className="review__when">{when}</span>
          </div>
          <button className="review__x" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className="review__meta">
          {full.branch && <span className="review__chip">{full.branch}</span>}
          {full.prUrl && (
            <a className="review__chip review__chip--link" href={full.prUrl} target="_blank" rel="noreferrer">
              View PR ↗
            </a>
          )}
          {full.filesTouched.length > 0 && (
            <span className="review__chip">
              {full.filesTouched.length} file{full.filesTouched.length === 1 ? '' : 's'} touched
            </span>
          )}
        </div>

        {full.filesTouched.length > 0 && (
          <ul className="review__files">
            {full.filesTouched.map((f) => (
              <li key={f} title={f}>
                {f}
              </li>
            ))}
          </ul>
        )}

        <div className="review__transcript">
          {full.transcript.length === 0 ? (
            <p className="review__empty">No transcript recorded.</p>
          ) : (
            full.transcript.map((t, i) => (
              <div key={i} className={`review__line review__line--${t.role}`}>
                <span className="review__role">{t.role}</span>
                <span className="review__text">{t.text}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
