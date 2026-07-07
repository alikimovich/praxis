import { useEffect, useRef, useState } from 'react'
import type { PanelState } from '../../../shared/api'
import PropPanel from './PropPanel'

/**
 * Root of the floating prop-panel island (the ?dsgnPanel=1 renderer instance —
 * a WebContentsView stacked above the native preview). Stateless: renders
 * whatever the main renderer pushes over panel:state, relays user actions
 * back, and reports its natural height so the view can be sized to fit.
 */
export default function PanelApp(): React.JSX.Element | null {
  const [state, setState] = useState<PanelState | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => window.api.panel.onState(setState), [])

  // Report content height (includes the shadow padding) whenever it changes.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const report = (): void =>
      window.api.panel.reportHeight(Math.ceil(el.getBoundingClientRect().height))
    report()
    const ro = new ResizeObserver(report)
    ro.observe(el)
    return () => ro.disconnect()
  }, [state === null])

  if (!state) return null
  return (
    /* p-3 = room for the card's drop shadow inside the transparent view rect. */
    <div ref={ref} className="panelapp p-3">
      <PropPanel
        variant="overlay"
        root={state.root}
        element={state.element}
        inspection={state.inspection}
        inspecting={state.inspecting}
        onChange={(next) => window.api.panel.action({ kind: 'inspection', inspection: next })}
        onSeedPrompt={(text) => window.api.panel.action({ kind: 'seed', text })}
        onSetup={() => window.api.panel.action({ kind: 'setup' })}
        onSelectOwner={() => window.api.panel.action({ kind: 'owner' })}
        onToggleDock={() => window.api.panel.action({ kind: 'dock' })}
        onClose={() => window.api.panel.action({ kind: 'close' })}
      />
    </div>
  )
}
