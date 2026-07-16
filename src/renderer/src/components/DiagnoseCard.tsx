import { useDiagnosis } from '../store'

/**
 * Propose-first fix card for an open/launch failure. dsgn shows the AI's
 * diagnosis + steps; the user applies the repo fix or copies the host commands.
 * Nothing runs automatically.
 */
export default function DiagnoseCard({
  onApply,
  onDismiss
}: {
  onApply: () => void
  onDismiss: () => void
}): React.JSX.Element | null {
  const diagnosis = useDiagnosis((s) => s.current)
  const busy = useDiagnosis((s) => s.busy)
  if (!busy && !diagnosis) return null

  if (busy && !diagnosis) {
    return (
      <div className="diag">
        <div className="diag__busy">Diagnosing the problem…</div>
      </div>
    )
  }
  if (!diagnosis) return null
  const hasRepoFix = diagnosis.steps.some((s) => s.scope === 'repo')

  return (
    <div className="diag">
      <div className="diag__title">
        Praxis diagnosed this{diagnosis.seenBefore ? ' · seen before on this machine' : ''}
      </div>
      <div className="diag__summary">{diagnosis.summary}</div>
      {diagnosis.detail && <div className="diag__detail">{diagnosis.detail}</div>}
      <ol className="diag__steps">
        {diagnosis.steps.map((s, i) => (
          <li key={i} className="diag__step">
            <span className={`diag__scope diag__scope--${s.scope}`}>{s.scope}</span>
            <span className="diag__text">{s.text}</span>
            {s.command && (
              <div className="diag__cmd">
                <code>{s.command}</code>
                <button
                  className="diag__copy"
                  onClick={() => void navigator.clipboard.writeText(s.command ?? '')}
                >
                  Copy
                </button>
              </div>
            )}
          </li>
        ))}
      </ol>
      <div className="diag__actions">
        {hasRepoFix && (
          <button className="btn" onClick={onApply}>
            Apply repo fix
          </button>
        )}
        <button className="btn btn--ghost" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </div>
  )
}
