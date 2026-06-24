interface Props {
  busy: boolean
  status: string | null
  onAccept: () => void
  onStop: () => void
  onDismiss: () => void
}

/**
 * The on-open "make this project dsgn-ready" dialogue. Shown when the previewed
 * app has no `data-dsgn-source` stamps — so dsgn can't map elements to source
 * and prop editing is unavailable. Accepting writes the dev-only stamping plugin
 * (deterministic) and asks the agent to wire it in + type the components.
 */
export default function SetupCard({
  busy,
  status,
  onAccept,
  onStop,
  onDismiss
}: Props): React.JSX.Element {
  return (
    <div className="setup" role="region" aria-label="Project setup">
      <div className="setup__title">Set this project up for visual editing?</div>
      <div className="setup__body">
        Its elements aren’t source-mapped yet, so dsgn can only suggest changes via chat. I can
        add a dev-only source-stamping plugin and have the agent type your components so you can
        edit props directly.
      </div>
      {status && <div className="setup__status">{status}</div>}
      <div className="setup__actions">
        <button className="setup__no" onClick={onDismiss} disabled={busy}>
          Not now
        </button>
        {busy ? (
          <button className="setup__yes setup__yes--stop" onClick={onStop}>
            <span className="setup__spinner" aria-hidden="true" />
            Stop
          </button>
        ) : (
          <button className="setup__yes" onClick={onAccept}>
            Set it up
          </button>
        )}
      </div>
    </div>
  )
}
