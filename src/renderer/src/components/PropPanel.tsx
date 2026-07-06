import { useEffect, useState } from 'react'
import type { PropField, PropInspection, SelectedElement } from '../../../shared/api'
import { usePanelInset, usePropPanelMode } from '../store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PanelRight, PictureInPicture2 } from 'lucide-react'

/** Kept in sync with the `w-80` (320px) width on the .proppanel <aside> and the
 * reserved native-preview inset (usePanelInset below). */
const PANEL_WIDTH = 320

interface Props {
  root: string
  element: SelectedElement
  /** null → no schema (readiness messaging shows instead of fields). */
  inspection: PropInspection | null
  /** Inspection still in flight. */
  inspecting: boolean
  /** Update the canonical inspection (optimistic apply / reload). */
  onChange: (next: PropInspection) => void
  /** Seed a chat prompt for changes that can't be applied as a literal. */
  onSeedPrompt: (text: string) => void
  /** Offer to set the project up for editing (unstamped element). */
  onSetup: () => void
  /** v8 F3a: re-select the owning component instance. */
  onSelectOwner: () => void
  onClose: () => void
}

/**
 * The prop panel — shown at the preview's right edge for EVERY selection.
 * A schema-backed component gets editable fields; anything else gets the
 * readiness message (setup offer / owner jump / prompt-only hint). Floating
 * card at the top right by default; dockable into a full-height sidebar.
 * Either way it reserves a strip of the native preview (usePanelInset) so it
 * isn't covered. Simple literal edits write straight to source; non-literal
 * ones go to chat.
 */
export default function PropPanel({
  root,
  element,
  inspection,
  inspecting,
  onChange,
  onSeedPrompt,
  onSetup,
  onSelectOwner,
  onClose
}: Props): React.JSX.Element {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const docked = usePropPanelMode((s) => s.docked)
  const hasSchema = !!inspection?.hasSchema
  const source = inspection?.source ?? element.source ?? ''
  const hasOwner = !!element.componentSource && element.componentSource !== element.source
  const ident = element.id
    ? `#${element.id}`
    : element.classes[0]
      ? `.${element.classes[0]}`
      : ''

  // Reserve the right-edge strip while the panel is open.
  useEffect(() => {
    usePanelInset.getState().setInset(PANEL_WIDTH)
    return () => usePanelInset.getState().setInset(0)
  }, [])

  const reload = (): void => {
    if (source) window.api.props.inspect(root, source).then((res) => res && onChange(res))
  }

  const apply = async (field: PropField, value: string | number | boolean): Promise<void> => {
    setBusy(field.name)
    setError(null)
    try {
      const res = await window.api.props.apply(root, {
        source,
        name: field.name,
        kind: field.kind,
        value
      })
      if (res.applied) {
        // Only reachable from a rendered PropRow, which implies a schema-backed
        // inspection is present.
        if (inspection) {
          onChange({
            ...inspection,
            fields: inspection.fields.map((f) =>
              f.name === field.name ? { ...f, value, expression: false } : f
            )
          })
        }
      } else if (res.needsAgent) {
        onSeedPrompt(res.agentPrompt ?? `In ${source}, change the ${field.name} prop.`)
      } else {
        setError(res.error ?? 'Could not apply the change.')
        reload()
      }
    } catch {
      setError('The edit could not be sent.')
      reload()
    } finally {
      setBusy(null)
    }
  }

  // Reset-to-default: remove the attribute from source so the value falls back to
  // the component's declared default. Reversible via Cmd+Z (F3b). (v8 F2)
  const reset = async (field: PropField): Promise<void> => {
    setBusy(field.name)
    setError(null)
    try {
      const res = await window.api.props.remove(root, source, field.name)
      if (!res.applied) setError(res.error ?? 'Could not reset the prop.')
    } catch {
      setError('The reset could not be sent.')
    } finally {
      setBusy(null)
      reload() // re-inspect: the attribute is gone, the schema default shows
    }
  }

  return (
    /* Sits INSIDE the preview card's body: below the previewbar (10px card top
       gap + 1px border + 40+1px bar = 52) and inset 11px from the window's
       right/bottom (10px pane gutter + 1px card border) — flush against the
       native view, which usePanelInset shrinks by exactly this panel's width.
       Never overlaps the previewbar controls. Floating (default): auto-height
       card pinned top-right; docked: full-height sidebar. */
    <aside
      className={`proppanel fixed right-[11px] top-[52px] z-50 flex w-80 flex-col rounded-lg border bg-background ${
        docked
          ? 'bottom-[11px] shadow-[-4px_0_18px_rgba(0,0,0,0.08)]'
          : 'proppanel--floating max-h-[65vh] shadow-[0_8px_28px_rgba(0,0,0,0.14)]'
      }`}
      aria-label={`Props for ${inspection?.component ?? element.tag}`}
    >
      <header className="proppanel__head flex shrink-0 items-start gap-1 border-b px-3.5 py-3">
        <div className="proppanel__id min-w-0 flex-1">
          <div className="proppanel__title font-mono text-sm font-semibold text-blue-600">
            {inspection?.component ?? `${element.tag}${ident}`}
          </div>
          {source && (
            <div className="proppanel__source overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[11px] text-muted-foreground">
              {source}
            </div>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="proppanel__dock size-7 text-muted-foreground"
          onClick={() => usePropPanelMode.getState().setDocked(!docked)}
          aria-label={docked ? 'Float panel' : 'Dock panel as sidebar'}
          aria-pressed={docked}
          title={docked ? 'Float at the top right' : 'Dock as a right sidebar'}
        >
          {docked ? (
            <PictureInPicture2 className="size-3.5" aria-hidden="true" />
          ) : (
            <PanelRight className="size-3.5" aria-hidden="true" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="proppanel__close size-7"
          onClick={onClose}
          aria-label="Close panel"
        >
          ✕
        </Button>
      </header>
      {hasSchema && inspection ? (
        <>
          <div className="proppanel__hint mx-3.5 mt-1.5 text-[11px] text-muted-foreground">
            Literal edits apply instantly to source — others go to chat.
          </div>
          {error && (
            <div className="proppanel__error mx-3.5 mt-2 text-[11.5px] text-red-700">{error}</div>
          )}
          {inspection.note && (
            <div className="proppanel__note mx-3.5 mt-2 text-[11.5px] text-muted-foreground">
              {inspection.note}
            </div>
          )}
          <div className="proppanel__rows flex flex-1 flex-col gap-3 overflow-y-auto px-3.5 pb-3.5 pt-2.5">
            {inspection.fields.length === 0 && (
              <div className="proppanel__note text-[11.5px] text-muted-foreground">
                No editable props.
              </div>
            )}
            {inspection.fields.map((f) => (
              <PropRow
                key={f.name}
                field={f}
                busy={busy === f.name}
                onApply={(v) => apply(f, v)}
                onReset={() => reset(f)}
                onAskAgent={() => onSeedPrompt(`In ${source}, change the \`${f.name}\` prop.`)}
              />
            ))}
          </div>
        </>
      ) : (
        /* No schema (or still inspecting) — the readiness message lives here
           now, not in the chat area. Same three honest "not ready" cases the
           composer strip used to show. */
        <div className="proppanel__rows flex flex-col gap-2 overflow-y-auto px-3.5 pb-3.5 pt-2.5">
          {inspecting ? (
            <div className="proppanel__ready text-[12px] text-muted-foreground">
              Reading props…
            </div>
          ) : !element.source ? (
            <div className="proppanel__ready proppanel__ready--no text-[12px] text-amber-700">
              Not set up for prop editing —{' '}
              <button className="proppanel__link text-blue-600 underline" onClick={onSetup}>
                set up the project
              </button>{' '}
              or ask dsgn below.
            </div>
          ) : hasOwner ? (
            <div className="proppanel__ready proppanel__ready--no text-[12px] text-muted-foreground">
              {`<${element.tag}>`} is a plain element —{' '}
              <button className="proppanel__owner text-blue-600 underline" onClick={onSelectOwner}>
                edit its component
              </button>{' '}
              or ask dsgn below.
            </div>
          ) : (
            <div className="proppanel__ready proppanel__ready--no text-[12px] text-muted-foreground">
              No editable props on {`<${element.tag}>`} — ask dsgn below to change it.
            </div>
          )}
        </div>
      )}
    </aside>
  )
}

function PropRow({
  field,
  busy,
  onApply,
  onReset,
  onAskAgent
}: {
  field: PropField
  busy: boolean
  onApply: (v: string | number | boolean) => void
  onReset: () => void
  onAskAgent: () => void
}): React.JSX.Element {
  const [draft, setDraft] = useState(field.value ?? '')
  useEffect(() => setDraft(field.value ?? ''), [field.value])

  // The attribute is present on the element (not a pure schema offering) → it can
  // be reset/removed. Never offer it for a required prop (would break the component).
  const isPresent = !field.fromSchema || field.value !== undefined || field.expression === true
  const canReset = isPresent && !field.required

  let control: React.JSX.Element
  if (field.expression || field.kind === 'other') {
    control = (
      <Button
        variant="outline"
        size="sm"
        className="proppanel__agent justify-self-end"
        onClick={onAskAgent}
        disabled={busy}
      >
        edit via chat
      </Button>
    )
  } else if (field.kind === 'boolean') {
    control = (
      <input
        type="checkbox"
        className="justify-self-end"
        checked={field.value === true}
        disabled={busy}
        onChange={(e) => onApply(e.target.checked)}
      />
    )
  } else if (field.kind === 'enum' && field.options) {
    control = (
      <select
        className="select min-w-[120px] max-w-[160px] justify-self-end"
        value={String(field.value ?? '')}
        disabled={busy}
        onChange={(e) => onApply(e.target.value)}
      >
        <option value="" disabled>
          —
        </option>
        {field.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    )
  } else {
    const isNumber = field.kind === 'number'
    control = (
      <Input
        className="proppanel__input min-w-[120px] max-w-[160px] justify-self-end"
        type={isNumber ? 'number' : 'text'}
        value={String(draft)}
        disabled={busy}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commit()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
          }
        }}
      />
    )
    function commit(): void {
      if (isNumber) {
        const n = Number(draft)
        if (draft !== '' && !Number.isNaN(n) && n !== field.value) onApply(n)
      } else if (draft !== field.value) {
        onApply(String(draft))
      }
    }
  }

  return (
    <div className="proppanel__row grid grid-cols-[1fr_auto] items-center gap-x-2.5 gap-y-2">
      <span className="flex min-w-0 items-center gap-1.5">
        <span
          className="proppanel__name overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[12.5px]"
          title={field.description}
        >
          {field.name}
          {field.required && <span className="proppanel__req ml-0.5 text-red-700">*</span>}
        </span>
        {canReset && (
          <button
            type="button"
            className="proppanel__reset shrink-0 text-[10.5px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
            onClick={onReset}
            disabled={busy}
            title={
              field.default !== undefined
                ? `Reset to default (${String(field.default)})`
                : 'Remove this prop from source'
            }
          >
            reset
          </button>
        )}
      </span>
      {control}
      {field.default !== undefined && (
        <span className="proppanel__default col-span-full text-[10.5px] text-muted-foreground">
          default: <code className="font-mono">{String(field.default)}</code>
        </span>
      )}
      {field.description && (
        <span className="proppanel__desc col-span-full text-[11px] leading-snug text-muted-foreground">
          {field.description}
        </span>
      )}
    </div>
  )
}
