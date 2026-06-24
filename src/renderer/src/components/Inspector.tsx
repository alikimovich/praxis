import { useState } from 'react'
import type { SelectedElement } from '../../../shared/api'
import PropEditor from './PropEditor'

/** A couple of the captured computed styles, shown as quick chips. */
const STYLE_CHIPS: { key: string; label: string }[] = [
  { key: 'color', label: 'color' },
  { key: 'background-color', label: 'bg' },
  { key: 'font-size', label: 'size' },
  { key: 'padding', label: 'pad' }
]

interface Props {
  element: SelectedElement
  /** Absolute project root — enables prop editing when present. */
  root: string | null
  /** Seed a change request for this element into the composer. */
  onAsk: () => void
  onClear: () => void
  /** Seed an arbitrary prompt (used by the prop editor's agent fallback). */
  onSeedPrompt: (text: string) => void
  /** Save a reviewer note pinned to this element; resolves false if it failed. */
  onAddNote: (text: string) => Promise<boolean>
}

/**
 * The selection inspector — appears above the composer once the user clicks an
 * element in the live preview. It shows what was picked (and whether we resolved
 * a source location), offers a prop editor, then hands off to the chat.
 */
export default function Inspector({
  element,
  root,
  onAsk,
  onClear,
  onSeedPrompt,
  onAddNote
}: Props): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [noting, setNoting] = useState(false)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const saveNote = async (): Promise<void> => {
    const text = note.trim()
    if (!text || saving) return
    setSaving(true)
    // Keep the text if the save fails — don't silently lose the reviewer's note.
    const ok = await onAddNote(text)
    setSaving(false)
    if (ok) {
      setNote('')
      setNoting(false)
    }
  }
  const ident = element.id
    ? `#${element.id}`
    : element.classes[0]
      ? `.${element.classes[0]}`
      : ''
  const canEditProps = !!root && !!element.source

  return (
    <div className="inspector">
      <div className="inspector__head">
        <span className="inspector__tag">
          {element.tag}
          {ident}
        </span>
        <button className="inspector__close" onClick={onClear} aria-label="Clear selection">
          ✕
        </button>
      </div>

      <div className={`inspector__source ${element.source ? '' : 'inspector__source--none'}`}>
        {element.source ?? 'no data-dsgn-source stamp — agent will locate by selector'}
      </div>

      {!editing && (
        <div className="inspector__chips">
          {STYLE_CHIPS.map(({ key, label }) =>
            element.styles[key] ? (
              <span key={key} className="inspector__chip" title={`${key}: ${element.styles[key]}`}>
                {label}: {element.styles[key]}
              </span>
            ) : null
          )}
        </div>
      )}

      {editing && root && element.source && (
        <PropEditor root={root} source={element.source} onSeedPrompt={onSeedPrompt} />
      )}

      {noting && (
        <div className="inspector__note">
          <textarea
            className="inspector__noteinput"
            placeholder="Note for the engineer…"
            value={note}
            rows={2}
            autoFocus
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                void saveNote()
              }
            }}
          />
          <button
            className="inspector__notesave"
            onClick={() => void saveNote()}
            disabled={!note.trim() || saving}
          >
            {saving ? 'Saving…' : 'Save note'}
          </button>
        </div>
      )}

      <div className="inspector__actions">
        {canEditProps && (
          <button
            className={`inspector__toggle ${editing ? 'is-active' : ''}`}
            onClick={() => setEditing((e) => !e)}
          >
            {editing ? 'Done' : 'Edit props'}
          </button>
        )}
        {root && (
          <button
            className={`inspector__toggle ${noting ? 'is-active' : ''}`}
            onClick={() => setNoting((n) => !n)}
          >
            Note
          </button>
        )}
        <button className="inspector__ask" onClick={onAsk}>
          Ask dsgn…
        </button>
      </div>
    </div>
  )
}
