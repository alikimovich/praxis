import { useState } from 'react'
import type { SelectedElement } from '../../../shared/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import CodePeek from './CodePeek'

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
  /** v8 F3a: re-select the owning component instance (edits per-instance props). */
  onSelectOwner: () => void
}

/**
 * The selection chip in the chat — what was picked, a readiness hint, and the
 * Note / Ask actions. When the component is dsgn-ready its props are
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
  onSelectOwner
}: Props): React.JSX.Element {
  // Show the "edit owner component" affordance when the clicked host resolved to a
  // different component-instance call site (the authored <Component …/>).
  const hasOwner = !!element.componentSource && element.componentSource !== element.source
  const [viewingCode, setViewingCode] = useState(false)
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

      {/* v8 F3a: this host is inside a component instance — jump to that call site
          to edit its per-instance props (value, currency, …). */}
      {hasOwner && (
        <Button
          variant="outline"
          size="sm"
          className="inspector__owner h-auto justify-start py-1 text-[11.5px]"
          onClick={onSelectOwner}
          title={element.componentSource ?? undefined}
        >
          ↑ Edit the owning component instance
        </Button>
      )}

      {/* Readiness. Three "not ready" cases, kept distinct so the hint is honest:
          1. no source stamp at all → the project isn't set up (offer setup);
          2. stamped host element that sits inside a component → point at the
             "edit the owning component" affordance above;
          3. stamped but no named prop schema (e.g. a bare host tag, or a component
             whose props are just HTML attributes) → prompt-only. */}
      {inspecting ? (
        <div className="inspector__ready text-[11.5px] text-muted-foreground">Reading props…</div>
      ) : propsReady ? (
        <div className="inspector__ready inspector__ready--ok text-[11.5px] text-green-700">
          Editing props in the panel →
        </div>
      ) : !element.source ? (
        <div className="inspector__ready inspector__ready--no text-[11.5px] text-amber-700">
          Not set up for prop editing —{' '}
          <button className="inspector__link text-blue-600 underline" onClick={onSetup}>
            set up the project
          </button>{' '}
          or ask dsgn below.
        </div>
      ) : hasOwner ? (
        <div className="inspector__ready inspector__ready--no text-[11.5px] text-muted-foreground">
          {`<${element.tag}>`} is a plain element —{' '}
          <button className="inspector__link text-blue-600 underline" onClick={onSelectOwner}>
            edit its component
          </button>{' '}
          or ask dsgn below.
        </div>
      ) : (
        <div className="inspector__ready inspector__ready--no text-[11.5px] text-muted-foreground">
          No editable props on {`<${element.tag}>`} — ask dsgn below to change it.
        </div>
      )}

      {/* Read-only code peek: the stamped file, scrolled to this element. */}
      {viewingCode && element.source && <CodePeek source={element.source} />}

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
        <Button
          variant={noting ? 'default' : 'outline'}
          size="sm"
          className="inspector__toggle"
          onClick={() => setNoting((n) => !n)}
        >
          Note
        </Button>
        {element.source && (
          <Button
            variant={viewingCode ? 'default' : 'outline'}
            size="sm"
            className="inspector__codebtn"
            onClick={() => setViewingCode((v) => !v)}
          >
            Code
          </Button>
        )}
        <Button size="sm" className="inspector__ask flex-1" onClick={onAsk}>
          Ask dsgn…
        </Button>
      </div>
    </div>
  )
}
