import { useEffect, useState } from 'react'
import type { PropField, PropInspection } from '../../../shared/api'

/** Kept in sync with the .proppanel width in styles.css and the reserved inset. */
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
    <aside className="proppanel" aria-label={`Props for ${inspection.component}`}>
      <header className="proppanel__head">
        <div className="proppanel__id">
          <div className="proppanel__title">{inspection.component}</div>
          <div className="proppanel__source">{source}</div>
        </div>
        <button className="proppanel__close" onClick={onClose} aria-label="Close panel">
          ✕
        </button>
      </header>
      {error && <div className="proppanel__error">{error}</div>}
      {inspection.note && <div className="proppanel__note">{inspection.note}</div>}
      <div className="proppanel__rows">
        {inspection.fields.length === 0 && <div className="proppanel__note">No editable props.</div>}
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
      <button className="proppanel__agent" onClick={onAskAgent} disabled={busy}>
        edit via chat
      </button>
    )
  } else if (field.kind === 'boolean') {
    control = (
      <input
        type="checkbox"
        checked={field.value === true}
        disabled={busy}
        onChange={(e) => onApply(e.target.checked)}
      />
    )
  } else if (field.kind === 'enum' && field.options) {
    control = (
      <select
        className="select"
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
      <input
        className="proppanel__input"
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
    <div className="proppanel__row">
      <span className="proppanel__name" title={field.description}>
        {field.name}
        {field.required && <span className="proppanel__req">*</span>}
      </span>
      {control}
      {field.description && <span className="proppanel__desc">{field.description}</span>}
    </div>
  )
}
