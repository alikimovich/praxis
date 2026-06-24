import { useEffect, useState } from 'react'
import type { PropField, PropInspection } from '../../../shared/api'

interface Props {
  root: string
  source: string
  /** Seed a chat prompt for changes that can't be applied as a literal. */
  onSeedPrompt: (text: string) => void
}

/**
 * Inspects the selected element's props (via react-docgen + the source AST) and
 * renders typed controls. Simple literal edits are written straight to source
 * (instant hot-reload); anything non-literal is handed to the chat agent.
 */
export default function PropEditor({ root, source, onSeedPrompt }: Props): React.JSX.Element {
  const [inspection, setInspection] = useState<PropInspection | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    setLoading(true)
    setInspection(null)
    setError(null)
    window.api.props
      .inspect(root, source)
      .then((res) => live && setInspection(res))
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [root, source])

  // Re-read from disk — used to reset the controls when an edit didn't land.
  const reload = (): void => {
    window.api.props.inspect(root, source).then((res) => res && setInspection(res))
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
        // Reflect the new value locally; the preview hot-reloads from the file write.
        setInspection((cur) =>
          cur
            ? {
                ...cur,
                fields: cur.fields.map((f) =>
                  f.name === field.name ? { ...f, value, expression: false } : f
                )
              }
            : cur
        )
      } else if (res.needsAgent) {
        onSeedPrompt(res.agentPrompt ?? `In ${source}, change the ${field.name} prop.`)
      } else {
        // Write/resolve failure — surface it and reset the control to the file's value.
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

  if (loading) return <div className="propedit propedit--empty">Reading props…</div>
  if (!inspection) {
    return <div className="propedit propedit--empty">No source mapping for this element.</div>
  }

  return (
    <div className="propedit">
      {error && <div className="propedit__error">{error}</div>}
      {inspection.note && <div className="propedit__note">{inspection.note}</div>}
      {inspection.fields.length === 0 && (
        <div className="propedit__note">No editable props found.</div>
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

  const label = (
    <span className="propedit__name" title={field.description}>
      {field.name}
      {field.required && <span className="propedit__req">*</span>}
    </span>
  )

  let control: React.JSX.Element
  if (field.expression || field.kind === 'other') {
    control = (
      <button className="propedit__agent" onClick={onAskAgent} disabled={busy}>
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
        className="propedit__input"
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
    <div className="propedit__row">
      {label}
      {control}
    </div>
  )
}
