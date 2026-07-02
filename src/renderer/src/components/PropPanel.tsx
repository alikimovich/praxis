import { useEffect, useState } from 'react'
import type { PropField, PropInspection } from '../../../shared/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/** Kept in sync with the `w-80` (320px) width on the .proppanel <aside> and the
 * reserved native-preview inset (setPanelInset below). */
const PANEL_WIDTH = 320

interface Props {
  root: string
  inspection: PropInspection
  /** Update the canonical inspection (optimistic apply / reload). */
  onChange: (next: PropInspection) => void
  /** Seed a chat prompt for changes that can't be applied as a literal. */
  onSeedPrompt: (text: string) => void
  onClose: () => void
}

/**
 * The floating prop panel — shown over the preview's right edge when a
 * dsgn-ready component (one with a resolved react-docgen schema) is selected.
 * It reserves a strip of the native preview (setPanelInset) so it isn't covered.
 * Simple literal edits write straight to source; non-literal ones go to chat.
 */
export default function PropPanel({
  root,
  inspection,
  onChange,
  onSeedPrompt,
  onClose
}: Props): React.JSX.Element {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const source = inspection.source

  // Reserve the right-edge strip while the panel is open.
  useEffect(() => {
    window.api.preview.setPanelInset(PANEL_WIDTH)
    return () => window.api.preview.setPanelInset(0)
  }, [])

  const reload = (): void => {
    window.api.props.inspect(root, source).then((res) => res && onChange(res))
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
        onChange({
          ...inspection,
          fields: inspection.fields.map((f) =>
            f.name === field.name ? { ...f, value, expression: false } : f
          )
        })
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
    /* Sits INSIDE the preview card's body: below the previewbar (titlebar 38 +
       bar 40+1px border + 10px body padding = 51) and inset 21px from the
       window's right/bottom (10px pane gutter + 1px card border + 10px body
       padding) — flush against the native view, which setPanelInset shrinks by
       exactly this panel's width. Never overlaps the previewbar controls. */
    <aside
      className="proppanel fixed bottom-[21px] right-[21px] top-[calc(var(--titlebar-h)+51px)] z-50 flex w-80 flex-col rounded-lg border bg-background shadow-[-4px_0_18px_rgba(0,0,0,0.08)]"
      aria-label={`Props for ${inspection.component}`}
    >
      <header className="proppanel__head flex shrink-0 items-start gap-2 border-b px-3.5 py-3">
        <div className="proppanel__id min-w-0">
          <div className="proppanel__title font-mono text-sm font-semibold text-blue-600">
            {inspection.component}
          </div>
          <div className="proppanel__source overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[11px] text-muted-foreground">
            {source}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="proppanel__close ml-auto"
          onClick={onClose}
          aria-label="Close panel"
        >
          ✕
        </Button>
      </header>
      <div className="proppanel__hint mx-3.5 mt-1.5 text-[11px] text-muted-foreground">
        Literal edits apply instantly to source — others go to chat.
      </div>
      {error && <div className="proppanel__error mx-3.5 mt-2 text-[11.5px] text-red-700">{error}</div>}
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
