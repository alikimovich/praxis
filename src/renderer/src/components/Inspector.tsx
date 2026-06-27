import { useState } from 'react'
import type { SelectedElement, Token, TokenSet } from '../../../shared/api'
import TokenPalette from './TokenPalette'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

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
    <div className="inspector flex flex-col gap-[7px] rounded-lg border bg-muted/40 p-2.5">
      <div className="inspector__head flex items-center gap-2">
        <Badge
          variant="outline"
          className="inspector__tag font-mono text-[12.5px] font-semibold text-blue-600"
        >
          {element.tag}
          {ident}
        </Badge>
        <Button
          variant="ghost"
          size="icon"
          className="inspector__close ml-auto size-5 text-muted-foreground"
          onClick={onClear}
          aria-label="Clear selection"
        >
          ✕
        </Button>
      </div>

      <div
        className={cn(
          'inspector__source overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[11.5px]',
          element.source ? '' : 'inspector__source--none italic text-muted-foreground'
        )}
      >
        {element.source ?? 'no data-dsgn-source stamp — agent will locate by selector'}
      </div>

      {/* Readiness: ready → edit in the floating panel; not ready → prompt-only. */}
      {inspecting ? (
        <div className="inspector__ready text-[11.5px] text-muted-foreground">Reading props…</div>
      ) : propsReady ? (
        <div className="inspector__ready inspector__ready--ok text-[11.5px] text-green-700">
          Editing props in the panel →
        </div>
      ) : (
        <div className="inspector__ready inspector__ready--no text-[11.5px] text-amber-700">
          Not set up for prop editing —{' '}
          <button className="inspector__link text-blue-600 underline" onClick={onSetup}>
            set up the project
          </button>{' '}
          or ask dsgn below.
        </div>
      )}

      <div className="inspector__chips flex flex-wrap gap-[5px]">
        {STYLE_CHIPS.map(({ key, label }) =>
          element.styles[key] ? (
            <Badge
              key={key}
              variant="outline"
              className="inspector__chip max-w-full overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[10.5px] font-normal text-muted-foreground"
              title={`${key}: ${element.styles[key]}`}
            >
              {label}: {element.styles[key]}
            </Badge>
          ) : null
        )}
      </div>

      {showTokens && tokens && <TokenPalette tokenSet={tokens} onPick={onPickToken} />}

      {noting && (
        <div className="inspector__note flex flex-col gap-1.5">
          <Textarea
            className="inspector__noteinput resize-none text-[13px]"
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
          <Button
            size="sm"
            className="inspector__notesave self-end"
            onClick={() => void saveNote()}
            disabled={!note.trim() || saving}
          >
            {saving ? 'Saving…' : 'Save note'}
          </Button>
        </div>
      )}

      <div className="inspector__actions flex gap-1.5">
        {hasTokens && (
          <Button
            variant={showTokens ? 'default' : 'outline'}
            size="sm"
            className="inspector__toggle"
            onClick={() => setShowTokens((s) => !s)}
          >
            Tokens
          </Button>
        )}
        <Button
          variant={noting ? 'default' : 'outline'}
          size="sm"
          className="inspector__toggle"
          onClick={() => setNoting((n) => !n)}
        >
          Note
        </Button>
        <Button size="sm" className="inspector__ask flex-1" onClick={onAsk}>
          Ask dsgn…
        </Button>
      </div>
    </div>
  )
}
