interface Props {
  scaffolding: boolean
  status: string | null
  onAccept: () => void
  onDismiss: () => void
}

/**
 * First-run offer shown when a project exposes no design tokens (no
 * `.dsgn/tokens.json`, Tailwind theme, or CSS custom properties). Accepting
 * writes a starter `.dsgn/tokens.json` — a deterministic file write, no agent —
 * which then becomes the editable, canonical token source for the palette.
 */
export default function TokenOfferCard({
  scaffolding,
  status,
  onAccept,
  onDismiss
}: Props): React.JSX.Element {
  return (
    <div className="setup" role="region" aria-label="Design tokens">
      <div className="setup__title">Add a starter design-token palette?</div>
      <div className="setup__body">
        This project has no design tokens yet. I can create an editable{' '}
        <code>.dsgn/tokens.json</code> with starter colors, spacing, and radii — then you can apply
        them from the inspector and tune them to your brand.
      </div>
      {status && <div className="setup__status">{status}</div>}
      <div className="setup__actions">
        <button className="setup__no" onClick={onDismiss} disabled={scaffolding}>
          Not now
        </button>
        <button className="setup__yes" onClick={onAccept} disabled={scaffolding}>
          {scaffolding ? 'Adding…' : 'Add tokens'}
        </button>
      </div>
    </div>
  )
}
