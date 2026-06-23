import type { SelectedElement } from '../../../shared/api'

/** A couple of the captured computed styles, shown as quick chips. */
const STYLE_CHIPS: { key: string; label: string }[] = [
  { key: 'color', label: 'color' },
  { key: 'background-color', label: 'bg' },
  { key: 'font-size', label: 'size' },
  { key: 'padding', label: 'pad' }
]

interface Props {
  element: SelectedElement
  /** Seed a change request for this element into the composer. */
  onAsk: () => void
  onClear: () => void
}

/**
 * The selection inspector — appears above the composer once the user clicks an
 * element in the live preview. It shows what was picked (and, crucially, whether
 * we resolved a source location), then hands off to the chat with one click.
 */
export default function Inspector({ element, onAsk, onClear }: Props): React.JSX.Element {
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

      <div className="inspector__chips">
        {STYLE_CHIPS.map(({ key, label }) =>
          element.styles[key] ? (
            <span key={key} className="inspector__chip" title={`${key}: ${element.styles[key]}`}>
              {label}: {element.styles[key]}
            </span>
          ) : null
        )}
      </div>

      <button className="inspector__ask" onClick={onAsk}>
        Ask dsgn to change this…
      </button>
    </div>
  )
}
