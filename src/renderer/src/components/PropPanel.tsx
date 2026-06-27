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

  return (
    <aside
      className="proppanel fixed bottom-0 right-0 top-[var(--titlebar-h)] z-50 flex w-80 flex-col border-l bg-background shadow-[-4px_0_18px_rgba(0,0,0,0.08)]"
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
  onAskAgent
}: {
  field: PropField
  busy: boolean
  onApply: (v: string | number | boolean) => void
  onAskAgent: () => void
}): React.JSX.Element {
  const [draft, setDraft] = useState(field.value ?? '')
  useEffect(() => setDraft(field.value ?? ''), [field.value])

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
      <span
        className="proppanel__name overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[12.5px]"
        title={field.description}
      >
        {field.name}
        {field.required && <span className="proppanel__req ml-0.5 text-red-700">*</span>}
      </span>
      {control}
      {field.description && (
        <span className="proppanel__desc col-span-full text-[11px] leading-snug text-muted-foreground">
          {field.description}
        </span>
      )}
    </div>
  )
}
