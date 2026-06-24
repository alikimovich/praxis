import { useState } from 'react'
import type { SelectedElement, Token, TokenSet } from '../../../shared/api'
import TokenPalette from './TokenPalette'

/** A couple of the captured computed styles, shown as quick chips. */
const STYLE_CHIPS: { key: string; label: string }[] = [
  { key: 'color', label: 'color' },
  { key: 'background-color', label: 'bg' },
  { key: 'font-size', label: 'size' },
  { key: 'padding', label: 'pad' }
]

interface Props {
  element: SelectedElement
  /** A react-docgen schema resolved → props are editable in the floating panel. */
  propsReady: boolean
  /** Inspection still running. */
  inspecting: boolean
  /** Offer to set the project up for editing. */
  onSetup: () => void
  /** Seed a change request for this element into the composer. */
  onAsk: () => void
  onClear: () => void
  /** Save a reviewer note pinned to this element; resolves false if it failed. */
  onAddNote: (text: string) => Promise<boolean>
  /** Detected design tokens for the project (null until loaded). */
  tokens: TokenSet | null
  /** Apply a token to this element (seeds the chat). */
  onPickToken: (group: string, token: Token) => void
}

/**
 * The selection chip in the chat — what was picked, a readiness hint, and the
 * Note / Tokens / Ask actions. When the component is dsgn-ready its props are
 * edited in the floating panel (App); when it isn't, this is prompt-only.
 */
export default function Inspector({
  element,
  propsReady,
  inspecting,
  onSetup,
  onAsk,
  onClear,
  onAddNote,
  tokens,
  onPickToken
}: Props): React.JSX.Element {
  const [showTokens, setShowTokens] = useState(false)
  const [noting, setNoting] = useState(false)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const hasTokens = !!tokens && tokens.groups.length > 0

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

      {/* Readiness: ready → edit in the floating panel; not ready → prompt-only. */}
      {inspecting ? (
        <div className="inspector__ready">Reading props…</div>
      ) : propsReady ? (
        <div className="inspector__ready inspector__ready--ok">Editing props in the panel →</div>
      ) : (
        <div className="inspector__ready inspector__ready--no">
          Not set up for prop editing —{' '}
          <button className="inspector__link" onClick={onSetup}>
            set up the project
          </button>{' '}
          or ask dsgn below.
        </div>
      )}

      <div className="inspector__chips">
        {STYLE_CHIPS.map(({ key, label }) =>
          element.styles[key] ? (
            <span key={key} className="inspector__chip" title={`${key}: ${element.styles[key]}`}>
              {label}: {element.styles[key]}
            </span>
          ) : null
        )}
      </div>

      {showTokens && tokens && <TokenPalette tokenSet={tokens} onPick={onPickToken} />}

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
        {hasTokens && (
          <button
            className={`inspector__toggle ${showTokens ? 'is-active' : ''}`}
            onClick={() => setShowTokens((s) => !s)}
          >
            Tokens
          </button>
        )}
        <button
          className={`inspector__toggle ${noting ? 'is-active' : ''}`}
          onClick={() => setNoting((n) => !n)}
        >
          Note
        </button>
        <button className="inspector__ask" onClick={onAsk}>
          Ask dsgn…
        </button>
      </div>
    </div>
  )
}
