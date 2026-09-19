import { useState } from 'react'
import {
  readProjectUiPreference,
  writeProjectUiPreference,
  readProjectUiEngine,
  writeProjectUiEngine
} from '../project-ui-preference'

export default function ProjectUiSetting(): React.JSX.Element {
  const [enabled, setEnabled] = useState(readProjectUiPreference)
  const [engine, setEngine] = useState(readProjectUiEngine)
  const [error, setError] = useState('')
  return (
    <section className="flex flex-col gap-2 rounded-xl border bg-background/50 p-4">
      <label className="flex cursor-pointer items-center justify-between gap-4 font-medium">
        Use project components
        <input
          type="checkbox"
          role="switch"
          aria-checked={enabled}
          aria-describedby="project-ui-description"
          checked={enabled}
          onChange={(event) => {
            try {
              writeProjectUiPreference(event.target.checked)
              setEnabled(event.target.checked)
              setError('')
            } catch {
              setError('Could not save this setting. Try again.')
            }
          }}
          className="size-4 accent-primary"
        />
      </label>
      <p id="project-ui-description" className="text-base leading-snug text-muted-foreground">
        Compose React UI from your project’s existing components and styles. Experimental; works
        with Claude and Codex. Applies to new messages on this device. Turning it off keeps
        generated files and returns to ordinary editing.
      </p>
      {enabled && (
        <label className="flex flex-col gap-2 font-medium">
          UI composition engine
          <select
            aria-label="UI composition engine"
            value={engine}
            className="rounded-md border bg-background p-2 text-foreground"
            onChange={(event) => {
              const next = event.target.value === 'jev' ? 'jev' : 'agent'
              try {
                writeProjectUiEngine(next)
                setEngine(next)
                setError('')
              } catch {
                setError('Could not save this setting. Try again.')
              }
            }}
          >
            <option value="agent">Current chat model</option>
            <option value="jev">Jev (experimental)</option>
          </select>
          {engine === 'jev' && (
            <span className="text-base font-normal text-muted-foreground">
              Your chat model prepares content; Jev chooses the composition. Requires a Vercel AI
              Gateway key configured in Praxis. Sends the UI request and component candidates to
              Jev.
            </span>
          )}
        </label>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  )
}
