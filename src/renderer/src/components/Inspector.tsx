import { useState } from 'react'
import type { SelectedElement } from '../../../shared/api'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { MessageSquare, StickyNote, Code2, Trash2 } from 'lucide-react'
import { useCodeDrawer } from '../store'

interface Props {
  element: SelectedElement
  /** A react-docgen schema resolved → props are editable in the floating panel. */
  propsReady: boolean
  /** Inspection still running. */
  inspecting: boolean
  /** Offer to set the project up for editing. */
  onSetup: () => void
  onClear: () => void
  /** Save a reviewer note pinned to this element; resolves false if it failed. */
  onAddNote: (text: string) => Promise<boolean>
  /** Send a change-request comment about this element (detached agent). */
  onComment: (text: string) => void
  /** Ask the agent to delete this element from the source. */
  onDelete: () => void
  /** v8 F3a: re-select the owning component instance (edits per-instance props). */
  onSelectOwner: () => void
}

/**
 * The selection strip in the composer: the picked element as a removable pill
 * plus its element-scoped actions — Comment (agent turn), Annotate (pin a note,
 * no agent), Code (editor drawer), Delete. The element reference itself rides
 * along invisibly with the next chat message (see ChatPanel's send), so there's
 * no "Ask dsgn" button seeding selector text into the composer anymore.
 */
export default function Inspector({
  element,
  propsReady,
  inspecting,
  onSetup,
  onClear,
  onAddNote,
  onComment,
  onDelete,
  onSelectOwner
}: Props): React.JSX.Element {
  // Show the "edit owner component" affordance when the clicked host resolved to a
  // different component-instance call site (the authored <Component …/>).
  const hasOwner = !!element.componentSource && element.componentSource !== element.source
  // Track whether the editor drawer is showing *this* element.
  const drawerSource = useCodeDrawer((s) => s.source)
  const codeOpen = !!element.source && drawerSource === element.source
  // One inline input serves both flows; which action armed it decides the submit.
  const [mode, setMode] = useState<'comment' | 'note' | null>(null)
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async (): Promise<void> => {
    const t = text.trim()
    if (!t || saving) return
    if (mode === 'note') {
      setSaving(true)
      // Keep the text if the save fails — don't silently lose the reviewer's note.
      const ok = await onAddNote(t)
      setSaving(false)
      if (!ok) return
    } else {
      onComment(t)
    }
    setText('')
    setMode(null)
  }

  const ident = element.id
    ? `#${element.id}`
    : element.classes[0]
      ? `.${element.classes[0]}`
      : ''

  const iconCls = 'inspector__action size-6 text-muted-foreground'

  return (
    <div className="inspector flex flex-col gap-1.5 px-2 pt-2">
      <div className="inspector__head flex min-w-0 items-center gap-1.5">
        {/* The pill: what's selected, removable. */}
        <span className="inspector__pill inline-flex max-w-[55%] items-center gap-1 rounded-md bg-indigo-50 py-0.5 pl-2 pr-1 text-indigo-700">
          <span className="inspector__tag truncate font-mono text-[12px] font-semibold">
            {element.tag}
            {ident}
          </span>
          <button
            className="inspector__close flex size-4 shrink-0 items-center justify-center rounded text-indigo-400 hover:text-indigo-700"
            onClick={onClear}
            aria-label="Clear selection"
          >
            ×
          </button>
        </span>
        <span
          className="inspector__source min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[11px] text-muted-foreground"
          title={element.source ?? undefined}
        >
          {element.source ?? ''}
        </span>
        <div className="inspector__actions flex shrink-0 items-center gap-0.5">
          <Button
            variant={mode === 'comment' ? 'secondary' : 'ghost'}
            size="icon"
            className={iconCls}
            onClick={() => setMode((m) => (m === 'comment' ? null : 'comment'))}
            aria-label="Comment"
            title="Comment on this element — runs a parallel agent"
          >
            <MessageSquare className="size-3.5" aria-hidden="true" />
          </Button>
          <Button
            variant={mode === 'note' ? 'secondary' : 'ghost'}
            size="icon"
            className={iconCls}
            onClick={() => setMode((m) => (m === 'note' ? null : 'note'))}
            aria-label="Annotate"
            title="Pin a note on this element, no agent"
          >
            <StickyNote className="size-3.5" aria-hidden="true" />
          </Button>
          {element.source && (
            <Button
              variant={codeOpen ? 'secondary' : 'ghost'}
              size="icon"
              className={`inspector__codebtn ${iconCls}`}
              onClick={() =>
                codeOpen
                  ? useCodeDrawer.getState().close()
                  : useCodeDrawer.getState().open(element.source!)
              }
              aria-label="Show code"
              title="Open this file in the editor under the preview"
            >
              <Code2 className="size-3.5" aria-hidden="true" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className={iconCls}
            onClick={onDelete}
            aria-label="Delete element"
            title="Ask dsgn to delete this element"
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
          </Button>
        </div>
      </div>

      {/* Readiness. Three "not ready" cases, kept distinct so the hint is honest:
          1. no source stamp at all → the project isn't set up (offer setup);
          2. stamped host element that sits inside a component → point at the
             "edit the owning component" affordance;
          3. stamped but no named prop schema (e.g. a bare host tag, or a component
             whose props are just HTML attributes) → prompt-only. */}
      {inspecting ? (
        <div className="inspector__ready text-[11px] text-muted-foreground">Reading props…</div>
      ) : propsReady ? (
        <div className="inspector__ready inspector__ready--ok text-[11px] text-green-700">
          Editing props in the panel →
        </div>
      ) : !element.source ? (
        <div className="inspector__ready inspector__ready--no text-[11px] text-amber-700">
          Not set up for prop editing —{' '}
          <button className="inspector__link text-blue-600 underline" onClick={onSetup}>
            set up the project
          </button>{' '}
          or ask dsgn below.
        </div>
      ) : hasOwner ? (
        <div className="inspector__ready inspector__ready--no text-[11px] text-muted-foreground">
          {`<${element.tag}>`} is a plain element —{' '}
          <button className="inspector__owner text-blue-600 underline" onClick={onSelectOwner}>
            edit its component
          </button>{' '}
          or ask dsgn below.
        </div>
      ) : (
        <div className="inspector__ready inspector__ready--no text-[11px] text-muted-foreground">
          No editable props on {`<${element.tag}>`} — ask dsgn below to change it.
        </div>
      )}

      {mode && (
        <div className="inspector__note flex flex-col gap-1.5">
          <Textarea
            className="inspector__noteinput resize-none text-[13px]"
            placeholder={mode === 'note' ? 'Note for the engineer…' : 'What should change here?'}
            value={text}
            rows={2}
            autoFocus
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                void submit()
              }
            }}
          />
          <Button
            size="sm"
            className="inspector__notesave self-end"
            onClick={() => void submit()}
            disabled={!text.trim() || saving}
          >
            {mode === 'note' ? (saving ? 'Saving…' : 'Save note') : 'Send to dsgn'}
          </Button>
        </div>
      )}
    </div>
  )
}
